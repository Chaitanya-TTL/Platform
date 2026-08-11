import com.sap.conn.jco.*;
import com.sap.conn.jco.ext.*;
import java.io.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
 
public class SapMaterialImpactExtractor {
    private static final String DESTINATION = "S4H_DESTINATION";
    private static final String CONFIG = "config/sap.properties";
    private static final int SAP_MATNR_LENGTH = 18;
 
    public static void main(String[] args) {
        String requestedMaterial = arg(args, 0, "PLM001008");
        String plant = arg(args, 1, "1001");
        String output = arg(args, 2, "sap_material_impact.json");
        String internalMaterial = toInternalMaterialNumber(requestedMaterial);
        String displayMaterial = toExternalMaterialNumber(internalMaterial);
        List<String> warnings = new ArrayList<>();
 
        try {
            Properties properties = loadProperties();
            if (!com.sap.conn.jco.ext.Environment.isDestinationDataProviderRegistered()) {
                com.sap.conn.jco.ext.Environment.registerDestinationDataProvider(new Provider(properties));
            }
 
            JCoDestination destination = JCoDestinationManager.getDestination(DESTINATION);
            destination.ping();
 
            Map<String, String> detail = getDetail(destination, internalMaterial, plant, warnings);
            Map<String, String> mara = firstRow(readTable(destination, "MARA",
                    new String[] { "MATNR", "MTART", "MEINS", "XCHPF", "MSTAE" },
                    options(eq("MATNR", internalMaterial)), warnings));
            Map<String, String> makt = firstRow(readTable(destination, "MAKT",
                    new String[] { "MATNR", "SPRAS", "MAKTX" },
                    options(eq("MATNR", internalMaterial), "AND SPRAS = 'E'"), warnings));
 
            List<Map<String, String>> locations = readTable(destination, "MARD",
                    new String[] { "MATNR", "WERKS", "LGORT", "LABST", "INSME", "EINME", "SPEME", "UMLME", "RETME" },
                    options(eq("MATNR", internalMaterial), andEq("WERKS", plant)), warnings);
 
            List<Map<String, String>> valuations = readTable(destination, "MBEW",
                    new String[] { "MATNR", "BWKEY", "BWTAR", "LBKUM", "SALK3", "VPRSV", "VERPR", "STPRS", "PEINH", "BKLAS" },
                    options(eq("MATNR", internalMaterial), andEq("BWKEY", plant)), warnings);
            Map<String, String> valuation = firstRow(valuations);
 
            Map<String, String> valuationArea = firstRow(readTable(destination, "T001K",
                    new String[] { "BWKEY", "BUKRS" }, options(eq("BWKEY", plant)), warnings));
            String companyCode = first(valuationArea, "BUKRS");
            Map<String, String> company = companyCode.isEmpty() ? new LinkedHashMap<>()
                    : firstRow(readTable(destination, "T001",
                            new String[] { "BUKRS", "WAERS" }, options(eq("BUKRS", companyCode)), warnings));
 
            String description = first(makt, "MAKTX");
            if (description.isEmpty()) description = first(detail, "MATL_DESC");
            String materialType = first(mara, "MTART");
            if (materialType.isEmpty()) materialType = first(detail, "MATL_TYPE");
            String unit = first(mara, "MEINS");
            if (unit.isEmpty()) unit = first(detail, "BASE_UOM", "BASE_UOM_ISO");
            if (unit.isEmpty()) warnings.add("Base unit was not returned by MARA or material-detail BAPI.");
 
            BigDecimal unrestricted = sum(locations, "LABST");
            BigDecimal quality = sum(locations, "INSME");
            BigDecimal restricted = sum(locations, "EINME");
            BigDecimal blocked = sum(locations, "SPEME");
            BigDecimal transfer = sum(locations, "UMLME");
            BigDecimal returnsStock = sum(locations, "RETME");
            BigDecimal totalPhysical = unrestricted.add(quality).add(restricted).add(blocked).add(transfer).add(returnsStock);
 
            Map<String, String> atp = availability(destination, internalMaterial, plant, unit, warnings);
 
            String priceControl = first(valuation, "VPRSV");
            String effectivePriceText = "S".equals(priceControl) ? first(valuation, "STPRS")
                    : "V".equals(priceControl) ? first(valuation, "VERPR") : "";
            BigDecimal valuatedQuantity = decimal(first(valuation, "LBKUM"));
            BigDecimal reportedValue = decimal(first(valuation, "SALK3"));
            BigDecimal effectivePrice = decimal(effectivePriceText);
            BigDecimal priceUnit = decimal(first(valuation, "PEINH"));
            BigDecimal calculatedValue = null;
            Boolean reconciled = null;
            if (valuatedQuantity != null && effectivePrice != null && priceUnit != null && priceUnit.signum() != 0) {
                calculatedValue = valuatedQuantity.multiply(effectivePrice).divide(priceUnit, 6, RoundingMode.HALF_UP)
                        .stripTrailingZeros();
                if (reportedValue != null) reconciled = calculatedValue.subtract(reportedValue).abs().compareTo(new BigDecimal("0.01")) <= 0;
            }
 
            boolean anyCoreData = !mara.isEmpty() || !makt.isEmpty() || !locations.isEmpty() || !valuations.isEmpty();
            String status = warnings.isEmpty() ? "complete" : anyCoreData ? "partial_success" : "failed";
 
            Path path = Paths.get(output).toAbsolutePath().normalize();
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            try (BufferedWriter writer = Files.newBufferedWriter(path, StandardCharsets.UTF_8)) {
                writer.write("{");
                writer.write(field("materialId", displayMaterial) + "," + field("internalMaterialId", internalMaterial) + ",");
                writer.write(field("requestedMaterialId", requestedMaterial) + "," + field("description", description) + ",");
                writer.write(field("materialType", materialType) + "," + field("baseUnit", unit) + ",");
                writer.write("\"batchManaged\":" + boolFlag(first(mara, "XCHPF")) + ",");
                writer.write(field("crossPlantStatus", first(mara, "MSTAE")) + "," + field("status", status) + ",");
 
                writer.write("\"organization\":{" + field("plant", plant) + "," + field("valuationArea", first(valuation, "BWKEY")) + ","
                        + field("companyCode", companyCode) + "," + field("currency", first(company, "WAERS")) + "},");
 
                writer.write("\"stock\":{\"unrestricted\":" + num(unrestricted)
                        + ",\"qualityInspection\":" + num(quality)
                        + ",\"restrictedUse\":" + num(restricted)
                        + ",\"blocked\":" + num(blocked)
                        + ",\"inTransfer\":" + num(transfer)
                        + ",\"returns\":" + num(returnsStock)
                        + ",\"totalPhysical\":" + num(totalPhysical)
                        + ",\"atpAvailable\":" + nullableNum(first(atp, "AV_QTY_PLT")) + "},");
 
                writer.write("\"inventory\":{\"valuatedQuantity\":" + nullableNum(first(valuation, "LBKUM"))
                        + ",\"totalStockValue\":" + nullableNum(first(valuation, "SALK3"))
                        + "," + field("valuationType", first(valuation, "BWTAR")) + "},");
 
                writer.write("\"cost\":{" + field("priceControl", priceControl)
                        + ",\"standardPrice\":" + nullableNum(first(valuation, "STPRS"))
                        + ",\"movingAveragePrice\":" + nullableNum(first(valuation, "VERPR"))
                        + ",\"priceUnit\":" + nullableNum(first(valuation, "PEINH"))
                        + ",\"effectiveUnitCost\":" + nullableNum(effectivePriceText)
                        + "," + field("valuationClass", first(valuation, "BKLAS")) + "},");
 
                writer.write("\"checks\":{\"calculatedInventoryValue\":" + nullableNum(calculatedValue)
                        + ",\"reportedInventoryValue\":" + nullableNum(reportedValue)
                        + ",\"valuationReconciled\":" + nullableBoolean(reconciled) + "},");
 
                writer.write("\"storageLocations\":[");
                for (int i = 0; i < locations.size(); i++) {
                    if (i > 0) writer.write(',');
                    Map<String, String> row = locations.get(i);
                    writer.write("{" + field("storageLocation", first(row, "LGORT"))
                            + ",\"unrestricted\":" + nullableNum(first(row, "LABST"))
                            + ",\"qualityInspection\":" + nullableNum(first(row, "INSME"))
                            + ",\"restrictedUse\":" + nullableNum(first(row, "EINME"))
                            + ",\"blocked\":" + nullableNum(first(row, "SPEME"))
                            + ",\"inTransfer\":" + nullableNum(first(row, "UMLME"))
                            + ",\"returns\":" + nullableNum(first(row, "RETME")) + "}");
                }
                writer.write("],");
 
                writer.write("\"warnings\":[");
                for (int i = 0; i < warnings.size(); i++) {
                    if (i > 0) writer.write(',');
                    writer.write("\"" + esc(warnings.get(i)) + "\"");
                }
                writer.write("]," + field("extractedAt", Instant.now().toString()) + "}");
            }
 
            System.out.println("SAP material impact JSON created: " + path);
            System.out.println("Requested material: " + requestedMaterial + "; internal MATNR: " + internalMaterial);
            System.out.println("Status: " + status + "; storage locations: " + locations.size()
                    + "; valuation rows: " + valuations.size());
        } catch (Throwable error) {
            System.err.println("SAP material impact extraction failed: " + error.getMessage());
            error.printStackTrace();
            System.exit(1);
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
        if (cleaned.matches("\\d+")) {
            String external = cleaned.replaceFirst("^0+(?!$)", "");
            return external.isEmpty() ? "0" : external;
        }
        return cleaned;
    }
 
    private static Map<String, String> getDetail(JCoDestination destination, String material, String plant,
            List<String> warnings) throws JCoException {
        JCoFunction function = destination.getRepository().getFunction("BAPI_MATERIAL_GET_DETAIL");
        if (function == null) {
            warnings.add("BAPI_MATERIAL_GET_DETAIL unavailable");
            return new LinkedHashMap<>();
        }
        set(function.getImportParameterList(), "MATERIAL", material);
        set(function.getImportParameterList(), "PLANT", plant);
        set(function.getImportParameterList(), "VALUATIONAREA", plant);
        function.execute(destination);
        Map<String, String> output = new LinkedHashMap<>();
        output.putAll(record(structureIfPresent(function.getExportParameterList(), "MATERIAL_GENERAL_DATA")));
        output.putAll(record(structureIfPresent(function.getExportParameterList(), "MATERIALVALUATIONDATA")));
        String message = returnMessage(structureIfPresent(function.getExportParameterList(), "RETURN"));
        if (!message.isEmpty() && !message.startsWith("S ")) warnings.add(message);
        return output;
    }
 
    private static Map<String, String> availability(JCoDestination destination, String material, String plant,
            String unit, List<String> warnings) {
        Map<String, String> result = new LinkedHashMap<>();
        try {
            JCoFunction function = destination.getRepository().getFunction("BAPI_MATERIAL_AVAILABILITY");
            if (function == null) {
                warnings.add("BAPI_MATERIAL_AVAILABILITY unavailable");
                return result;
            }
            set(function.getImportParameterList(), "MATERIAL", material);
            set(function.getImportParameterList(), "PLANT", plant);
            if (!unit.isEmpty()) set(function.getImportParameterList(), "UNIT", unit);
            function.execute(destination);
            result.put("AV_QTY_PLT", clean(function.getExportParameterList().getString("AV_QTY_PLT")));
            String message = returnMessage(structureIfPresent(function.getExportParameterList(), "RETURN"));
            if (!message.isEmpty() && !message.startsWith("S ")) warnings.add(message);
        } catch (Exception error) {
            warnings.add("ATP unavailable: " + clean(error.getMessage()));
        }
        return result;
    }
 
    private static List<Map<String, String>> readTable(JCoDestination destination, String table, String[] fields,
            List<String> options, List<String> warnings) {
        List<Map<String, String>> rows = new ArrayList<>();
        try {
            JCoFunction function = destination.getRepository().getFunction("RFC_READ_TABLE");
            if (function == null) throw new Exception("RFC_READ_TABLE unavailable");
            set(function.getImportParameterList(), "QUERY_TABLE", table);
            set(function.getImportParameterList(), "DELIMITER", "|");
            JCoTable fieldTable = function.getTableParameterList().getTable("FIELDS");
            for (String name : fields) {
                fieldTable.appendRow();
                fieldTable.setValue("FIELDNAME", name);
            }
            JCoTable optionTable = function.getTableParameterList().getTable("OPTIONS");
            for (String option : options) {
                optionTable.appendRow();
                optionTable.setValue("TEXT", option);
            }
            function.execute(destination);
            JCoTable data = function.getTableParameterList().getTable("DATA");
            for (int rowIndex = 0; rowIndex < data.getNumRows(); rowIndex++) {
                data.setRow(rowIndex);
                String[] values = data.getString("WA").split("\\|", -1);
                Map<String, String> row = new LinkedHashMap<>();
                for (int fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
                    row.put(fields[fieldIndex], fieldIndex < values.length ? clean(values[fieldIndex]) : "");
                }
                rows.add(row);
            }
        } catch (Exception error) {
            warnings.add(table + " read unavailable: " + clean(error.getMessage()));
        }
        return rows;
    }
 
    private static List<String> options(String... values) {
        return Arrays.asList(values);
    }
 
    private static String eq(String field, String value) {
        return field + " = '" + sql(value) + "'";
    }
 
    private static String andEq(String field, String value) {
        return "AND " + eq(field, value);
    }
 
    private static JCoStructure structureIfPresent(JCoParameterList list, String name) {
        if (list == null) return null;
        try {
            return list.getStructure(name);
        } catch (Exception ignored) {
            return null;
        }
    }
 
    private static Map<String, String> firstRow(List<Map<String, String>> rows) {
        return rows.isEmpty() ? new LinkedHashMap<>() : rows.get(0);
    }
 
    private static Map<String, String> record(JCoRecord record) {
        Map<String, String> result = new LinkedHashMap<>();
        if (record == null) return result;
        JCoFieldIterator iterator = record.getFieldIterator();
        while (iterator.hasNextField()) {
            JCoField field = iterator.nextField();
            String value = clean(field.getString());
            if (!value.isEmpty()) result.put(field.getName(), value);
        }
        return result;
    }
 
    private static String returnMessage(JCoStructure result) {
        if (result == null) return "";
        String type = clean(result.getString("TYPE"));
        String code = clean(result.getString("CODE"));
        String message = clean(result.getString("MESSAGE"));
        if ("S".equalsIgnoreCase(type) && message.isEmpty()) return "";
        if (type.isEmpty() && code.isEmpty() && message.isEmpty()) return "";
        return (type + " " + code + " " + message).trim();
    }
 
    private static void set(JCoParameterList parameters, String name, String value) {
        if (parameters == null) return;
        try {
            parameters.setValue(name, value);
        } catch (Exception ignored) {
        }
    }
 
    private static BigDecimal sum(List<Map<String, String>> rows, String key) {
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, String> row : rows) {
            BigDecimal value = decimal(first(row, key));
            if (value != null) total = total.add(value);
        }
        return total;
    }
 
    private static BigDecimal decimal(String value) {
        try {
            return new BigDecimal(clean(value));
        } catch (Exception ignored) {
            return null;
        }
    }
 
    private static String first(Map<String, String> values, String... keys) {
        for (String key : keys) {
            String value = clean(values.get(key));
            if (!value.isEmpty()) return value;
        }
        return "";
    }
 
    private static String num(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }
 
    private static String nullableNum(String value) {
        BigDecimal parsed = decimal(value);
        return parsed == null ? "null" : num(parsed);
    }
 
    private static String nullableNum(BigDecimal value) {
        return value == null ? "null" : num(value);
    }
 
    private static String nullableBoolean(Boolean value) {
        return value == null ? "null" : value.toString();
    }
 
    private static String boolFlag(String value) {
        return "X".equalsIgnoreCase(clean(value)) ? "true" : "false";
    }
 
    private static String arg(String[] args, int index, String fallback) {
        return args != null && args.length > index && args[index] != null && !args[index].trim().isEmpty()
                ? args[index].trim() : fallback;
    }
 
    private static String sql(String value) {
        return clean(value).replace("'", "''");
    }
 
    private static String field(String name, String value) {
        return "\"" + esc(name) + "\":\"" + esc(value) + "\"";
    }
 
    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
 
    private static String esc(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }
 
    private static Properties loadProperties() throws Exception {
        Properties properties = new Properties();
        try (FileInputStream input = new FileInputStream(CONFIG)) {
            properties.load(input);
        }
        return properties;
    }
 
    private static class Provider implements DestinationDataProvider {
        private final Properties properties;
        Provider(Properties properties) { this.properties = properties; }
        public Properties getDestinationProperties(String name) { return DESTINATION.equals(name) ? properties : null; }
        public boolean supportsEvents() { return false; }
        public void setDestinationDataEventListener(DestinationDataEventListener listener) { }
    }
}