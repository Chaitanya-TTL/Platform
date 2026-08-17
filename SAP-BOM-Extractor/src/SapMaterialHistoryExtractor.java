import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.*;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/**
 * Read-only operational trace for one SAP material.
 *
 * requested material -> MSEG movements -> MKPF headers -> BKPF/BSEG FI evidence
 *                                      -> best-effort CO/Material Ledger references
 *
 * Missing optional evidence produces warnings and never invents a relationship.
 */
public class SapMaterialHistoryExtractor {
    private static final String DESTINATION = "S4H_DESTINATION";
    private static final String CONFIG = "config/sap.properties";
    private static final int MATNR_LENGTH = 18;
    private static final int MAX_MOVEMENTS = 250;

    public static void main(String[] args) {
        String requested = arg(args, 0, "31");
        String plant = arg(args, 1, "1001");
        String output = arg(args, 2, "sap_material_history.json");
        String internal = internalMaterial(requested);
        List<String> warnings = new ArrayList<>();
        try {
            Properties properties = loadProperties();
            if (!Environment.isDestinationDataProviderRegistered()) {
                Environment.registerDestinationDataProvider(new Provider(properties));
            }
            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION);
            destination.ping();

            List<Map<String,String>> movements = readTable(destination, "MSEG",
                new String[]{"MBLNR","MJAHR","ZEILE","MATNR","WERKS","LGORT","BWART","SHKZG","MENGE","MEINS","DMBTR","AUFNR","GSBER","PRCTR","SAKTO"},
                options(eq("MATNR", internal), andEq("WERKS", plant)), MAX_MOVEMENTS, warnings);

            List<String> documents = new ArrayList<>();
            int movementCount = 0;
            for (Map<String,String> movement : movements) {
                String materialDocument = first(movement,"MBLNR");
                String materialYear = first(movement,"MJAHR");
                String item = first(movement,"ZEILE");
                if (materialDocument.isEmpty()) continue;
                movementCount++;
                Map<String,String> header = firstRow(readTable(destination,"MKPF",
                    new String[]{"MBLNR","MJAHR","BLDAT","BUDAT","CPUDT","CPUTM","TCODE","XBLNR","BKTXT"},
                    options(eq("MBLNR",materialDocument),andEq("MJAHR",materialYear)),1,warnings));
                Map<String,String> accountingHeader = findAccountingHeader(destination,materialDocument,materialYear,warnings);
                List<Map<String,String>> accountingLines = accountingHeader.isEmpty() ? Collections.emptyList() :
                    readTable(destination,"BSEG",
                        new String[]{"BUKRS","BELNR","GJAHR","BUZEI","HKONT","SHKZG","DMBTR","WRBTR","SGTXT","GSBER","PRCTR","AUFNR","MATNR"},
                        options(eq("BUKRS",first(accountingHeader,"BUKRS")),andEq("BELNR",first(accountingHeader,"BELNR")),andEq("GJAHR",first(accountingHeader,"GJAHR"))),100,warnings);
                enrichAccountNames(destination, accountingHeader, accountingLines, warnings);
                Map<String,String> coReference = findCoReference(destination,materialDocument,materialYear,warnings);
                Map<String,String> mlReference = findMaterialLedgerReference(destination,materialDocument,materialYear,warnings);

                String direction = direction(movement);
                BigDecimal quantity = decimal(first(movement,"MENGE"));
                BigDecimal value = decimal(first(movement,"DMBTR"));
                BigDecimal signedQuantity = signed(quantity,direction);
                BigDecimal signedValue = signed(value,direction);

                StringBuilder json = new StringBuilder("{");
                json.append(field("materialDocument",materialDocument)).append(',')
                    .append(field("materialDocumentYear",materialYear)).append(',')
                    .append(field("item",item)).append(',')
                    .append(field("movementType",first(movement,"BWART"))).append(',')
                    .append(field("movementDescription",movementDescription(first(movement,"BWART")))).append(',')
                    .append(field("direction",direction)).append(',')
                    .append("\"quantity\":").append(numOrNull(quantity)).append(',')
                    .append("\"signedQuantity\":").append(numOrNull(signedQuantity)).append(',')
                    .append(field("unit",first(movement,"MEINS"))).append(',')
                    .append("\"localAmount\":").append(numOrNull(value)).append(',')
                    .append("\"signedLocalAmount\":").append(numOrNull(signedValue)).append(',')
                    .append(field("currency",firstNonBlank(movement.get("WAERS"),accountingHeader.get("WAERS")))).append(',')
                    .append(field("plant",first(movement,"WERKS"))).append(',')
                    .append(field("storageLocation",first(movement,"LGORT"))).append(',')
                    .append(field("productionOrder",externalNumber(first(movement,"AUFNR")))).append(',')
                    .append(field("businessArea",first(movement,"GSBER"))).append(',')
                    .append(field("profitCenter",first(movement,"PRCTR"))).append(',')
                    .append(field("materialItemGlAccount",externalNumber(first(movement,"SAKTO")))).append(',')
                    .append(field("postingDate",first(header,"BUDAT"))).append(',')
                    .append(field("documentDate",first(header,"BLDAT"))).append(',')
                    .append(field("createdDate",first(header,"CPUDT"))).append(',')
                    .append(field("createdTime",first(header,"CPUTM"))).append(',')
                    .append(field("sourceTransaction",first(header,"TCODE"))).append(',')
                    .append("\"accountingDocument\":").append(accountingJson(accountingHeader,accountingLines)).append(',')
                    .append("\"controllingReference\":").append(referenceJson(coReference,"co")).append(',')
                    .append("\"materialLedgerReference\":").append(referenceJson(mlReference,"ml")).append(',')
                    .append(field("evidenceConfidence","confirmed"))
                    .append('}');
                documents.add(json.toString());
            }

            String status = movementCount == 0 ? "empty" : warnings.isEmpty() ? "complete" : "partial_success";
            Path path = Paths.get(output).toAbsolutePath().normalize();
            if (path.getParent()!=null) Files.createDirectories(path.getParent());
            String json = "{" + field("requestedMaterialId",requested) + "," + field("materialId",externalNumber(internal)) + "," +
                field("internalMaterialId",internal) + "," + field("plant",plant) + "," + field("status",status) + "," +
                "\"movements\":[" + String.join(",",documents) + "]," + warningsJson(warnings) + "," +
                field("extractedAt",Instant.now().toString()) + "}";
            Files.write(path,json.getBytes(StandardCharsets.UTF_8));
            System.out.println("SAP material history JSON created: " + path);
            System.out.println("Historical movements returned: " + movementCount);
        } catch (Throwable error) {
            System.err.println("SAP material history extraction failed: " + error.getMessage());
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }


    private static void enrichAccountNames(JCoDestination destination, Map<String,String> header, List<Map<String,String>> lines, List<String> warnings) {
        if(lines.isEmpty() || header.isEmpty()) return;
        Map<String,String> company=firstRow(readTable(destination,"T001",new String[]{"BUKRS","KTOPL"},options(eq("BUKRS",first(header,"BUKRS"))),1,warnings));
        String chart=first(company,"KTOPL");
        if(chart.isEmpty()) return;
        Map<String,String> names=new HashMap<>();
        for(Map<String,String> line:lines){
            String account=first(line,"HKONT");
            if(account.isEmpty()) continue;
            if(!names.containsKey(account)){
                Map<String,String> text=firstRow(readTable(destination,"SKAT",new String[]{"KTOPL","SAKNR","SPRAS","TXT20","TXT50"},options(eq("KTOPL",chart),andEq("SAKNR",account),"AND SPRAS = 'E'"),1,warnings));
                names.put(account,first(text,"TXT50","TXT20"));
            }
            line.put("ACCOUNT_NAME",names.getOrDefault(account,""));
        }
    }
    private static Map<String,String> findAccountingHeader(JCoDestination destination,String document,String year,List<String> warnings) {
        String reference=document+year;
        List<Map<String,String>> rows=readTable(destination,"BKPF",
            new String[]{"BUKRS","BELNR","GJAHR","BLART","BLDAT","BUDAT","MONAT","WAERS","AWTYP","AWKEY","TCODE"},
            options("AWTYP = 'MKPF'",andEq("AWKEY",reference)),10,warnings);
        if(rows.isEmpty()) rows=readTable(destination,"BKPF",
            new String[]{"BUKRS","BELNR","GJAHR","BLART","BLDAT","BUDAT","MONAT","WAERS","AWTYP","AWKEY","TCODE"},
            options("AWTYP = 'MKPF'","AND AWKEY LIKE '"+sql(reference)+"%'"),10,warnings);
        return firstRow(rows);
    }
    private static Map<String,String> findCoReference(JCoDestination destination,String document,String year,List<String> warnings) {
        List<Map<String,String>> rows=readTable(destination,"COBK",
            new String[]{"KOKRS","BELNR","GJAHR","VRGNG","AWTYP","AWORG","AWREF","REFBN","REFGJ"},
            options(eq("REFBN",document),andEq("REFGJ",year)),10,warnings);
        return firstRow(rows);
    }
    private static Map<String,String> findMaterialLedgerReference(JCoDestination destination,String document,String year,List<String> warnings) {
        List<Map<String,String>> rows=readTable(destination,"MLHD",
            new String[]{"KALNR","BELNR","KJAHR","AWTYP","AWREF","AWORG"},
            options(eq("AWREF",document),andEq("AWORG",year)),10,warnings);
        return firstRow(rows);
    }
    private static String accountingJson(Map<String,String> header,List<Map<String,String>> lines) {
        if(header.isEmpty()) return "{\"availability\":\"not-found\",\"lines\":[]}";
        List<String> out=new ArrayList<>();
        for(Map<String,String> line:lines) {
            String direction="H".equalsIgnoreCase(first(line,"SHKZG"))?"credit":"debit";
            BigDecimal amount=decimal(first(line,"DMBTR","WRBTR"));
            out.add("{"+field("lineItem",first(line,"BUZEI"))+","+field("glAccount",externalNumber(first(line,"HKONT")))+","+
                field("direction",direction)+",\"signedAmount\":"+numOrNull(signed(amount,direction))+","+
                field("currency",firstNonBlank(line.get("WAERS"),header.get("WAERS")))+","+field("text",first(line,"SGTXT"))+","+field("accountName",first(line,"ACCOUNT_NAME"))+","+
                field("businessArea",first(line,"GSBER"))+","+field("profitCenter",first(line,"PRCTR"))+","+
                field("productionOrder",externalNumber(first(line,"AUFNR")))+"}");
        }
        return "{"+field("availability","confirmed")+","+field("companyCode",first(header,"BUKRS"))+","+
            field("documentNumber",first(header,"BELNR"))+","+field("fiscalYear",first(header,"GJAHR"))+","+
            field("postingPeriod",first(header,"MONAT"))+","+field("currency",first(header,"WAERS"))+","+
            field("postingDate",first(header,"BUDAT"))+",\"lines\":["+String.join(",",out)+"]}";
    }
    private static String referenceJson(Map<String,String> row,String type) {
        if(row.isEmpty()) return "{\"availability\":\"not-found\",\"detailsVerified\":false}";
        String reference=type.equals("co")?first(row,"BELNR","AWREF","REFBN"):first(row,"AWREF","BELNR","KALNR");
        return "{"+field("availability","referenced")+","+field("reference",reference)+","+
            field("fiscalYear",first(row,"GJAHR","KJAHR","REFGJ"))+",\"detailsVerified\":false}";
    }
    private static List<Map<String,String>> readTable(JCoDestination destination,String table,String[] fields,List<String> options,int max,List<String> warnings) {
        List<Map<String,String>> rows=new ArrayList<>();
        try {
            JCoFunction function=destination.getRepository().getFunction("RFC_READ_TABLE");
            if(function==null) throw new Exception("RFC_READ_TABLE unavailable");
            set(function.getImportParameterList(),"QUERY_TABLE",table); set(function.getImportParameterList(),"DELIMITER","|");
            try { function.getImportParameterList().setValue("ROWCOUNT",Math.max(0,max)); } catch(Exception ignored) { }
            JCoTable f=function.getTableParameterList().getTable("FIELDS"); for(String name:fields){f.appendRow();f.setValue("FIELDNAME",name);}
            JCoTable o=function.getTableParameterList().getTable("OPTIONS"); for(String option:options){o.appendRow();o.setValue("TEXT",option);}
            function.execute(destination); JCoTable data=function.getTableParameterList().getTable("DATA");
            for(int r=0;r<data.getNumRows();r++){data.setRow(r);String[] values=data.getString("WA").split("\\|",-1);Map<String,String> row=new LinkedHashMap<>();for(int i=0;i<fields.length;i++)row.put(fields[i],i<values.length?clean(values[i]):"");rows.add(row);}
        } catch(Exception error) { warnings.add(table+" read unavailable: "+clean(error.getMessage())); }
        return rows;
    }
    private static String direction(Map<String,String> movement){String indicator=first(movement,"SHKZG");if("H".equalsIgnoreCase(indicator))return "credit";if("S".equalsIgnoreCase(indicator))return "debit";String type=first(movement,"BWART");return Arrays.asList("201","221","261","281","551","601").contains(type)?"credit":"debit";}
    private static String movementDescription(String type){Map<String,String> known=new HashMap<>();known.put("101","Goods receipt for order");known.put("261","Goods issue for order");known.put("561","Initial stock entry");return known.getOrDefault(type,"");}
    private static BigDecimal signed(BigDecimal value,String direction){if(value==null)return null;return "credit".equals(direction)?value.abs().negate():value.abs();}
    private static BigDecimal decimal(String value){try{return new BigDecimal(clean(value));}catch(Exception ignored){return null;}}
    private static String numOrNull(BigDecimal value){return value==null?"null":value.stripTrailingZeros().toPlainString();}
    private static List<String> options(String... values){return Arrays.asList(values);} private static String eq(String field,String value){return field+" = '"+sql(value)+"'";} private static String andEq(String field,String value){return "AND "+eq(field,value);} private static String sql(String value){return clean(value).replace("'","''");}
    private static String firstNonBlank(String... values){for(String value:values){if(!clean(value).isEmpty())return clean(value);}return "";} private static Map<String,String> firstRow(List<Map<String,String>> rows){return rows.isEmpty()?new LinkedHashMap<>():rows.get(0);} private static String first(Map<String,String> values,String... keys){for(String key:keys){String value=clean(values.get(key));if(!value.isEmpty())return value;}return "";}
    private static String arg(String[] args,int i,String fallback){return args!=null&&args.length>i&&args[i]!=null&&!args[i].trim().isEmpty()?args[i].trim():fallback;}
    private static String internalMaterial(String value){String v=clean(value);return v.matches("\\d+")&&v.length()<MATNR_LENGTH?String.format("%"+MATNR_LENGTH+"s",v).replace(' ','0'):v;}
    private static String externalNumber(String value){String v=clean(value);return v.matches("\\d+")?v.replaceFirst("^0+(?!$)",""):v;}
    private static String field(String name,String value){return "\""+esc(name)+"\":\""+esc(value)+"\"";} private static String clean(String value){return value==null?"":value.trim();} private static String esc(String value){return clean(value).replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r");}
    private static String warningsJson(List<String> warnings){List<String> rows=new ArrayList<>();for(String warning:warnings)rows.add("\""+esc(warning)+"\"");return "\"warnings\":["+String.join(",",rows)+"]";}
    private static void set(JCoParameterList list,String name,String value){if(list==null)return;try{list.setValue(name,value);}catch(Exception ignored){}}
    private static Properties loadProperties() throws Exception {Properties p=new Properties();try(FileInputStream input=new FileInputStream(CONFIG)){p.load(input);}return p;}
    private static class Provider implements DestinationDataProvider {private final Properties p;Provider(Properties p){this.p=p;}public Properties getDestinationProperties(String name){return DESTINATION.equals(name)?p:null;}public boolean supportsEvents(){return false;}public void setDestinationDataEventListener(DestinationDataEventListener listener){}}
}
