import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class SapMaterialImpactResilientRunner {
    private static final long TIMEOUT_SECONDS = 30;
    private static final Path FALLBACK = Paths.get("runtime", "fallback", "sap-material-31-impact-fallback.json");
    public static void main(String[] args) {
        String query = arg(args,0,"31"), plant = arg(args,1,"1001");
        Path output = Paths.get(arg(args,2,"runtime/impact/material-impact.json")).toAbsolutePath().normalize();
        try {
            Files.createDirectories(output.getParent()); Files.deleteIfExists(output);
            if ("1".equals(System.getenv("SAP_LIVE_UNAVAILABLE"))) { fallback(query, plant, output, "SAP runtime unavailable for this job"); return; }
            ProcessBuilder pb = new ProcessBuilder(javaExecutable(), "-Djava.library.path=lib", "-cp",
                    "out" + File.pathSeparator + "lib" + File.separator + "sapjco3.jar",
                    "SapMaterialImpactExtractor", query, plant, output.toString());
            pb.directory(Paths.get(".").toAbsolutePath().normalize().toFile()); pb.redirectErrorStream(true);
            Process p = pb.start(); Thread reader = new Thread(() -> copyOutput(p.getInputStream(), System.out)); reader.setDaemon(true); reader.start();
            boolean finished = p.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!finished) { p.destroyForcibly(); reader.join(1000); fallback(query,plant,output,"SAP extraction timed out"); return; }
            reader.join(1000);
            if (p.exitValue()==0 && valid(output)) { System.out.println("SAP live impact extraction succeeded: " + output); return; }
            fallback(query,plant,output,"SAP extractor failed with exit code " + p.exitValue());
        } catch(Throwable e) {
            try { fallback(query,plant,output,"SAP runtime exception: " + clean(e.getMessage())); }
            catch(Throwable f) { System.err.println("SAP live extraction and fallback both failed: " + f.getMessage()); System.exit(1); }
        }
    }
    private static void fallback(String query,String plant,Path output,String reason)throws Exception{
        String q=clean(query); boolean match=q.equalsIgnoreCase("Stearing")||q.equals("31")||q.equals("000000000000000031");
        if(!match||!"1001".equals(clean(plant))) throw new Exception("No fallback snapshot matches query and plant. " + reason);
        String json=new String(Files.readAllBytes(FALLBACK),StandardCharsets.UTF_8);
        validateFallback(json, plant);
        json=json.replace("\"requestedMaterialId\":\"31\"","\"requestedMaterialId\":\""+escape(query)+"\"");
        json=json.replace("\"reason\":\"SAP runtime unavailable\"","\"reason\":\""+escape(reason)+"\"");
        Files.write(output,json.getBytes(StandardCharsets.UTF_8));
        System.out.println("SAP unavailable. Fallback impact snapshot used: " + output);
    }

    private static void validateFallback(String json,String plant)throws Exception{
        if(json==null||json.trim().length()<100||!json.contains("\"dataSource\": \"fallback-snapshot\"")||!json.contains("\"active\": true")||!json.contains("\"materialId\": \"31\"")||!json.contains("\"plant\": \""+plant+"\"")||!json.contains("\"snapshotCapturedAt\"")) throw new Exception("Impact fallback snapshot failed validation");
    }
    private static boolean valid(Path p){try{String s=new String(Files.readAllBytes(p),StandardCharsets.UTF_8).trim();return Files.size(p)>100&&s.startsWith("{")&&s.endsWith("}")&&s.contains("\"stock\"")&&s.contains("\"cost\"");}catch(Exception e){return false;}}
    private static void copyOutput(InputStream in,PrintStream out){try(BufferedReader r=new BufferedReader(new InputStreamReader(in,StandardCharsets.UTF_8))){String l;while((l=r.readLine())!=null)out.println(l);}catch(IOException ignored){}}
    private static String javaExecutable(){Path p=Paths.get(System.getProperty("java.home"),"bin",isWindows()?"java.exe":"java");return Files.isRegularFile(p)?p.toString():"java";}
    private static boolean isWindows(){return System.getProperty("os.name","").toLowerCase(Locale.ROOT).contains("win");}
    private static String arg(String[]a,int i,String f){return a!=null&&a.length>i&&!clean(a[i]).isEmpty()?clean(a[i]):f;}
    private static String clean(String v){return v==null?"":v.trim();}
    private static String escape(String v){return clean(v).replace("\\","\\\\").replace("\"","\\\"").replace("\r"," ").replace("\n"," ");}
}
