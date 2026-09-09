import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class SapMaterialHistoryResilientRunner {
    private static final long TIMEOUT_SECONDS = 30;
    private static final Path FALLBACK = Paths.get("runtime", "fallback", "sap-material-31-history-fallback.json");

    public static void main(String[] args) {
        String query = arg(args, 0, "31");
        String plant = arg(args, 1, "1001");
        String storage = arg(args, 2, "1D");
        Path output = Paths.get(arg(args, 3, "runtime/impact/material-history.json")).toAbsolutePath().normalize();
        try {
            Files.createDirectories(output.getParent());
            Files.deleteIfExists(output);
            if ("1".equals(System.getenv("SAP_LIVE_UNAVAILABLE"))) { useFallback(query, plant, storage, output, "SAP runtime unavailable for this job"); return; }
            ProcessBuilder pb = new ProcessBuilder(javaExecutable(), "-Djava.library.path=lib", "-cp",
                    "out" + File.pathSeparator + "lib" + File.separator + "sapjco3.jar",
                    "SapMaterialHistoryExtractor", query, plant, storage, output.toString());
            pb.directory(Paths.get(".").toAbsolutePath().normalize().toFile());
            pb.redirectErrorStream(true);
            Process process = pb.start();
            Thread outputReader = new Thread(() -> copyOutput(process.getInputStream(), System.out));
            outputReader.setDaemon(true);
            outputReader.start();
            boolean finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                outputReader.join(1000);
                useFallback(query, plant, storage, output, "SAP extraction timed out after " + TIMEOUT_SECONDS + " seconds");
                return;
            }
            outputReader.join(1000);
            if (process.exitValue() == 0 && isValidJsonOutput(output)) {
                System.out.println("SAP live history extraction succeeded: " + output);
                return;
            }
            useFallback(query, plant, storage, output, "SAP extractor failed with exit code " + process.exitValue());
        } catch (Throwable error) {
            try {
                useFallback(query, plant, storage, output, "SAP runtime exception: " + clean(error.getMessage()));
            } catch (Throwable fallbackError) {
                System.err.println("SAP live extraction and fallback both failed: " + fallbackError.getMessage());
                fallbackError.printStackTrace(System.err);
                System.exit(1);
            }
        }
    }

    private static void useFallback(String query, String plant, String storage, Path output, String reason) throws Exception {
        if (!supportsFallback(query, plant, storage)) {
            throw new Exception("No fallback snapshot matches query='" + query + "', plant='" + plant
                    + "', storageLocation='" + storage + "'. " + reason);
        }
        if (!Files.isRegularFile(FALLBACK)) throw new FileNotFoundException("Fallback file not found: " + FALLBACK.toAbsolutePath());
        String json = new String(Files.readAllBytes(FALLBACK), StandardCharsets.UTF_8);
        validateFallback(json, plant, storage);
        json = json.replace("\"requestedInput\": \"Stearing\"", "\"requestedInput\": \"" + escape(query) + "\"");
        String safeReason = escape(reason);
        json = json.replace("\"reason\": \"SAP runtime unavailable\"", "\"reason\": \"" + safeReason + "\"");
        Files.write(output, json.getBytes(StandardCharsets.UTF_8));
        System.out.println("SAP unavailable. Fallback history snapshot used: " + output);
        System.out.println("Fallback reason: " + reason);
    }


    private static void validateFallback(String json, String plant, String storage) throws Exception {
        if (json == null || json.trim().length() < 100 || !json.contains("\"dataSource\": \"fallback-snapshot\"") || !json.contains("\"active\": true") || !json.contains("\"materialId\": \"31\"") || !json.contains("\"plant\": \"" + plant + "\"") || !json.contains("\"storageLocation\": \"" + storage + "\"") || !json.contains("\"snapshotCapturedAt\"")) throw new Exception("History fallback snapshot failed validation");
    }
    private static boolean supportsFallback(String query, String plant, String storage) {
        String q = clean(query);
        boolean materialMatch = q.equalsIgnoreCase("Stearing") || q.equals("31") || q.equals("000000000000000031");
        return materialMatch && "1001".equals(clean(plant)) && (clean(storage).isEmpty() || "1D".equalsIgnoreCase(clean(storage)));
    }

    private static boolean isValidJsonOutput(Path output) {
        try {
            if (!Files.isRegularFile(output) || Files.size(output) < 100) return false;
            String json = new String(Files.readAllBytes(output), StandardCharsets.UTF_8).trim();
            return json.startsWith("{") && json.endsWith("}") && json.contains("\"material\"") && json.contains("\"events\"");
        } catch (Exception ignored) { return false; }
    }

    private static void copyOutput(InputStream in, PrintStream out) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) out.println(line);
        } catch (IOException ignored) { }
    }

    private static String javaExecutable() {
        String home = System.getProperty("java.home");
        Path exe = Paths.get(home, "bin", isWindows() ? "java.exe" : "java");
        return Files.isRegularFile(exe) ? exe.toString() : "java";
    }
    private static boolean isWindows() { return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win"); }
    private static String arg(String[] a, int i, String fallback) { return a != null && a.length > i && !clean(a[i]).isEmpty() ? clean(a[i]) : fallback; }
    private static String clean(String v) { return v == null ? "" : v.trim(); }
    private static String escape(String v) { return clean(v).replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", " ").replace("\n", " "); }
}
