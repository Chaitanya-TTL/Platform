import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

import org.omg.CORBA.Environment;

public class SapMaterialImpactExecutionProbe {
    private static final String DESTINATION_NAME = "S4H_DESTINATION";
    private static final String CONFIG_FILE = "config/sap.properties";
    private static final int MAX_TABLE_ROWS = 10;

    public static void main(String[] args) {
        String material = argument(args, 0, "PLM001008");
        String plant = argument(args, 1, "1001");
        String output = argument(args, 2, "sap_material_impact_execution.json");
        try {
            Properties properties = loadProperties();
            if (!com.sap.conn.jco.ext.Environment.isDestinationDataProviderRegistered()) {
                com.sap.conn.jco.ext.Environment.registerDestinationDataProvider(
                        new LocalDestinationProvider(properties));
            }
            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION_NAME);
            destination.ping();

            List<String> results = new ArrayList<>();
            results.add(executeGetDetail(destination, material, plant));
            results.add(executeGetAll(destination, material, plant));
            results.add(executeAvailability(destination, material, plant));

            String json = "{" + field("materialId", material) + "," + field("plant", plant) + "," +
                    field("systemId", destination.getAttributes().getSystemID()) + "," +
                    field("client", destination.getAttributes().getClient()) + "," +
                    field("generatedAt", Instant.now().toString()) + "," +
                    "\"executions\":[" + String.join(",", results) + "]," +
                    "\"notes\":[\"Only standard read-oriented BAPIs were executed. Internal MARD/MBEW functions and RFC_READ_TABLE were not executed by this validation probe.\",\"ATP availability is not automatically treated as physical unrestricted stock.\"]}";
            Path outputPath = Paths.get(output).toAbsolutePath().normalize();
            if (outputPath.getParent() != null)
                Files.createDirectories(outputPath.getParent());
            Files.write(outputPath, json.getBytes(StandardCharsets.UTF_8));
            System.out.println("SAP material impact execution probe completed: " + outputPath);
        } catch (Throwable error) {
            System.err.println("SAP material impact execution probe failed: " + error.getMessage());
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static String executeGetDetail(JCoDestination destination, String material, String plant) {
        return execute(destination, "BAPI_MATERIAL_GET_DETAIL", function -> {
            setIfPresent(function.getImportParameterList(), "MATERIAL", material);
            setIfPresent(function.getImportParameterList(), "PLANT", plant);
            setIfPresent(function.getImportParameterList(), "VALUATIONAREA", plant);
        });
    }

    private static String executeGetAll(JCoDestination destination, String material, String plant) {
        return execute(destination, "BAPI_MATERIAL_GET_ALL", function -> {
            setIfPresent(function.getImportParameterList(), "MATERIAL", material);
            setIfPresent(function.getImportParameterList(), "PLANT", plant);
            setIfPresent(function.getImportParameterList(), "VAL_AREA", plant);
            setIfPresent(function.getImportParameterList(), "KZRFB_ALL", "X");
        });
    }

    private static String executeAvailability(JCoDestination destination, String material, String plant) {
        return execute(destination, "BAPI_MATERIAL_AVAILABILITY", function -> {
            setIfPresent(function.getImportParameterList(), "MATERIAL", material);
            setIfPresent(function.getImportParameterList(), "PLANT", plant);
        });
    }

    private static String execute(JCoDestination destination, String name, Configurer configurer) {
        long started = System.currentTimeMillis();
        try {
            JCoFunction function = destination.getRepository().getFunction(name);
            if (function == null)
                return execution(name, false, false, "Function unavailable", 0, "{}", "{}");
            configurer.configure(function);
            function.execute(destination);
            String exports = parameterListJson(function.getExportParameterList());
            String tables = tablesJson(function.getTableParameterList());
            return execution(name, true, true, "Execution completed", System.currentTimeMillis() - started, exports,
                    tables);
        } catch (JCoException error) {
            return execution(name, true, false, error.getKey() + ": " + clean(error.getMessage()),
                    System.currentTimeMillis() - started, "{}", "{}");
        } catch (Throwable error) {
            return execution(name, true, false, error.getClass().getSimpleName() + ": " + clean(error.getMessage()),
                    System.currentTimeMillis() - started, "{}", "{}");
        }
    }

    private static String execution(String function, boolean available, boolean executed, String message,
            long durationMs, String exports, String tables) {
        return "{" + field("function", function) + ",\"available\":" + available + ",\"executed\":" + executed +
                ",\"durationMs\":" + durationMs + "," + field("message", message) + ",\"exports\":" + exports
                + ",\"tables\":" + tables + "}";
    }

    private static String parameterListJson(JCoParameterList list) {
        if (list == null)
            return "{}";
        List<String> values = new ArrayList<>();
        JCoListMetaData metadata = list.getListMetaData();
        for (int i = 0; i < metadata.getFieldCount(); i++) {
            String name = metadata.getName(i);
            Object value = list.getValue(name);
            String json = valueJson(value);
            if (!"null".equals(json) && !"\"\"".equals(json) && !"{}".equals(json) && !"[]".equals(json))
                values.add("\"" + escape(name) + "\":" + json);
        }
        return "{" + String.join(",", values) + "}";
    }

    private static String tablesJson(JCoParameterList list) {
        if (list == null)
            return "{}";
        List<String> values = new ArrayList<>();
        JCoListMetaData metadata = list.getListMetaData();
        for (int i = 0; i < metadata.getFieldCount(); i++) {
            String name = metadata.getName(i);
            JCoTable table = list.getTable(name);
            if (table == null)
                continue;
            List<String> rows = new ArrayList<>();
            int limit = Math.min(table.getNumRows(), MAX_TABLE_ROWS);
            for (int row = 0; row < limit; row++) {
                table.setRow(row);
                rows.add(recordJson(table));
            }
            values.add("\"" + escape(name) + "\":{\"rowCount\":" + table.getNumRows() + ",\"sampleRows\":["
                    + String.join(",", rows) + "]}");
        }
        return "{" + String.join(",", values) + "}";
    }

    private static String valueJson(Object value) {
        if (value == null)
            return "null";
        if (value instanceof JCoStructure)
            return recordJson((JCoStructure) value);
        if (value instanceof JCoTable)
            return "[]";
        return "\"" + escape(clean(String.valueOf(value))) + "\"";
    }

    private static String recordJson(JCoRecord record) {
        List<String> fields = new ArrayList<>();
        JCoFieldIterator iterator = record.getFieldIterator();

        while (iterator.hasNextField()) {
            JCoField field = iterator.nextField();
            String name = field.getName();
            String value;

            try {
                value = clean(record.getString(name));
            } catch (Exception ignored) {
                continue;
            }

            if (!value.isEmpty()) {
                fields.add(
                        "\"" + escape(name) + "\":\"" + escape(value) + "\"");
            }
        }

        return "{" + String.join(",", fields) + "}";
    }

    private static void setIfPresent(JCoParameterList list, String name, String value) {
        if (list == null || value == null || value.trim().isEmpty())
            return;
        try {
            list.setValue(name, value);
        } catch (Exception ignored) {
        }
    }

    private static Properties loadProperties() throws Exception {
        Properties properties = new Properties();
        try (FileInputStream input = new FileInputStream(CONFIG_FILE)) {
            properties.load(input);
        }
        return properties;
    }

    private static String argument(String[] args, int index, String fallback) {
        return args != null && args.length > index && args[index] != null && !args[index].trim().isEmpty()
                ? args[index].trim()
                : fallback;
    }

    private static String field(String name, String value) {
        return "\"" + escape(name) + "\":\"" + escape(value) + "\"";
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static String escape(String value) {
        if (value == null)
            return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t",
                "\\t");
    }

    private interface Configurer {
        void configure(JCoFunction function);
    }

    private static class LocalDestinationProvider implements DestinationDataProvider {
        private final Properties properties;

        LocalDestinationProvider(Properties properties) {
            this.properties = properties;
        }

        public Properties getDestinationProperties(String name) {
            return DESTINATION_NAME.equals(name) ? properties : null;
        }

        public boolean supportsEvents() {
            return false;
        }

        public void setDestinationDataEventListener(DestinationDataEventListener listener) {
        }
    }
}
