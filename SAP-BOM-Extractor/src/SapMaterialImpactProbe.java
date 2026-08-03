import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public class SapMaterialImpactProbe {
    private static final String DESTINATION_NAME = "S4H_DESTINATION";
    private static final String CONFIG_FILE = "config/sap.properties";
    private static final String[][] CANDIDATES = {
        {"BAPI_MATERIAL_AVAILABILITY", "Material availability / ATP"},
        {"BAPI_MATERIAL_GET_DETAIL", "Material master detail"},
        {"BAPI_MATERIAL_GET_ALL", "Material master and valuation detail"},
        {"MB_READ_MATERIAL_STOCKS", "Material stock quantities"},
        {"MARD_SINGLE_READ", "Storage-location stock"},
        {"MBEW_SINGLE_READ", "Material valuation"},
        {"RFC_READ_TABLE", "Controlled table-read fallback"}
    };

    public static void main(String[] args) {
        String material = argument(args, 0, "PLM001008");
        String plant = argument(args, 1, "1001");
        String output = argument(args, 2, "sap_material_impact_probe.json");
        try {
            Properties properties = loadProperties();
            if (!Environment.isDestinationDataProviderRegistered())
                Environment.registerDestinationDataProvider(new LocalDestinationProvider(properties));
            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION_NAME);
            destination.ping();
            List<String> checks = new ArrayList<>();
            for (String[] candidate : CANDIDATES) checks.add(inspect(destination, candidate[0], candidate[1]));
            String json = "{" + field("materialId", material) + "," + field("plant", plant) + "," +
                field("systemId", destination.getAttributes().getSystemID()) + "," +
                field("client", destination.getAttributes().getClient()) + "," +
                field("generatedAt", Instant.now().toString()) + "," +
                "\"capabilities\":[" + String.join(",", checks) + "]," +
                "\"warnings\":[\"Availability confirms repository visibility only. Execute authorization and business-field usability must be validated before Phase 2.\"]}";
            Path outputPath = Paths.get(output).toAbsolutePath().normalize();
            if (outputPath.getParent() != null) Files.createDirectories(outputPath.getParent());
            Files.write(outputPath, json.getBytes(StandardCharsets.UTF_8));
            System.out.println("SAP capability probe completed: " + outputPath);
        } catch (Throwable error) {
            System.err.println("SAP capability probe failed: " + error.getMessage());
            error.printStackTrace(System.err); System.exit(1);
        }
    }

    private static String inspect(JCoDestination destination, String name, String purpose) {
        try {
            JCoFunction f = destination.getRepository().getFunction(name);
            if (f == null) return check(name,purpose,false,null,"Function not found or not visible to destination repository",null,null,null,null);
            return check(name,purpose,true,null,"Repository metadata available",
                names(f.getImportParameterList()), names(f.getExportParameterList()),
                names(f.getTableParameterList()), names(f.getChangingParameterList()));
        } catch (Throwable error) {
            return check(name,purpose,false,null,error.getClass().getSimpleName()+": "+clean(error.getMessage()),null,null,null,null);
        }
    }

    private static List<String> names(JCoParameterList list) {
        List<String> values = new ArrayList<>(); if (list == null) return values;
        JCoListMetaData metadata = list.getListMetaData();
        for (int i=0;i<metadata.getFieldCount();i++) values.add(metadata.getName(i));
        return values;
    }
    private static String check(String fn,String purpose,boolean available,Boolean authorized,String message,
        List<String> imports,List<String> exports,List<String> tables,List<String> structures) {
        return "{"+field("function",fn)+","+field("purpose",purpose)+",\"available\":"+available+","+
            "\"authorized\":"+(authorized==null?"null":authorized)+","+field("message",message)+","+
            array("imports",imports)+","+array("exports",exports)+","+array("tables",tables)+","+array("structures",structures)+"}";
    }
    private static String array(String name,List<String> values) {
        if(values==null) values=Collections.emptyList(); List<String> out=new ArrayList<>();
        for(String value:values) out.add("\""+escape(value)+"\"");
        return "\""+escape(name)+"\":["+String.join(",",out)+"]";
    }
    private static String argument(String[] args,int index,String fallback) { return args!=null&&args.length>index&&args[index]!=null&&!args[index].trim().isEmpty()?args[index].trim():fallback; }
    private static String field(String name,String value) { return "\""+escape(name)+"\":\""+escape(value)+"\""; }
    private static String clean(String value) { return value==null?"":value.trim(); }
    private static String escape(String value) { if(value==null)return ""; return value.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t"); }
    private static Properties loadProperties() throws Exception {
        Properties p=new Properties(); try(FileInputStream in=new FileInputStream(CONFIG_FILE)){p.load(in);} return p;
    }
    private static class LocalDestinationProvider implements DestinationDataProvider {
        private final Properties properties; LocalDestinationProvider(Properties p){properties=p;}
        public Properties getDestinationProperties(String name){return DESTINATION_NAME.equals(name)?properties:null;}
        public boolean supportsEvents(){return false;}
        public void setDestinationDataEventListener(DestinationDataEventListener listener){}
    }
}
