import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.DestinationDataEventListener;
import com.sap.conn.jco.ext.DestinationDataProvider;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/**
 * Read-only discovery probe for SAP material history.
 *
 * It does not post or modify SAP data. It checks table availability, discovers
 * field metadata with DDIF_FIELDINFO_GET, and reads small filtered samples with
 * RFC_READ_TABLE. The output determines the exact schema to use in the final
 * SapMaterialHistoryExtractor for this S/4HANA system.
 */
public class SapMaterialHistoryProbe {
    private static final String DESTINATION = "S4H_DESTINATION";
    private static final String CONFIG = "config/sap.properties";
    private static final int MATNR_LENGTH = 18;
    private static final int SAMPLE_LIMIT = 25;

    private static final String[] TABLES = {
        "MATDOC", "MSEG", "MKPF", "BKPF", "BSEG", "ACDOCA"
    };

    private static final Map<String, String[]> CANDIDATE_FIELDS = new LinkedHashMap<>();
    static {
        CANDIDATE_FIELDS.put("MATDOC", new String[] {
            "MATNR", "WERKS", "LGORT", "MBLNR", "MJAHR", "ZEILE", "BUDAT",
            "BLDAT", "CPUDT", "CPUTM", "BWART", "MENGE", "MEINS", "DMBTR",
            "WAERS", "SHKZG", "AUFNR", "EBELN", "EBELP", "BKTXT", "SGTXT",
            "TCODE2", "AWTYP", "AWREF", "AWORG", "BELNR", "BUKRS", "GJAHR",
            "PRCTR", "GSBER", "KOSTL"
        });
        CANDIDATE_FIELDS.put("MSEG", new String[] {
            "MATNR", "WERKS", "LGORT", "MBLNR", "MJAHR", "ZEILE", "BWART",
            "MENGE", "MEINS", "DMBTR", "WAERS", "SHKZG", "AUFNR", "EBELN",
            "EBELP", "SGTXT", "BUDAT_MKPF", "BLDAT_MKPF", "CPUDT_MKPF",
            "CPUTM_MKPF", "TCODE2", "BELNR", "BUKRS", "GJAHR", "PRCTR", "GSBER"
        });
        CANDIDATE_FIELDS.put("MKPF", new String[] {
            "MBLNR", "MJAHR", "BLDAT", "BUDAT", "CPUDT", "CPUTM", "TCODE",
            "BKTXT", "XBLNR", "USNAM", "VGART"
        });
        CANDIDATE_FIELDS.put("BKPF", new String[] {
            "BUKRS", "BELNR", "GJAHR", "BLART", "BLDAT", "BUDAT", "MONAT",
            "CPUDT", "CPUTM", "TCODE", "AWTYP", "AWKEY", "WAERS", "USNAM", "BKTXT"
        });
        CANDIDATE_FIELDS.put("BSEG", new String[] {
            "BUKRS", "BELNR", "GJAHR", "BUZEI", "BSCHL", "SHKZG", "HKONT",
            "WRBTR", "DMBTR", "WAERS", "MATNR", "WERKS", "MENGE", "MEINS",
            "AUFNR", "KOSTL", "PRCTR", "GSBER", "SGTXT", "ZUONR"
        });
        CANDIDATE_FIELDS.put("ACDOCA", new String[] {
            "RLDNR", "RBUKRS", "GJAHR", "BELNR", "DOCLN", "BLART", "BUDAT",
            "RACCT", "DRCRK", "HSL", "RHCUR", "WSL", "RWCUR", "MATNR", "WERKS",
            "MSL", "RUNIT", "AUFNR", "RCNTR", "PRCTR", "RBUSA", "SGTXT",
            "AWTYP", "AWREF", "AWORG"
        });
    }

    public static void main(String[] args) {
        String requested = arg(args, 0, "31");
        String plant = arg(args, 1, "1001");
        String storageLocation = arg(args, 2, "1D");
        String output = arg(args, 3, "runtime/probes/material-history-probe.json");
        String material = internalMaterial(requested);
        List<String> warnings = new ArrayList<>();

        try {
            Properties properties = loadProperties();
            if (!com.sap.conn.jco.ext.Environment.isDestinationDataProviderRegistered()) {
                com.sap.conn.jco.ext.Environment.registerDestinationDataProvider(new Provider(properties));
            }
            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION);
            destination.ping();

            List<TableProbe> probes = new ArrayList<>();
            for (String table : TABLES) {
                probes.add(probeTable(destination, table, material, plant, storageLocation, warnings));
            }

            Path path = Paths.get(output).toAbsolutePath().normalize();
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            Files.write(path, json(destination, requested, material, plant, storageLocation, probes, warnings)
                    .getBytes(StandardCharsets.UTF_8));

            System.out.println("SAP material history probe completed: " + path);
            System.out.println("Requested material: " + requested + "; internal MATNR: " + material);
            for (TableProbe probe : probes) {
                System.out.println(probe.table + ": available=" + probe.available
                        + ", selectedFields=" + probe.selectedFields.size()
                        + ", sampleRows=" + probe.rows.size());
            }
            if (!warnings.isEmpty()) System.out.println("Warnings: " + warnings.size());
        } catch (Throwable error) {
            System.err.println("SAP material history probe failed: " + error.getMessage());
            error.printStackTrace(System.err);
            System.exit(1);
        }
    }

    private static TableProbe probeTable(JCoDestination destination, String table, String material,
            String plant, String storageLocation, List<String> warnings) {
        TableProbe probe = new TableProbe(table);
        try {
            LinkedHashSet<String> available = discoverFields(destination, table);
            probe.available = true;
            probe.availableFields.addAll(available);

            for (String candidate : CANDIDATE_FIELDS.get(table)) {
                if (available.contains(candidate)) probe.selectedFields.add(candidate);
            }
            if (probe.selectedFields.isEmpty()) {
                probe.message = "No candidate fields were found in table metadata.";
                return probe;
            }

            List<String> filters = filtersFor(table, available, material, plant, storageLocation);
            probe.filters.addAll(filters);
            probe.rows.addAll(readTable(destination, table,
                    probe.selectedFields.toArray(new String[0]), filters, SAMPLE_LIMIT));
            probe.message = "Read-only sample completed.";
        } catch (Exception error) {
            probe.available = false;
            probe.message = clean(error.getMessage());
            warnings.add(table + " probe unavailable: " + probe.message);
        }
        return probe;
    }

    private static LinkedHashSet<String> discoverFields(JCoDestination destination, String table) throws Exception {
        JCoFunction function = destination.getRepository().getFunction("DDIF_FIELDINFO_GET");
        if (function == null) throw new Exception("DDIF_FIELDINFO_GET unavailable");
        set(function.getImportParameterList(), "TABNAME", table);
        set(function.getImportParameterList(), "LANGU", "E");
        set(function.getImportParameterList(), "ALL_TYPES", "X");
        function.execute(destination);

        JCoTable rows = function.getTableParameterList().getTable("DFIES_TAB");
        LinkedHashSet<String> names = new LinkedHashSet<>();
        for (int i = 0; i < rows.getNumRows(); i++) {
            rows.setRow(i);
            String name = clean(rows.getString("FIELDNAME"));
            if (!name.isEmpty()) names.add(name);
        }
        if (names.isEmpty()) throw new Exception("No metadata fields returned");
        return names;
    }

    private static List<String> filtersFor(String table, Set<String> fields, String material,
            String plant, String storageLocation) {
        List<String> result = new ArrayList<>();
        if (fields.contains("MATNR")) result.add("MATNR = '" + sql(material) + "'");
        if (fields.contains("WERKS") && !plant.isEmpty()) result.add(prefix(result) + "WERKS = '" + sql(plant) + "'");
        if (fields.contains("LGORT") && !storageLocation.isEmpty()) {
            result.add(prefix(result) + "LGORT = '" + sql(storageLocation) + "'");
        }
        // Header and FI tables cannot be safely filtered until document keys are known.
        // Avoid broad reads from those tables during this discovery probe.
        if (("MKPF".equals(table) || "BKPF".equals(table)) && result.isEmpty()) {
            result.add("MBLNR = '0000000000'");
            if ("BKPF".equals(table)) result.set(0, "BELNR = '0000000000'");
        }
        if (("BSEG".equals(table) || "ACDOCA".equals(table)) && result.isEmpty()) {
            result.add("MATNR = '" + sql(material) + "'");
        }
        return result;
    }

    private static String prefix(List<String> current) {
        return current.isEmpty() ? "" : "AND ";
    }

    private static List<Map<String, String>> readTable(JCoDestination destination, String table,
            String[] fields, List<String> filters, int limit) throws Exception {
        JCoFunction function = destination.getRepository().getFunction("RFC_READ_TABLE");
        if (function == null) throw new Exception("RFC_READ_TABLE unavailable");
        set(function.getImportParameterList(), "QUERY_TABLE", table);
        set(function.getImportParameterList(), "DELIMITER", "|");
        setInt(function.getImportParameterList(), "ROWCOUNT", limit);

        JCoTable fieldTable = function.getTableParameterList().getTable("FIELDS");
        for (String field : fields) {
            fieldTable.appendRow();
            fieldTable.setValue("FIELDNAME", field);
        }
        JCoTable optionTable = function.getTableParameterList().getTable("OPTIONS");
        for (String filter : filters) {
            optionTable.appendRow();
            optionTable.setValue("TEXT", filter);
        }
        function.execute(destination);

        JCoTable data = function.getTableParameterList().getTable("DATA");
        List<Map<String, String>> result = new ArrayList<>();
        for (int i = 0; i < data.getNumRows(); i++) {
            data.setRow(i);
            String[] values = data.getString("WA").split("\\|", -1);
            Map<String, String> row = new LinkedHashMap<>();
            for (int j = 0; j < fields.length; j++) {
                row.put(fields[j], j < values.length ? clean(values[j]) : "");
            }
            result.add(row);
        }
        return result;
    }

    private static String json(JCoDestination destination, String requested, String material,
            String plant, String storageLocation, List<TableProbe> probes, List<String> warnings) throws JCoException {
        StringBuilder out = new StringBuilder();
        out.append('{');
        out.append(field("requestedMaterialId", requested)).append(',');
        out.append(field("internalMaterialId", material)).append(',');
        out.append(field("plant", plant)).append(',');
        out.append(field("storageLocation", storageLocation)).append(',');
        out.append(field("systemId", destination.getAttributes().getSystemID())).append(',');
        out.append(field("client", destination.getAttributes().getClient())).append(',');
        out.append(field("generatedAt", Instant.now().toString())).append(',');
        out.append("\"readOnly\":true,\"tables\":[");
        for (int i = 0; i < probes.size(); i++) {
            if (i > 0) out.append(',');
            out.append(probes.get(i).json());
        }
        out.append("],\"warnings\":[");
        for (int i = 0; i < warnings.size(); i++) {
            if (i > 0) out.append(',');
            out.append('"').append(esc(warnings.get(i))).append('"');
        }
        out.append("]}");
        return out.toString();
    }

    private static String internalMaterial(String value) {
        String cleaned = clean(value);
        if (cleaned.matches("\\d+") && cleaned.length() < MATNR_LENGTH) {
            return String.format("%" + MATNR_LENGTH + "s", cleaned).replace(' ', '0');
        }
        return cleaned;
    }

    private static void set(JCoParameterList parameters, String name, String value) {
        if (parameters == null) return;
        try { parameters.setValue(name, value); } catch (Exception ignored) { }
    }

    private static void setInt(JCoParameterList parameters, String name, int value) {
        if (parameters == null) return;
        try { parameters.setValue(name, value); } catch (Exception ignored) { }
    }

    private static String arg(String[] args, int index, String fallback) {
        return args != null && args.length > index && args[index] != null && !args[index].trim().isEmpty()
                ? args[index].trim() : fallback;
    }

    private static String sql(String value) { return clean(value).replace("'", "''"); }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
    private static String field(String name, String value) { return "\"" + esc(name) + "\":\"" + esc(value) + "\""; }
    private static String esc(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    private static Properties loadProperties() throws Exception {
        Properties properties = new Properties();
        try (FileInputStream input = new FileInputStream(CONFIG)) { properties.load(input); }
        return properties;
    }

    private static class TableProbe {
        final String table;
        boolean available;
        String message = "";
        final List<String> availableFields = new ArrayList<>();
        final List<String> selectedFields = new ArrayList<>();
        final List<String> filters = new ArrayList<>();
        final List<Map<String, String>> rows = new ArrayList<>();

        TableProbe(String table) { this.table = table; }

        String json() {
            StringBuilder out = new StringBuilder();
            out.append('{').append(field("table", table));
            out.append(",\"available\":").append(available);
            out.append(',').append(field("message", message));
            out.append(",\"availableFields\":").append(strings(availableFields));
            out.append(",\"selectedFields\":").append(strings(selectedFields));
            out.append(",\"filters\":").append(strings(filters));
            out.append(",\"sampleRows\":[");
            for (int i = 0; i < rows.size(); i++) {
                if (i > 0) out.append(',');
                out.append(map(rows.get(i)));
            }
            out.append("]}");
            return out.toString();
        }

        private static String strings(List<String> values) {
            StringBuilder out = new StringBuilder("[");
            for (int i = 0; i < values.size(); i++) {
                if (i > 0) out.append(',');
                out.append('"').append(esc(values.get(i))).append('"');
            }
            return out.append(']').toString();
        }

        private static String map(Map<String, String> values) {
            StringBuilder out = new StringBuilder("{");
            int index = 0;
            for (Map.Entry<String, String> entry : values.entrySet()) {
                if (index++ > 0) out.append(',');
                out.append(field(entry.getKey(), entry.getValue()));
            }
            return out.append('}').toString();
        }
    }

    private static class Provider implements DestinationDataProvider {
        private final Properties properties;
        Provider(Properties properties) { this.properties = properties; }
        public Properties getDestinationProperties(String name) { return DESTINATION.equals(name) ? properties : null; }
        public boolean supportsEvents() { return false; }
        public void setDestinationDataEventListener(DestinationDataEventListener listener) { }
    }
}
