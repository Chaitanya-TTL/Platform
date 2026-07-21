import com.sap.conn.jco.JCoDestination;
import com.sap.conn.jco.JCoDestinationManager;
import com.sap.conn.jco.JCoFunction;
import com.sap.conn.jco.JCoParameterList;
import com.sap.conn.jco.JCoTable;
import com.sap.conn.jco.ext.DestinationDataEventListener;
import com.sap.conn.jco.ext.DestinationDataProvider;
import com.sap.conn.jco.ext.Environment;

import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Properties;

public class SapBomExtractor {
    private static final String DESTINATION_NAME = "S4H_DESTINATION";
    private static final String CONFIG_FILE = "config/sap.properties";
    private static final String FUNCTION_NAME = "CSAP_MAT_BOM_READ";
    private static final String DEFAULT_MATERIAL = "PLM001007";
    private static final String DEFAULT_PLANT = "1001";
    private static final String DEFAULT_BOM_USAGE = "3";
    private static final String DEFAULT_ALTERNATIVE = "1";
    private static final String DEFAULT_OUTPUT = "sap_bom_extraction.json";

    public static void main(String[] args) {
        String material = argument(args, 0, DEFAULT_MATERIAL).trim();
        String plant = argument(args, 1, DEFAULT_PLANT).trim();
        String bomUsage = argument(args, 2, DEFAULT_BOM_USAGE).trim();
        String alternative = argument(args, 3, DEFAULT_ALTERNATIVE).trim();
        String output = argument(args, 4, DEFAULT_OUTPUT).trim();

        try {
            if (material.isEmpty())
                throw new IllegalArgumentException("Material ID is required.");
            System.out.println("Starting SAP BOM extraction for material " + material + "...");
            Properties properties = loadProperties();
            registerDestinationProvider(properties);
            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION_NAME);
            destination.ping();
            System.out.println("SAP connection established.");

            JCoFunction function = destination.getRepository().getFunction(FUNCTION_NAME);
            if (function == null)
                throw new RuntimeException("SAP function was not found: " + FUNCTION_NAME);
            JCoParameterList imports = function.getImportParameterList();
            setRequired(imports, "MATERIAL", material);
            setRequired(imports, "PLANT", plant);
            setRequired(imports, "BOM_USAGE", bomUsage);
            setOptional(imports, "ALTERNATIVE", alternative);
            setOptional(imports, "VALID_FROM", "");
            setOptional(imports, "VALID_TO", "");
            setOptional(imports, "CHANGE_NO", "");

            System.out.println("Executing " + FUNCTION_NAME + "...");
            function.execute(destination);
            JCoParameterList tables = function.getTableParameterList();
            if (tables == null)
                throw new RuntimeException("SAP table parameter list is unavailable.");
            JCoTable headers = tables.getTable("T_STKO");
            JCoTable components = tables.getTable("T_STPO");
            if (headers == null || headers.getNumRows() == 0)
                throw new RuntimeException("No BOM header was returned for material " + material + ".");
            if (components == null)
                throw new RuntimeException("SAP component table T_STPO is unavailable.");

            headers.setRow(0);
            String rootQty = quantity(headers.getString("BASE_QUAN"), headers.getString("BASE_UNIT"));
            StringBuilder children = new StringBuilder();
            for (int i = 0; i < components.getNumRows(); i++) {
                components.setRow(i);
                String component = clean(components.getString("COMPONENT"));
                if (component.isEmpty())
                    continue;
                if (children.length() > 0)
                    children.append(',');
                String name = clean(components.getString("ITEM_TEXT1"));
                if (name.isEmpty())
                    name = component;
                children.append("{")
                        .append(field("itemId", component)).append(',')
                        .append(field("sequence", clean(components.getString("ITEM_NO")))).append(',')
                        .append(field("variantState", "")).append(',')
                        .append(field("revId", "")).append(',')
                        .append(field("name", name)).append(',')
                        .append(field("qty",
                                quantity(components.getString("COMP_QTY"), components.getString("COMP_UNIT"))))
                        .append(',')
                        .append(field("variantCondition", "")).append(',')
                        .append("\"children\":[]}");
            }

            String json = "{" +
                    "\"bomRoot\":{" +
                    field("itemId", material) + "," + field("sequence", "") + "," +
                    field("variantState", "") + "," + field("revId", "") + "," +
                    field("name", material) + "," + field("qty", rootQty) + "," +
                    field("variantCondition", "") + ",\"children\":[" + children + "]}," +
                    field("sourceItemId", material) + "," + field("sourceRevId", "") + "," +
                    "\"variantOptions\":{}," + field("extractedAt", Instant.now().toString()) + "}";

            Path outputPath = Paths.get(output).toAbsolutePath().normalize();
            if (outputPath.getParent() != null)
                Files.createDirectories(outputPath.getParent());
            Files.write(outputPath, json.getBytes(StandardCharsets.UTF_8));
            System.out.println("SAP BOM JSON created: " + outputPath);
            System.out.println("Extracted " + components.getNumRows() + " direct component row(s).");
            System.out.println("SAP BOM extraction completed successfully.");
        } catch (Throwable error) {
            System.err.println("SAP BOM extraction failed: " + error.getMessage());
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static String argument(String[] args, int index, String fallback) {
        return args != null && args.length > index && args[index] != null && !args[index].trim().isEmpty() ? args[index]
                : fallback;
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static String quantity(String value, String unit) {
        String amount = clean(value);
        try {
            amount = new java.math.BigDecimal(amount).stripTrailingZeros().toPlainString();
        } catch (Exception ignored) {
        }
        String uom = clean(unit);
        return (amount + (uom.isEmpty() ? "" : " " + uom)).trim();
    }

    private static String field(String name, String value) {
        return "\"" + escape(name) + "\":\"" + escape(value) + "\"";
    }

    private static String escape(String value) {
        if (value == null)
            return "";
        StringBuilder out = new StringBuilder();
        for (char c : value.toCharArray()) {
            switch (c) {
                case '\\':
                    out.append("\\\\");
                    break;
                case '"':
                    out.append("\\\"");
                    break;
                case '\n':
                    out.append("\\n");
                    break;
                case '\r':
                    out.append("\\r");
                    break;
                case '\t':
                    out.append("\\t");
                    break;
                default:
                    if (c < 0x20)
                        out.append(String.format("\\u%04x", (int) c));
                    else
                        out.append(c);
            }
        }
        return out.toString();
    }

    private static void setRequired(JCoParameterList parameters, String name, String value) {
        if (parameters == null)
            throw new RuntimeException("SAP import parameter list is unavailable.");
        try {
            parameters.setValue(name, value);
        } catch (Exception e) {
            throw new RuntimeException("Required SAP import parameter is unavailable: " + name, e);
        }
    }

    private static void setOptional(JCoParameterList parameters, String name, String value) {
        if (parameters == null)
            return;
        try {
            parameters.setValue(name, value);
        } catch (Exception ignored) {
            System.out.println("Optional parameter not available: " + name);
        }
    }

    private static Properties loadProperties() throws Exception {
        Properties properties = new Properties();
        try (FileInputStream input = new FileInputStream(CONFIG_FILE)) {
            properties.load(input);
        }
        validate(properties, DestinationDataProvider.JCO_ASHOST);
        validate(properties, DestinationDataProvider.JCO_SYSNR);
        validate(properties, DestinationDataProvider.JCO_CLIENT);
        validate(properties, DestinationDataProvider.JCO_USER);
        validate(properties, DestinationDataProvider.JCO_PASSWD);
        return properties;
    }

    private static void validate(Properties properties, String name) {
        String value = properties.getProperty(name);
        if (value == null || value.trim().isEmpty())
            throw new RuntimeException("Missing SAP configuration property: " + name);
    }

    private static void registerDestinationProvider(Properties properties) {
        if (!Environment.isDestinationDataProviderRegistered())
            Environment.registerDestinationDataProvider(new LocalDestinationProvider(properties));
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
