import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.*;
import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public class SapMaterialImpactExtractor {
    private static final String DESTINATION = "S4H_DESTINATION", CONFIG = "config/sap.properties";

    public static void main(String[] args) {
        String material = arg(args, 0, "PLM001008"), plant = arg(args, 1, "1001"),
                output = arg(args, 2, "sap_material_impact.json");
        List<String> warnings = new ArrayList<>();
        try {
            Properties p = new Properties();
            try (FileInputStream in = new FileInputStream(CONFIG)) {
                p.load(in);
            }
            if (!com.sap.conn.jco.ext.Environment.isDestinationDataProviderRegistered())
                com.sap.conn.jco.ext.Environment.registerDestinationDataProvider(new Provider(p));
            JCoDestination d = JCoDestinationManager.getDestination(DESTINATION);
            d.ping();
            Map<String, String> detail = getDetail(d, material, plant, warnings);
            String unit = first(detail, "BASE_UOM", "BASE_UOM_ISO");
            if (unit.isEmpty())
                unit = "EA";
            List<Map<String, String>> locations = readTable(d, "MARD",
                    new String[] { "MATNR", "WERKS", "LGORT", "LABST", "INSME", "SPEME", "UMLME" },
                    "MATNR = '" + sql(material) + "' AND WERKS = '" + sql(plant) + "'", warnings);
            List<Map<String, String>> valuation = readTable(d, "MBEW",
                    new String[] { "MATNR", "BWKEY", "BWTAR", "LBKUM", "SALK3", "VPRSV", "VERPR", "STPRS", "PEINH" },
                    "MATNR = '" + sql(material) + "' AND BWKEY = '" + sql(plant) + "'", warnings);
            Map<String, String> val = valuation.isEmpty() ? new LinkedHashMap<>() : valuation.get(0);
            BigDecimal unrestricted = sum(locations, "LABST"), quality = sum(locations, "INSME"),
                    blocked = sum(locations, "SPEME"), transfer = sum(locations, "UMLME");
            Map<String, String> atp = availability(d, material, plant, unit, warnings);
            String status = warnings.isEmpty() ? "complete"
                    : (detail.isEmpty() && locations.isEmpty() && valuation.isEmpty() ? "failed" : "partial_success");
            Path path = Paths.get(output).toAbsolutePath().normalize();
            if (path.getParent() != null)
                Files.createDirectories(path.getParent());
            try (BufferedWriter w = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
                w.write("{");
                w.write(field("materialId", material) + "," + field("description", first(detail, "MATL_DESC")) + ","
                        + field("materialType", first(detail, "MATL_TYPE")) + "," + field("plant", plant) + ","
                        + field("baseUnit", unit) + "," + field("status", status) + ",");
                w.write("\"stock\":{\"unrestricted\":" + num(unrestricted) + ",\"qualityInspection\":" + num(quality)
                        + ",\"blocked\":" + num(blocked) + ",\"inTransfer\":" + num(transfer) + ",\"totalPhysical\":"
                        + num(unrestricted.add(quality).add(blocked).add(transfer)) + ",\"atpAvailable\":"
                        + nullableNum(first(atp, "AV_QTY_PLT")) + "},");
                w.write("\"inventory\":{\"valuatedQuantity\":" + nullableNum(first(val, "LBKUM"))
                        + ",\"totalStockValue\":" + nullableNum(first(val, "SALK3")) + ","
                        + field("valuationArea", first(val, "BWKEY")) + ","
                        + field("valuationType", first(val, "BWTAR")) + "},");
                String pc = first(val, "VPRSV"),
                        effective = "S".equals(pc) ? first(val, "STPRS") : "V".equals(pc) ? first(val, "VERPR") : "";
                w.write("\"cost\":{" + field("priceControl", pc) + ",\"standardPrice\":"
                        + nullableNum(first(val, "STPRS")) + ",\"movingAveragePrice\":"
                        + nullableNum(first(val, "VERPR")) + ",\"priceUnit\":" + nullableNum(first(val, "PEINH"))
                        + ",\"effectiveUnitCost\":" + nullableNum(effective) + "},");
                w.write("\"storageLocations\":[");
                for (int i = 0; i < locations.size(); i++) {
                    if (i > 0)
                        w.write(',');
                    Map<String, String> x = locations.get(i);
                    w.write("{" + field("storageLocation", first(x, "LGORT")) + ",\"unrestricted\":"
                            + nullableNum(first(x, "LABST")) + ",\"qualityInspection\":"
                            + nullableNum(first(x, "INSME")) + ",\"blocked\":" + nullableNum(first(x, "SPEME"))
                            + ",\"inTransfer\":" + nullableNum(first(x, "UMLME")) + "}");
                }
                w.write("],");
                w.write("\"warnings\":[");
                for (int i = 0; i < warnings.size(); i++) {
                    if (i > 0)
                        w.write(',');
                    w.write("\"" + esc(warnings.get(i)) + "\"");
                }
                w.write("]," + field("extractedAt", Instant.now().toString()) + "}");
            }
            System.out.println("SAP material impact JSON created: " + path);
            System.out.println("Status: " + status + "; storage locations: " + locations.size() + "; valuation rows: "
                    + valuation.size());
        } catch (Throwable e) {
            System.err.println("SAP material impact extraction failed: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }

    private static Map<String, String> getDetail(JCoDestination d, String m, String p, List<String> w)
            throws JCoException {
        JCoFunction f = d.getRepository().getFunction("BAPI_MATERIAL_GET_DETAIL");
        if (f == null) {
            w.add("BAPI_MATERIAL_GET_DETAIL unavailable");
            return new LinkedHashMap<>();
        }
        set(f.getImportParameterList(), "MATERIAL", m);
        set(f.getImportParameterList(), "PLANT", p);
        set(f.getImportParameterList(), "VALUATIONAREA", p);
        f.execute(d);
        Map<String, String> out = record(f.getExportParameterList().getStructure("MATERIAL_GENERAL_DATA"));
        out.putAll(record(f.getExportParameterList().getStructure("MATERIALVALUATIONDATA")));
        String msg = returnMessage(f.getExportParameterList().getStructure("RETURN"));
        if (!msg.isEmpty() && !msg.startsWith("S "))
            w.add(msg);
        return out;
    }

    private static Map<String, String> availability(JCoDestination d, String m, String p, String u, List<String> w) {
        Map<String, String> r = new LinkedHashMap<>();
        try {
            JCoFunction f = d.getRepository().getFunction("BAPI_MATERIAL_AVAILABILITY");
            if (f == null) {
                w.add("BAPI_MATERIAL_AVAILABILITY unavailable");
                return r;
            }
            set(f.getImportParameterList(), "MATERIAL", m);
            set(f.getImportParameterList(), "PLANT", p);
            set(f.getImportParameterList(), "UNIT", u);
            f.execute(d);
            r.put("AV_QTY_PLT", clean(f.getExportParameterList().getString("AV_QTY_PLT")));
            String msg = returnMessage(f.getExportParameterList().getStructure("RETURN"));
            if (!msg.isEmpty() && !msg.startsWith("S "))
                w.add(msg);
        } catch (Exception e) {
            w.add("ATP unavailable: " + e.getMessage());
        }
        return r;
    }

    private static List<Map<String, String>> readTable(JCoDestination d, String table, String[] fields, String option,
            List<String> w) {
        List<Map<String, String>> rows = new ArrayList<>();
        try {
            JCoFunction f = d.getRepository().getFunction("RFC_READ_TABLE");
            if (f == null)
                throw new Exception("RFC_READ_TABLE unavailable");
            set(f.getImportParameterList(), "QUERY_TABLE", table);
            set(f.getImportParameterList(), "DELIMITER", "|");
            JCoTable fs = f.getTableParameterList().getTable("FIELDS");
            for (String name : fields) {
                fs.appendRow();
                fs.setValue("FIELDNAME", name);
            }
            JCoTable os = f.getTableParameterList().getTable("OPTIONS");
            os.appendRow();
            os.setValue("TEXT", option);
            f.execute(d);
            JCoTable data = f.getTableParameterList().getTable("DATA");
            for (int i = 0; i < data.getNumRows(); i++) {
                data.setRow(i);
                String[] v = data.getString("WA").split("\\|", -1);
                Map<String, String> x = new LinkedHashMap<>();
                for (int j = 0; j < fields.length; j++)
                    x.put(fields[j], j < v.length ? clean(v[j]) : "");
                rows.add(x);
            }
        } catch (Exception e) {
            w.add(table + " read unavailable: " + e.getMessage());
        }
        return rows;
    }

    private static Map<String, String> record(JCoRecord r) {
        Map<String, String> m = new LinkedHashMap<>();
        if (r == null)
            return m;
        JCoFieldIterator it = r.getFieldIterator();
        while (it.hasNextField()) {
            JCoField f = it.nextField();
            String v = clean(f.getString());
            if (!v.isEmpty())
                m.put(f.getName(), v);
        }
        return m;
    }

    private static String returnMessage(JCoStructure result) {
        if (result == null) {
            return "";
        }

        String type = clean(result.getString("TYPE"));
        String code = clean(result.getString("CODE"));
        String message = clean(result.getString("MESSAGE"));

        if ("S".equalsIgnoreCase(type) && message.isEmpty()) {
            return "";
        }

        if (type.isEmpty() && code.isEmpty() && message.isEmpty()) {
            return "";
        }

        return (type + " " + code + " " + message).trim();
    }

    private static void set(JCoParameterList p, String n, String v) {
        if (p == null)
            return;
        try {
            p.setValue(n, v);
        } catch (Exception ignored) {
        }
    }

    private static BigDecimal sum(List<Map<String, String>> rows, String key) {
        BigDecimal x = BigDecimal.ZERO;
        for (Map<String, String> r : rows)
            try {
                x = x.add(new BigDecimal(first(r, key)));
            } catch (Exception ignored) {
            }
        return x;
    }

    private static String first(Map<String, String> m, String... k) {
        for (String x : k) {
            String v = clean(m.get(x));
            if (!v.isEmpty())
                return v;
        }
        return "";
    }

    private static String num(BigDecimal x) {
        return x.stripTrailingZeros().toPlainString();
    }

    private static String nullableNum(String v) {
        try {
            return new BigDecimal(clean(v)).stripTrailingZeros().toPlainString();
        } catch (Exception e) {
            return "null";
        }
    }

    private static String arg(String[] a, int i, String f) {
        return a != null && a.length > i && a[i] != null && !a[i].trim().isEmpty() ? a[i].trim() : f;
    }

    private static String sql(String v) {
        return v.replace("'", "''");
    }

    private static String field(String n, String v) {
        return "\"" + esc(n) + "\":\"" + esc(v) + "\"";
    }

    private static String clean(String v) {
        return v == null ? "" : v.trim();
    }

    private static String esc(String v) {
        return v == null ? "" : v.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    private static class Provider implements DestinationDataProvider {
        private final Properties p;

        Provider(Properties p) {
            this.p = p;
        }

        public Properties getDestinationProperties(String n) {
            return DESTINATION.equals(n) ? p : null;
        }

        public boolean supportsEvents() {
            return false;
        }

        public void setDestinationDataEventListener(DestinationDataEventListener l) {
        }
    }
}
