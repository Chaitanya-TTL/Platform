import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.DestinationDataEventListener;
import com.sap.conn.jco.ext.DestinationDataProvider;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public class SapMaterialCatalogExtractor {
    private static final String DESTINATION_NAME = "S4H_DESTINATION";
    private static final String CONFIG_FILE = "config/sap.properties";
    private static final String FUNCTION_NAME = "BAPI_MATERIAL_GETLIST";

    public static void main(String[] args) {
        String prefix = argument(args, 0, "");
        int maxRows = parseNonNegativeInt(argument(args, 1, "0"), 0);
        String outputDirectory = argument(args, 2, "runtime/catalog/manual");

        try {
            Properties properties = loadProperties();
            if (!com.sap.conn.jco.ext.Environment.isDestinationDataProviderRegistered()) {
                com.sap.conn.jco.ext.Environment.registerDestinationDataProvider(
                        new LocalDestinationProvider(properties));
            }

            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION_NAME);
            destination.ping();
            System.out.println("SAP connection established.");

            JCoFunction function = destination.getRepository().getFunction(FUNCTION_NAME);
            if (function == null) {
                throw new IllegalStateException(
                        FUNCTION_NAME + " was not found or is not visible to the SAP destination.");
            }

            setMaxRows(function.getImportParameterList(), maxRows);
            applyMaterialPrefix(function.getTableParameterList(), prefix);

            System.out.println("Executing " + FUNCTION_NAME + "...");
            function.execute(destination);

            JCoTable materials = requireMaterialList(function.getTableParameterList());
            List<String> warnings = readReturnMessages(function.getTableParameterList());
            LinkedHashMap<String, MaterialEntry> unique = readMaterials(materials);

            Path outputDir = Paths.get(outputDirectory).toAbsolutePath().normalize();
            Files.createDirectories(outputDir);
            Path jsonPath = outputDir.resolve("sap_material_catalog.json");
            Path csvPath = outputDir.resolve("sap_material_catalog.csv");

            String generatedAt = Instant.now().toString();
            writeJson(jsonPath, destination, generatedAt, prefix, maxRows, materials.getNumRows(), unique, warnings);
            writeCsv(csvPath, unique.values());

            System.out.println("SAP material catalog extraction completed successfully.");
            System.out.println("Raw rows returned: " + materials.getNumRows());
            System.out.println("Unique materials exported: " + unique.size());
            System.out.println("JSON output: " + jsonPath);
            System.out.println("CSV output: " + csvPath);
        } catch (Throwable error) {
            System.err.println("SAP material catalog extraction failed: " + error.getMessage());
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static void setMaxRows(JCoParameterList imports, int maxRows) {
        if (imports == null)
            return;
        for (String name : new String[] { "MAXROWS", "MAX_ROWS" }) {
            try {
                imports.setValue(name, maxRows);
                System.out.println(name + " = " + maxRows + (maxRows == 0 ? " (SAP default/unlimited behavior)" : ""));
                return;
            } catch (Exception ignored) {
            }
        }
        System.out.println("The SAP function has no MAXROWS import parameter; continuing without a limit parameter.");
    }

    private static void applyMaterialPrefix(
            JCoParameterList tables,
            String prefix) {
        if (tables == null) {
            throw new IllegalStateException(
                    "SAP table parameter list is unavailable.");
        }

        JCoTable selection = null;

        for (String name : new String[] {
                "MATNRSELECTION",
                "MATERIALSELECTION"
        }) {
            try {
                selection = tables.getTable(name);
            } catch (Exception ignored) {
            }

            if (selection != null) {
                break;
            }
        }

        if (selection == null) {
            throw new IllegalStateException(
                    "No material selection table exists in " + FUNCTION_NAME + ".");
        }

        String normalizedPrefix = prefix == null
                ? ""
                : prefix.trim();

        String pattern = normalizedPrefix.isEmpty() || "*".equals(normalizedPrefix)
                ? "*"
                : normalizedPrefix + "*";

        selection.appendRow();

        setTableValue(selection, "SIGN", "I");
        setTableValue(selection, "OPTION", "CP");
        setTableValue(selection, "MATNR_LOW", pattern);
        setTableValue(selection, "LOW", pattern);

        System.out.println("Material selection pattern: " + pattern);
    }

    private static void setTableValue(JCoTable table, String field, String value) {
        try {
            table.setValue(field, value);
        } catch (Exception ignored) {
        }
    }

    private static JCoTable requireMaterialList(JCoParameterList tables) {
        if (tables == null)
            throw new IllegalStateException("SAP table parameter list is unavailable.");
        for (String name : new String[] { "MATNRLIST", "MATERIALLIST", "MATERIAL_LIST" }) {
            try {
                JCoTable table = tables.getTable(name);
                if (table != null)
                    return table;
            } catch (Exception ignored) {
            }
        }
        List<String> available = new ArrayList<>();
        JCoListMetaData metadata = tables.getListMetaData();
        for (int i = 0; i < metadata.getFieldCount(); i++)
            available.add(metadata.getName(i));
        throw new IllegalStateException(
                "No recognized material output table was found. Available tables: " + String.join(", ", available));
    }

    private static LinkedHashMap<String, MaterialEntry> readMaterials(JCoTable table) {
        LinkedHashMap<String, MaterialEntry> unique = new LinkedHashMap<>();
        for (int i = 0; i < table.getNumRows(); i++) {
            table.setRow(i);
            String id = first(table, "MATERIAL", "MATERIAL_LONG", "MATNR", "MATERIAL_NUMBER");
            if (id.isEmpty())
                continue;
            String description = first(table, "MATL_DESC", "DESCRIPTION", "MAKTX", "MATERIALDESCRIPTION");
            unique.putIfAbsent(id, new MaterialEntry(id, description));
        }
        return unique;
    }

    private static List<String> readReturnMessages(JCoParameterList tables) {
        List<String> warnings = new ArrayList<>();
        if (tables == null)
            return warnings;
        try {
            JCoTable returns = tables.getTable("RETURN");
            if (returns == null)
                return warnings;
            for (int i = 0; i < returns.getNumRows(); i++) {
                returns.setRow(i);
                String type = first(returns, "TYPE");
                String code = first(returns, "CODE", "NUMBER");
                String message = first(returns, "MESSAGE");
                if (!message.isEmpty())
                    warnings.add((type + " " + code + " " + message).trim());
            }
        } catch (Exception ignored) {
        }
        return warnings;
    }

    private static String first(JCoRecord record, String... names) {
        for (String name : names) {
            try {
                String value = clean(record.getString(name));
                if (!value.isEmpty())
                    return value;
            } catch (Exception ignored) {
            }
        }
        return "";
    }

    private static void writeJson(Path path, JCoDestination destination, String generatedAt, String prefix,
            int maxRows, int rawRows, LinkedHashMap<String, MaterialEntry> materials,
            List<String> warnings) throws Exception {
        try (BufferedWriter writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
            writer.write("{");
            writer.write(field("systemId", destination.getAttributes().getSystemID()));
            writer.write("," + field("client", destination.getAttributes().getClient()));
            writer.write("," + field("generatedAt", generatedAt));
            writer.write("," + field("status", "complete"));
            writer.write(",\"filters\":{" + field("materialPrefix", prefix) + ",\"maxRows\":" + maxRows + "}");
            writer.write(",\"rawRowsReturned\":" + rawRows);
            writer.write(",\"totalMaterials\":" + materials.size());
            writer.write(",\"materials\":[");
            boolean first = true;
            for (MaterialEntry material : materials.values()) {
                if (!first)
                    writer.write(',');
                first = false;
                writer.write("{" + field("materialId", material.materialId) + ","
                        + field("description", material.description) + "}");
            }
            writer.write("],\"warnings\":[");
            for (int i = 0; i < warnings.size(); i++) {
                if (i > 0)
                    writer.write(',');
                writer.write("\"" + escape(warnings.get(i)) + "\"");
            }
            writer.write("]}");
        }
    }

    private static void writeCsv(Path path, Collection<MaterialEntry> materials) throws IOException {
        try (BufferedWriter writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
            writer.write("Material ID,Description");
            writer.newLine();
            for (MaterialEntry material : materials) {
                writer.write(csv(material.materialId));
                writer.write(',');
                writer.write(csv(material.description));
                writer.newLine();
            }
        }
    }

    private static String csv(String value) {
        String safe = value == null ? "" : value;
        return "\"" + safe.replace("\"", "\"\"") + "\"";
    }

    private static int parseNonNegativeInt(String value, int fallback) {
        try {
            return Math.max(0, Integer.parseInt(value));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String argument(String[] args, int index, String fallback) {
        return args != null && args.length > index && args[index] != null ? args[index].trim() : fallback;
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
        return value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private static Properties loadProperties() throws IOException {
        Properties properties = new Properties();
        try (FileInputStream input = new FileInputStream(CONFIG_FILE)) {
            properties.load(input);
        }
        for (String key : new String[] {
                DestinationDataProvider.JCO_ASHOST,
                DestinationDataProvider.JCO_SYSNR,
                DestinationDataProvider.JCO_CLIENT,
                DestinationDataProvider.JCO_USER,
                DestinationDataProvider.JCO_PASSWD
        }) {
            if (clean(properties.getProperty(key)).isEmpty())
                throw new IllegalStateException("Missing SAP configuration property: " + key);
        }
        return properties;
    }

    private static final class MaterialEntry {
        final String materialId;
        final String description;

        MaterialEntry(String materialId, String description) {
            this.materialId = materialId;
            this.description = description;
        }
    }

    private static final class LocalDestinationProvider implements DestinationDataProvider {
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
