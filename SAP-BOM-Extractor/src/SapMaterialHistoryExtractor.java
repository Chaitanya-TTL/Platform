import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.DestinationDataEventListener;
import com.sap.conn.jco.ext.DestinationDataProvider;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public class SapMaterialHistoryExtractor {
    private static final String DESTINATION = "S4H_DESTINATION";
    private static final String CONFIG = "config/sap.properties";
    private static final int MATNR_LENGTH = 18;
    private static final int PAGE_SIZE = 500;

    public static void main(String[] args) {
        String query = arg(args, 0, "31");
        String plant = arg(args, 1, "1001");
        String storageLocation = arg(args, 2, "");
        String output = arg(args, 3, "runtime/impact/manual/material-history.json");
        List<String> warnings = new ArrayList<>();

        try {
            Properties properties = loadProperties();
            if (!com.sap.conn.jco.ext.Environment.isDestinationDataProviderRegistered()) {
                com.sap.conn.jco.ext.Environment.registerDestinationDataProvider(new Provider(properties));
            }
            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION);
            destination.ping();

            MaterialResolution resolved = resolveMaterial(destination, query);
            String material = resolved.internalMaterialId;

            List<Map<String, String>> stockRows = readAll(destination, "MARD",
                    new String[] {"MATNR","WERKS","LGORT","LABST","INSME","EINME","SPEME","UMLME","RETME"},
                    options(eq("MATNR", material), andEq("WERKS", plant), optionalAndEq("LGORT", storageLocation)), warnings);
            Map<String, String> valuation = firstRow(readAll(destination, "MBEW",
                    new String[] {"MATNR","BWKEY","BWTAR","LBKUM","SALK3","VPRSV","VERPR","STPRS","PEINH","BKLAS"},
                    options(eq("MATNR", material), andEq("BWKEY", plant)), warnings));

            List<Map<String, String>> movementRows = readAll(destination, "MATDOC",
                    new String[] {"MATNR","WERKS","LGORT","MBLNR","MJAHR","ZEILE","BUDAT","BLDAT","CPUDT","CPUTM","BWART","MENGE","MEINS","DMBTR","WAERS","SHKZG","AUFNR","EBELN","EBELP","TCODE2","BUKRS","GJAHR","PRCTR","GSBER"},
                    options(eq("MATNR", material), andEq("WERKS", plant), optionalAndEq("LGORT", storageLocation)), warnings);

            movementRows.sort(Comparator
                    .comparing((Map<String,String> r) -> first(r,"BUDAT"))
                    .thenComparing(r -> first(r,"CPUTM"))
                    .thenComparing(r -> first(r,"MBLNR"))
                    .thenComparing(r -> first(r,"ZEILE")));

            Map<String, List<Map<String, String>>> accountingByMaterialDocument = new LinkedHashMap<>();
            List<Map<String, String>> accountingRows = readAll(destination, "ACDOCA",
                    new String[] {"RLDNR","RBUKRS","GJAHR","BELNR","DOCLN","BLART","BUDAT","RACCT","DRCRK","HSL","RHCUR","WSL","RWCUR","MATNR","WERKS","MSL","RUNIT","AUFNR","PRCTR","RBUSA","SGTXT","AWTYP","AWREF","AWORG"},
                    options(eq("MATNR", material), andEq("WERKS", plant)), warnings);
            for (Map<String,String> row : accountingRows) {
                String sourceDoc = first(row,"AWREF");
                if (!sourceDoc.isEmpty()) accountingByMaterialDocument.computeIfAbsent(sourceDoc, k -> new ArrayList<>()).add(row);
            }

            BigDecimal runningQuantity = BigDecimal.ZERO;
            BigDecimal runningValue = BigDecimal.ZERO;
            List<Event> events = new ArrayList<>();
            for (Map<String,String> row : movementRows) {
                BigDecimal quantityDelta = signed(decimal(first(row,"MENGE")), first(row,"SHKZG"));
                BigDecimal valueDelta = signed(decimal(first(row,"DMBTR")), first(row,"SHKZG"));
                BigDecimal beforeQuantity = runningQuantity;
                BigDecimal beforeValue = runningValue;
                runningQuantity = runningQuantity.add(zero(quantityDelta));
                runningValue = runningValue.add(zero(valueDelta));
                Event event = new Event(row, beforeQuantity, runningQuantity, quantityDelta,
                        beforeValue, runningValue, valueDelta,
                        accountingByMaterialDocument.getOrDefault(first(row,"MBLNR"), Collections.emptyList()));
                events.add(event);
            }

            BigDecimal unrestricted = sum(stockRows,"LABST");
            BigDecimal currentPhysical = unrestricted.add(sum(stockRows,"INSME")).add(sum(stockRows,"EINME"))
                    .add(sum(stockRows,"SPEME")).add(sum(stockRows,"UMLME")).add(sum(stockRows,"RETME"));
            BigDecimal currentValuatedQty = decimal(first(valuation,"LBKUM"));
            BigDecimal currentValue = decimal(first(valuation,"SALK3"));
            Boolean quantityReconciled = currentValuatedQty == null ? null : runningQuantity.compareTo(currentValuatedQty) == 0;
            Boolean valueReconciled = currentValue == null ? null : runningValue.subtract(currentValue).abs().compareTo(new BigDecimal("0.01")) <= 0;

            Path path = Paths.get(output).toAbsolutePath().normalize();
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            Files.write(path, buildJson(destination, query, resolved, plant, storageLocation, stockRows,
                    valuation, events, accountingRows, runningQuantity, runningValue, currentPhysical,
                    currentValuatedQty, currentValue, quantityReconciled, valueReconciled, warnings)
                    .getBytes(StandardCharsets.UTF_8));

            System.out.println("SAP material history JSON created: " + path);
            System.out.println("Resolved: " + resolved.displayMaterialId + " - " + resolved.description);
            System.out.println("Material movements: " + events.size() + "; accounting lines: " + accountingRows.size());
            System.out.println("Historical net quantity: " + num(runningQuantity)
                    + "; current valuated quantity: " + nullableNum(currentValuatedQty));
            System.out.println("Historical net value: " + num(runningValue)
                    + "; current inventory value: " + nullableNum(currentValue));
        } catch (Throwable error) {
            System.err.println("SAP material history extraction failed: " + error.getMessage());
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static MaterialResolution resolveMaterial(JCoDestination destination, String query) throws Exception {
        String requested = clean(query);
        String candidate = internalMaterial(requested);
        List<Map<String,String>> mara = readAllStrict(destination,"MARA",new String[]{"MATNR"},
                options(eq("MATNR",candidate)));
        if (mara.size() == 1) {
            String matnr = first(mara.get(0),"MATNR");
            return new MaterialResolution(requested, matnr, externalMaterial(matnr), description(destination,matnr), "exact-material-number");
        }
        List<Map<String,String>> makt = readAllStrict(destination,"MAKT",new String[]{"MATNR","SPRAS","MAKTX"},
                options("SPRAS = 'E'", "AND MAKTX = '" + sql(requested) + "'"));
        LinkedHashMap<String,String> unique = new LinkedHashMap<>();
        for (Map<String,String> row : makt) unique.putIfAbsent(first(row,"MATNR"),first(row,"MAKTX"));
        unique.remove("");
        if (unique.isEmpty()) throw new Exception("No exact material number or exact English description matched: " + requested);
        if (unique.size() > 1) throw new Exception("Multiple materials have exact description '" + requested + "'. Use material number: " + String.join(", ", unique.keySet()));
        Map.Entry<String,String> match = unique.entrySet().iterator().next();
        return new MaterialResolution(requested, match.getKey(), externalMaterial(match.getKey()), match.getValue(), "exact-description");
    }

    private static String description(JCoDestination destination, String material) throws Exception {
        List<Map<String,String>> rows = readAllStrict(destination,"MAKT",new String[]{"MATNR","SPRAS","MAKTX"},
                options(eq("MATNR",material),"AND SPRAS = 'E'"));
        return rows.isEmpty() ? "" : first(rows.get(0),"MAKTX");
    }

    private static List<Map<String,String>> readAllStrict(JCoDestination destination, String table,
            String[] fields, List<String> filters) throws Exception {
        return readAllInternal(destination,table,fields,filters,null);
    }

    private static List<Map<String,String>> readAll(JCoDestination destination, String table,
            String[] fields, List<String> filters, List<String> warnings) {
        try { return readAllInternal(destination,table,fields,filters,warnings); }
        catch (Exception e) { warnings.add(table + " read unavailable: " + clean(e.getMessage())); return new ArrayList<>(); }
    }

    private static List<Map<String,String>> readAllInternal(JCoDestination destination, String table,
            String[] fields, List<String> filters, List<String> warnings) throws Exception {
        List<Map<String,String>> all = new ArrayList<>();
        int skip = 0;
        while (true) {
            JCoFunction function = destination.getRepository().getFunction("RFC_READ_TABLE");
            if (function == null) throw new Exception("RFC_READ_TABLE unavailable");
            set(function.getImportParameterList(),"QUERY_TABLE",table);
            set(function.getImportParameterList(),"DELIMITER","|");
            setInt(function.getImportParameterList(),"ROWCOUNT",PAGE_SIZE);
            setInt(function.getImportParameterList(),"ROWSKIPS",skip);
            JCoTable fieldTable=function.getTableParameterList().getTable("FIELDS");
            for(String field:fields){fieldTable.appendRow();fieldTable.setValue("FIELDNAME",field);}
            JCoTable optionTable=function.getTableParameterList().getTable("OPTIONS");
            for(String filter:filters){if(!clean(filter).isEmpty()){optionTable.appendRow();optionTable.setValue("TEXT",filter);}}
            function.execute(destination);
            JCoTable data=function.getTableParameterList().getTable("DATA");
            for(int i=0;i<data.getNumRows();i++){
                data.setRow(i); String[] values=data.getString("WA").split("\\|",-1);
                Map<String,String> row=new LinkedHashMap<>();
                for(int j=0;j<fields.length;j++) row.put(fields[j],j<values.length?clean(values[j]):"");
                all.add(row);
            }
            if(data.getNumRows()<PAGE_SIZE) break;
            skip += data.getNumRows();
            if(skip>100000) { if(warnings!=null) warnings.add(table+" pagination stopped after 100000 rows."); break; }
        }
        return all;
    }

    private static String buildJson(JCoDestination destination, String query, MaterialResolution r,
            String plant, String storageLocation, List<Map<String,String>> stockRows,
            Map<String,String> valuation, List<Event> events, List<Map<String,String>> accountingRows,
            BigDecimal historyQty, BigDecimal historyValue, BigDecimal currentPhysical,
            BigDecimal currentValuatedQty, BigDecimal currentValue, Boolean qtyReconciled,
            Boolean valueReconciled, List<String> warnings) throws JCoException {
        StringBuilder j=new StringBuilder("{");
        j.append(field("requestedInput",query)).append(',').append(field("resolutionMode",r.mode)).append(',');
        j.append("\"material\":{").append(field("materialId",r.displayMaterialId)).append(',')
          .append(field("internalMaterialId",r.internalMaterialId)).append(',').append(field("description",r.description))
          .append(',').append(field("plant",plant)).append(',').append(field("storageLocation",storageLocation)).append("},");
        j.append("\"currentState\":{").append("\"physicalStock\":").append(num(currentPhysical)).append(',')
          .append("\"valuatedQuantity\":").append(nullableNum(currentValuatedQty)).append(',')
          .append("\"inventoryValue\":").append(nullableNum(currentValue)).append(',')
          .append(field("priceControl",first(valuation,"VPRSV"))).append(',')
          .append("\"movingAveragePrice\":").append(nullableNum(first(valuation,"VERPR"))).append(',')
          .append("\"standardPrice\":").append(nullableNum(first(valuation,"STPRS"))).append(',')
          .append("\"priceUnit\":").append(nullableNum(first(valuation,"PEINH"))).append(',')
          .append(field("valuationClass",first(valuation,"BKLAS"))).append("},");
        j.append("\"historySummary\":{").append("\"movementCount\":").append(events.size()).append(',')
          .append("\"accountingLineCount\":").append(accountingRows.size()).append(',')
          .append("\"netQuantityDelta\":").append(num(historyQty)).append(',')
          .append("\"netInventoryValueDelta\":").append(num(historyValue)).append(',')
          .append("\"quantityReconciledToCurrentValuation\":").append(nullableBoolean(qtyReconciled)).append(',')
          .append("\"valueReconciledToCurrentInventory\":").append(nullableBoolean(valueReconciled)).append(',')
          .append(field("historicalBeforeAfterMethod","running reconstruction from all accessible MATDOC rows")).append("},");
        j.append("\"events\":[");
        for(int i=0;i<events.size();i++){if(i>0)j.append(',');j.append(events.get(i).json());}
        j.append("],\"storageLocations\":[");
        for(int i=0;i<stockRows.size();i++){if(i>0)j.append(',');j.append(mapJson(stockRows.get(i)));}
        j.append("],\"warnings\":[");
        for(int i=0;i<warnings.size();i++){if(i>0)j.append(',');j.append('"').append(esc(warnings.get(i))).append('"');}
        j.append("],").append(field("systemId",destination.getAttributes().getSystemID())).append(',')
          .append(field("client",destination.getAttributes().getClient())).append(',')
          .append(field("extractedAt",Instant.now().toString())).append('}');
        return j.toString();
    }

    private static class Event {
        final Map<String,String> row; final BigDecimal beforeQty,afterQty,qtyDelta,beforeValue,afterValue,valueDelta;
        final List<Map<String,String>> accounting;
        Event(Map<String,String> row, BigDecimal beforeQty, BigDecimal afterQty, BigDecimal qtyDelta,
              BigDecimal beforeValue, BigDecimal afterValue, BigDecimal valueDelta, List<Map<String,String>> accounting){
            this.row=row;this.beforeQty=beforeQty;this.afterQty=afterQty;this.qtyDelta=qtyDelta;
            this.beforeValue=beforeValue;this.afterValue=afterValue;this.valueDelta=valueDelta;this.accounting=accounting;
        }
        String json(){
            StringBuilder j=new StringBuilder("{");
            j.append(field("materialDocument",first(row,"MBLNR"))).append(',').append(field("documentYear",first(row,"MJAHR"))).append(',')
             .append(field("documentItem",first(row,"ZEILE"))).append(',').append(field("postingDate",date(first(row,"BUDAT")))).append(',')
             .append(field("documentDate",date(first(row,"BLDAT")))).append(',').append(field("createdDate",date(first(row,"CPUDT")))).append(',')
             .append(field("createdTime",time(first(row,"CPUTM")))).append(',').append(field("movementType",first(row,"BWART"))).append(',')
             .append(field("sourceTransaction",first(row,"TCODE2"))).append(',').append("\"quantityDelta\":").append(nullableNum(qtyDelta)).append(',')
             .append(field("unit",first(row,"MEINS"))).append(',').append("\"inventoryValueDelta\":").append(nullableNum(valueDelta)).append(',')
             .append(field("currency",first(row,"WAERS"))).append(',').append("\"beforeQuantity\":").append(num(beforeQty)).append(',')
             .append("\"afterQuantity\":").append(num(afterQty)).append(',').append("\"beforeInventoryValue\":").append(num(beforeValue)).append(',')
             .append("\"afterInventoryValue\":").append(num(afterValue)).append(',').append(field("plant",first(row,"WERKS"))).append(',')
             .append(field("storageLocation",first(row,"LGORT"))).append(',').append(field("productionOrder",externalNumber(first(row,"AUFNR")))).append(',')
             .append(field("purchaseOrder",first(row,"EBELN"))).append(',').append(field("purchaseOrderItem",first(row,"EBELP"))).append(',')
             .append(field("companyCode",first(row,"BUKRS"))).append(',').append(field("fiFiscalYear",first(row,"GJAHR"))).append(',')
             .append(field("profitCenter",externalNumber(first(row,"PRCTR")))).append(',').append(field("businessArea",first(row,"GSBER"))).append(',')
             .append("\"accountingDocuments\":").append(accountingJson(accounting)).append('}');
            return j.toString();
        }
    }

    private static String accountingJson(List<Map<String,String>> rows){
        LinkedHashMap<String,List<Map<String,String>>> docs=new LinkedHashMap<>();
        for(Map<String,String> r:rows){String key=first(r,"RBUKRS")+"|"+first(r,"BELNR")+"|"+first(r,"GJAHR");docs.computeIfAbsent(key,k->new ArrayList<>()).add(r);}
        StringBuilder j=new StringBuilder("[");int d=0;
        for(List<Map<String,String>> lines:docs.values()){
            if(d++>0)j.append(',');Map<String,String> h=lines.get(0);
            j.append('{').append(field("companyCode",first(h,"RBUKRS"))).append(',').append(field("accountingDocument",first(h,"BELNR"))).append(',')
             .append(field("fiscalYear",first(h,"GJAHR"))).append(',').append(field("documentType",first(h,"BLART"))).append(',')
             .append(field("postingDate",date(first(h,"BUDAT")))).append(',').append(field("ledger",first(h,"RLDNR"))).append(',').append("\"lines\":[");
            for(int i=0;i<lines.size();i++){if(i>0)j.append(',');Map<String,String> r=lines.get(i);
                j.append('{').append(field("line",first(r,"DOCLN"))).append(',').append(field("glAccount",externalNumber(first(r,"RACCT")))).append(',')
                 .append(field("debitCredit",first(r,"DRCRK"))).append(',').append("\"amount\":").append(sapNumber(first(r,"HSL"))).append(',')
                 .append(field("currency",first(r,"RHCUR"))).append(',').append("\"quantity\":").append(sapNumber(first(r,"MSL"))).append(',')
                 .append(field("unit",first(r,"RUNIT"))).append(',').append(field("productionOrder",externalNumber(first(r,"AUFNR")))).append(',')
                 .append(field("profitCenter",externalNumber(first(r,"PRCTR")))).append(',').append(field("businessArea",first(r,"RBUSA"))).append('}');}
            j.append("]}");
        }
        return j.append(']').toString();
    }

    private static List<String> options(String... values){List<String> r=new ArrayList<>();for(String v:values)if(!clean(v).isEmpty())r.add(v);return r;}
    private static String eq(String f,String v){return f+" = '"+sql(v)+"'";}
    private static String andEq(String f,String v){return "AND "+eq(f,v);}
    private static String optionalAndEq(String f,String v){return clean(v).isEmpty()?"":andEq(f,v);}
    private static Map<String,String> firstRow(List<Map<String,String>> rows){return rows.isEmpty()?new LinkedHashMap<>():rows.get(0);}
    private static String first(Map<String,String> row,String...keys){for(String k:keys){String v=clean(row.get(k));if(!v.isEmpty())return v;}return "";}
    private static BigDecimal sum(List<Map<String,String>> rows,String key){BigDecimal n=BigDecimal.ZERO;for(Map<String,String>r:rows)n=n.add(zero(decimal(first(r,key))));return n;}
    private static BigDecimal zero(BigDecimal v){return v==null?BigDecimal.ZERO:v;}
    private static BigDecimal signed(BigDecimal value,String indicator){if(value==null)return null;return "H".equalsIgnoreCase(clean(indicator))?value.abs().negate():value.abs();}
    private static BigDecimal decimal(String value){try{return new BigDecimal(clean(value).replace("-","").trim());}catch(Exception e){return null;}}
    private static String sapNumber(String value){String v=clean(value);if(v.isEmpty())return "null";boolean neg=v.endsWith("-");if(neg)v=v.substring(0,v.length()-1);try{BigDecimal n=new BigDecimal(v);if(neg)n=n.negate();return num(n);}catch(Exception e){return "null";}}
    private static String num(BigDecimal v){return v.stripTrailingZeros().toPlainString();}
    private static String nullableNum(BigDecimal v){return v==null?"null":num(v);}
    private static String nullableNum(String v){BigDecimal n=decimal(v);return n==null?"null":num(n);}
    private static String nullableBoolean(Boolean v){return v==null?"null":v.toString();}
    private static String internalMaterial(String v){String c=clean(v);return c.matches("\\d+")&&c.length()<MATNR_LENGTH?String.format("%"+MATNR_LENGTH+"s",c).replace(' ','0'):c;}
    private static String externalMaterial(String v){return externalNumber(v);}
    private static String externalNumber(String v){String c=clean(v);return c.matches("\\d+")?c.replaceFirst("^0+(?!$)",""):c;}
    private static String date(String v){String c=clean(v);return c.matches("\\d{8}")?c.substring(0,4)+"-"+c.substring(4,6)+"-"+c.substring(6,8):c;}
    private static String time(String v){String c=clean(v);return c.matches("\\d{6}")?c.substring(0,2)+":"+c.substring(2,4)+":"+c.substring(4,6):c;}
    private static String mapJson(Map<String,String> row){StringBuilder j=new StringBuilder("{");int i=0;for(Map.Entry<String,String>e:row.entrySet()){if(i++>0)j.append(',');j.append(field(e.getKey(),e.getValue()));}return j.append('}').toString();}
    private static void set(JCoParameterList p,String n,String v){if(p!=null)try{p.setValue(n,v);}catch(Exception ignored){}}
    private static void setInt(JCoParameterList p,String n,int v){if(p!=null)try{p.setValue(n,v);}catch(Exception ignored){}}
    private static String arg(String[] a,int i,String f){return a!=null&&a.length>i&&a[i]!=null&&!a[i].trim().isEmpty()?a[i].trim():f;}
    private static String sql(String v){return clean(v).replace("'","''");}
    private static String clean(String v){return v==null?"":v.trim();}
    private static String field(String n,String v){return "\""+esc(n)+"\":\""+esc(v)+"\"";}
    private static String esc(String v){return v==null?"":v.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t");}
    private static Properties loadProperties() throws Exception{Properties p=new Properties();try(FileInputStream in=new FileInputStream(CONFIG)){p.load(in);}return p;}

    private static class MaterialResolution{
        final String requested,internalMaterialId,displayMaterialId,description,mode;
        MaterialResolution(String requested,String internal,String display,String description,String mode){this.requested=requested;this.internalMaterialId=internal;this.displayMaterialId=display;this.description=description;this.mode=mode;}
    }
    private static class Provider implements DestinationDataProvider{
        private final Properties p;Provider(Properties p){this.p=p;}
        public Properties getDestinationProperties(String n){return DESTINATION.equals(n)?p:null;}
        public boolean supportsEvents(){return false;}
        public void setDestinationDataEventListener(DestinationDataEventListener l){}
    }
}
