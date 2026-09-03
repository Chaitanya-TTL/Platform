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
    private static final String CATALOG_FUNCTION = "BAPI_MATERIAL_GETLIST";
    private static final int SAP_MATNR_LENGTH = 18;
    private static final int DEFAULT_SEARCH_LIMIT = 100;

    public static void main(String[] args) {
        String query = argument(args, 0, "");
        int maxRows = parseNonNegativeInt(argument(args, 1, String.valueOf(DEFAULT_SEARCH_LIMIT)), DEFAULT_SEARCH_LIMIT);
        String outputDirectory = argument(args, 2, "runtime/catalog/manual");
        String plant = argument(args, 3, "");

        try {
            Properties properties = loadProperties();
            if (!com.sap.conn.jco.ext.Environment.isDestinationDataProviderRegistered()) {
                com.sap.conn.jco.ext.Environment.registerDestinationDataProvider(new LocalDestinationProvider(properties));
            }

            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION_NAME);
            destination.ping();
            System.out.println("SAP connection established.");

            List<String> warnings = new ArrayList<>();
            LinkedHashMap<String, MaterialEntry> unique = new LinkedHashMap<>();

            // Existing behavior: material-number prefix search through the released BAPI.
            searchByMaterialNumber(destination, query, maxRows, unique, warnings);

            // New behavior: description search through MAKT, with MARA enrichment.
            if (!query.trim().isEmpty() && !"*".equals(query.trim()) && !query.trim().matches("\\d+")) {
                searchByDescription(destination, query, maxRows, plant, unique, warnings);
            }

            List<MaterialEntry> ranked = new ArrayList<>(unique.values());
            ranked.sort(materialComparator(query));
            if (maxRows > 0 && ranked.size() > maxRows) {
                ranked = new ArrayList<>(ranked.subList(0, maxRows));
            }

            Path outputDir = Paths.get(outputDirectory).toAbsolutePath().normalize();
            Files.createDirectories(outputDir);
            Path jsonPath = outputDir.resolve("sap_material_catalog.json");
            Path csvPath = outputDir.resolve("sap_material_catalog.csv");

            String generatedAt = Instant.now().toString();
            writeJson(jsonPath, destination, generatedAt, query, plant, maxRows, ranked, warnings);
            writeCsv(csvPath, ranked);

            System.out.println("SAP material search completed successfully.");
            System.out.println("Query: " + query + "; plant: " + (plant.isEmpty() ? "<all>" : plant));
            System.out.println("Unique materials exported: " + ranked.size());
            System.out.println("JSON output: " + jsonPath);
            System.out.println("CSV output: " + csvPath);
        } catch (Throwable error) {
            System.err.println("SAP material search failed: " + error.getMessage());
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static void searchByMaterialNumber(JCoDestination destination, String query, int maxRows,
            LinkedHashMap<String, MaterialEntry> unique, List<String> warnings) {
        try {
            JCoFunction function = destination.getRepository().getFunction(CATALOG_FUNCTION);
            if (function == null) {
                warnings.add(CATALOG_FUNCTION + " unavailable; material-number BAPI search skipped.");
                return;
            }
            setMaxRows(function.getImportParameterList(), maxRows);
            applyMaterialSelection(function.getTableParameterList(), query);
            function.execute(destination);
            JCoTable materials = requireMaterialList(function.getTableParameterList());
            for (int i = 0; i < materials.getNumRows(); i++) {
                materials.setRow(i);
                String rawId = first(materials, "MATERIAL", "MATERIAL_LONG", "MATNR", "MATERIAL_NUMBER");
                if (rawId.isEmpty()) continue;
                String internalId = toInternalMaterialNumber(rawId);
                String displayId = toExternalMaterialNumber(internalId);
                String description = first(materials, "MATL_DESC", "DESCRIPTION", "MAKTX", "MATERIALDESCRIPTION");
                merge(unique, new MaterialEntry(displayId, internalId, description));
            }
            warnings.addAll(readReturnMessages(function.getTableParameterList()));
        } catch (Exception error) {
            warnings.add("Material-number search unavailable: " + clean(error.getMessage()));
        }
    }

    private static void searchByDescription(JCoDestination destination, String query, int maxRows, String plant,
            LinkedHashMap<String, MaterialEntry> unique, List<String> warnings) {
        String safeQuery = sqlLike(query.trim());
        List<String> options = new ArrayList<>();
        options.add("SPRAS = 'E'");
        options.add("AND MAKTX = '" + safeQuery + "'");

        List<Map<String, String>> descriptions = readTable(destination, "MAKT",
                new String[] { "MATNR", "SPRAS", "MAKTX" }, options, maxRows, warnings);

        for (Map<String, String> row : descriptions) {
            String internalId = clean(row.get("MATNR"));
            if (internalId.isEmpty()) continue;
            String displayId = toExternalMaterialNumber(internalId);
            MaterialEntry entry = new MaterialEntry(displayId, internalId, clean(row.get("MAKTX")));

            Map<String, String> mara = firstRow(readTable(destination, "MARA",
                    new String[] { "MATNR", "MTART", "MEINS", "XCHPF", "MSTAE" },
                    Collections.singletonList("MATNR = '" + sql(internalId) + "'"), 1, warnings));
            entry.materialType = clean(mara.get("MTART"));
            entry.baseUnit = clean(mara.get("MEINS"));
            entry.batchManaged = "X".equalsIgnoreCase(clean(mara.get("XCHPF")));
            entry.crossPlantStatus = clean(mara.get("MSTAE"));

            if (!plant.isEmpty()) {
                entry.plantExtended = !readTable(destination, "MARC", new String[] { "MATNR", "WERKS" },
                        Arrays.asList("MATNR = '" + sql(internalId) + "'", "AND WERKS = '" + sql(plant) + "'"),
                        1, warnings).isEmpty();
                entry.hasStock = !readTable(destination, "MARD", new String[] { "MATNR", "WERKS", "LGORT", "LABST" },
                        Arrays.asList("MATNR = '" + sql(internalId) + "'", "AND WERKS = '" + sql(plant) + "'"),
                        1, warnings).isEmpty();
                entry.hasValuation = !readTable(destination, "MBEW", new String[] { "MATNR", "BWKEY", "VPRSV" },
                        Arrays.asList("MATNR = '" + sql(internalId) + "'", "AND BWKEY = '" + sql(plant) + "'"),
                        1, warnings).isEmpty();
            }
            merge(unique, entry);
        }
    }

    private static void merge(LinkedHashMap<String, MaterialEntry> unique, MaterialEntry incoming) {
        MaterialEntry existing = unique.get(incoming.internalMaterialId);
        if (existing == null) {
            unique.put(incoming.internalMaterialId, incoming);
            return;
        }
        if (existing.description.isEmpty()) existing.description = incoming.description;
        if (existing.materialType.isEmpty()) existing.materialType = incoming.materialType;
        if (existing.baseUnit.isEmpty()) existing.baseUnit = incoming.baseUnit;
        if (existing.crossPlantStatus.isEmpty()) existing.crossPlantStatus = incoming.crossPlantStatus;
        existing.batchManaged = existing.batchManaged || incoming.batchManaged;
        existing.plantExtended = existing.plantExtended || incoming.plantExtended;
        existing.hasStock = existing.hasStock || incoming.hasStock;
        existing.hasValuation = existing.hasValuation || incoming.hasValuation;
    }

    private static Comparator<MaterialEntry> materialComparator(String query) {
        String normalized = clean(query).toLowerCase(Locale.ROOT);
        return Comparator.comparingInt((MaterialEntry item) -> rank(item, normalized))
                .thenComparing(item -> item.materialId);
    }

    private static int rank(MaterialEntry item, String query) {
        if (query.isEmpty()) return 4;
        if (item.materialId.equalsIgnoreCase(query) || item.internalMaterialId.equalsIgnoreCase(query)) return 0;
        if (item.description.equalsIgnoreCase(query)) return 1;
        if (item.materialId.toLowerCase(Locale.ROOT).startsWith(query)
                || item.description.toLowerCase(Locale.ROOT).startsWith(query)) return 2;
        if (item.description.toLowerCase(Locale.ROOT).contains(query)) return 3;
        return 4;
    }

    private static List<Map<String, String>> readTable(JCoDestination destination, String table, String[] fields,
            List<String> options, int rowCount, List<String> warnings) {
        List<Map<String, String>> rows = new ArrayList<>();
        try {
            JCoFunction function = destination.getRepository().getFunction("RFC_READ_TABLE");
            if (function == null) throw new IllegalStateException("RFC_READ_TABLE unavailable");
            setIfPresent(function.getImportParameterList(), "QUERY_TABLE", table);
            setIfPresent(function.getImportParameterList(), "DELIMITER", "|");
            if (rowCount > 0) setIfPresent(function.getImportParameterList(), "ROWCOUNT", rowCount);

            JCoTable fieldTable = function.getTableParameterList().getTable("FIELDS");
            for (String field : fields) {
                fieldTable.appendRow();
                fieldTable.setValue("FIELDNAME", field);
            }
            JCoTable optionTable = function.getTableParameterList().getTable("OPTIONS");
            for (String option : options) {
                optionTable.appendRow();
                optionTable.setValue("TEXT", option);
            }
            function.execute(destination);

            JCoTable data = function.getTableParameterList().getTable("DATA");
            for (int i = 0; i < data.getNumRows(); i++) {
                data.setRow(i);
                String[] values = data.getString("WA").split("\\|", -1);
                Map<String, String> result = new LinkedHashMap<>();
                for (int j = 0; j < fields.length; j++) {
                    result.put(fields[j], j < values.length ? clean(values[j]) : "");
                }
                rows.add(result);
            }
        } catch (Exception error) {
            warnings.add(table + " read unavailable: " + clean(error.getMessage()));
        }
        return rows;
    }

    private static void setMaxRows(JCoParameterList imports, int maxRows) {
        if (imports == null) return;
        for (String name : new String[] { "MAXROWS", "MAX_ROWS" }) {
            try {
                imports.setValue(name, maxRows);
                return;
            } catch (Exception ignored) { }
        }
    }

    private static void applyMaterialSelection(JCoParameterList tables, String query) {
        if (tables == null) throw new IllegalStateException("SAP table parameter list is unavailable.");
        JCoTable selection = null;
        for (String name : new String[] { "MATNRSELECTION", "MATERIALSELECTION" }) {
            try { selection = tables.getTable(name); } catch (Exception ignored) { }
            if (selection != null) break;
        }
        if (selection == null) throw new IllegalStateException("No material selection table exists in " + CATALOG_FUNCTION);

        String cleaned = clean(query);
        String pattern = cleaned.isEmpty() || "*".equals(cleaned) ? "*" : cleaned + "*";
        if (cleaned.matches("\\d+")) {
            pattern = toInternalMaterialNumber(cleaned);
        }
        selection.appendRow();
        setTableValue(selection, "SIGN", "I");
        setTableValue(selection, "OPTION", cleaned.matches("\\d+") ? "EQ" : "CP");
        setTableValue(selection, "MATNR_LOW", pattern);
        setTableValue(selection, "LOW", pattern);
    }

    private static JCoTable requireMaterialList(JCoParameterList tables) {
        if (tables == null) throw new IllegalStateException("SAP table parameter list is unavailable.");
        for (String name : new String[] { "MATNRLIST", "MATERIALLIST", "MATERIAL_LIST" }) {
            try {
                JCoTable table = tables.getTable(name);
                if (table != null) return table;
            } catch (Exception ignored) { }
        }
        throw new IllegalStateException("No recognized material output table was found.");
    }

    private static List<String> readReturnMessages(JCoParameterList tables) {
        List<String> warnings = new ArrayList<>();
        if (tables == null) return warnings;
        try {
            JCoTable returns = tables.getTable("RETURN");
            if (returns == null) return warnings;
            for (int i = 0; i < returns.getNumRows(); i++) {
                returns.setRow(i);
                String type = first(returns, "TYPE");
                String code = first(returns, "CODE", "NUMBER");
                String message = first(returns, "MESSAGE");
                if (!message.isEmpty() && !"S".equalsIgnoreCase(type)) {
                    warnings.add((type + " " + code + " " + message).trim());
                }
            }
        } catch (Exception ignored) { }
        return warnings;
    }

    private static void writeJson(Path path, JCoDestination destination, String generatedAt, String query,
            String plant, int maxRows, List<MaterialEntry> materials, List<String> warnings) throws Exception {
        try (BufferedWriter writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
            writer.write("{");
            writer.write(field("systemId", destination.getAttributes().getSystemID()));
            writer.write("," + field("client", destination.getAttributes().getClient()));
            writer.write("," + field("generatedAt", generatedAt));
            writer.write("," + field("status", warnings.isEmpty() ? "complete" : "partial_success"));
            writer.write(",\"filters\":{" + field("query", query) + "," + field("plant", plant)
                    + ",\"maxRows\":" + maxRows + "}");
            writer.write(",\"totalMaterials\":" + materials.size());
            writer.write(",\"materials\":[");
            for (int i = 0; i < materials.size(); i++) {
                if (i > 0) writer.write(',');
                MaterialEntry material = materials.get(i);
                writer.write("{" + field("materialId", material.materialId)
                        + "," + field("internalMaterialId", material.internalMaterialId)
                        + "," + field("description", material.description)
                        + "," + field("materialType", material.materialType)
                        + "," + field("baseUnit", material.baseUnit)
                        + ",\"batchManaged\":" + material.batchManaged
                        + "," + field("crossPlantStatus", material.crossPlantStatus)
                        + ",\"plantExtended\":" + material.plantExtended
                        + ",\"hasStock\":" + material.hasStock
                        + ",\"hasValuation\":" + material.hasValuation + "}");
            }
            writer.write("],\"warnings\":[");
            for (int i = 0; i < warnings.size(); i++) {
                if (i > 0) writer.write(',');
                writer.write("\"" + escape(warnings.get(i)) + "\"");
            }
            writer.write("]}");
        }
    }

    private static void writeCsv(Path path, List<MaterialEntry> materials) throws IOException {
        try (BufferedWriter writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
            writer.write("Material ID,Internal Material ID,Description,Material Type,Base Unit,Plant Extended,Has Stock,Has Valuation");
            writer.newLine();
            for (MaterialEntry material : materials) {
                writer.write(csv(material.materialId) + ',' + csv(material.internalMaterialId) + ','
                        + csv(material.description) + ',' + csv(material.materialType) + ',' + csv(material.baseUnit) + ','
                        + material.plantExtended + ',' + material.hasStock + ',' + material.hasValuation);
                writer.newLine();
            }
        }
    }

    private static String toInternalMaterialNumber(String value) {
        String cleaned = clean(value);
        if (cleaned.matches("\\d+") && cleaned.length() < SAP_MATNR_LENGTH) {
            return String.format("%" + SAP_MATNR_LENGTH + "s", cleaned).replace(' ', '0');
        }
        return cleaned;
    }

    private static String toExternalMaterialNumber(String value) {
        String cleaned = clean(value);
        if (cleaned.matches("\\d+")) return cleaned.replaceFirst("^0+(?!$)", "");
        return cleaned;
    }

    private static Map<String, String> firstRow(List<Map<String, String>> rows) {
        return rows.isEmpty() ? new LinkedHashMap<>() : rows.get(0);
    }

    private static void setIfPresent(JCoParameterList parameters, String name, Object value) {
        if (parameters == null) return;
        try { parameters.setValue(name, value); } catch (Exception ignored) { }
    }

    private static void setTableValue(JCoTable table, String field, String value) {
        try { table.setValue(field, value); } catch (Exception ignored) { }
    }

    private static String first(JCoRecord record, String... names) {
        for (String name : names) {
            try {
                String value = clean(record.getString(name));
                if (!value.isEmpty()) return value;
            } catch (Exception ignored) { }
        }
        return "";
    }

    private static String sql(String value) { return clean(value).replace("'", "''"); }
    private static String sqlLike(String value) { return sql(value).replace("%", "\\%").replace("_", "\\_"); }
    private static String csv(String value) { return "\"" + clean(value).replace("\"", "\"\"") + "\""; }
    private static int parseNonNegativeInt(String value, int fallback) {
        try { return Math.max(0, Integer.parseInt(value)); } catch (Exception ignored) { return fallback; }
    }
    private static String argument(String[] args, int index, String fallback) {
        return args != null && args.length > index && args[index] != null ? args[index].trim() : fallback;
    }
    private static String field(String name, String value) { return "\"" + escape(name) + "\":\"" + escape(value) + "\""; }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
    private static String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private static Properties loadProperties() throws IOException {
        Properties properties = new Properties();
        try (FileInputStream input = new FileInputStream(CONFIG_FILE)) { properties.load(input); }
        for (String key : new String[] { DestinationDataProvider.JCO_ASHOST, DestinationDataProvider.JCO_SYSNR,
                DestinationDataProvider.JCO_CLIENT, DestinationDataProvider.JCO_USER, DestinationDataProvider.JCO_PASSWD }) {
            if (clean(properties.getProperty(key)).isEmpty()) throw new IllegalStateException("Missing SAP configuration property: " + key);
        }
        return properties;
    }

    private static final class MaterialEntry {
        final String materialId;
        final String internalMaterialId;
        String description;
        String materialType = "";
        String baseUnit = "";
        String crossPlantStatus = "";
        boolean batchManaged;
        boolean plantExtended;
        boolean hasStock;
        boolean hasValuation;
        MaterialEntry(String materialId, String internalMaterialId, String description) {
            this.materialId = materialId;
            this.internalMaterialId = internalMaterialId;
            this.description = clean(description);
        }
    }

    private static final class LocalDestinationProvider implements DestinationDataProvider {
        private final Properties properties;
        LocalDestinationProvider(Properties properties) { this.properties = properties; }
        public Properties getDestinationProperties(String name) { return DESTINATION_NAME.equals(name) ? properties : null; }
        public boolean supportsEvents() { return false; }
        public void setDestinationDataEventListener(DestinationDataEventListener listener) { }
    }
}

