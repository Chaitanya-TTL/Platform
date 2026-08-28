package com.teamcenter.hello;

import com.teamcenter.clientx.AppXCredentialManager;
import com.teamcenter.clientx.AppXSession;
import com.teamcenter.soa.client.model.strong.User;
import java.io.File;
import java.util.Scanner;

/** Teamcenter CLI. Both name- and ID-based extraction use the unchanged tc_extraction.json writer. */
public class Hello {
    public static void main(String[] args) {
        int exit = run(args);
        if (exit != 0) System.exit(exit);
    }

    private static int run(String[] args) {
        if (args.length > 0 && ("-h".equals(args[0]) || "-help".equals(args[0]))) { usage(); return 0; }
        String operation = property("operation", "extract").toLowerCase();
        String queryType = property("queryType", "auto").toLowerCase();
        String query = property("query", property("itemId", env("TC_ITEM_ID", "")));
        String output = property("output", operation.equals("search") ? "teamcenter-search.json" : "tc_extraction.json");
        int limit = integerProperty("limit", 20);
        if (query.isBlank() && operation.equals("extract")) query = prompt();
        if (query.isBlank()) { System.err.println("[ERROR] A Teamcenter name or Item ID query is required."); return 2; }

        AppXSession.getConfigurationFromTCCS();
        String host = AppXSession.getOptionalArg("host", env("TC_HOST", "http://hnjpitstop3srv:8080/tc"));
        String sso = AppXSession.getOptionalArg("sso", "");
        String appId = AppXSession.getOptionalArg("appID", "");
        AppXSession session = new AppXSession(host, sso, appId);
        try {
            login(session, sso, appId);
            TeamcenterSearch search = new TeamcenterSearch();
            TeamcenterSearchResult result = search.search(query, queryType, limit);
            if (operation.equals("search")) {
                TeamcenterSearch.writeJson(result, new File(output));
                System.out.println("[SEARCH] Result written to " + new File(output).getAbsolutePath());
                return "failed".equals(result.status) ? 4 : 0;
            }
            if (!operation.equals("extract")) { System.err.println("[ERROR] Unsupported operation: " + operation); return 2; }
            var selected = search.selectForExtraction(result);
            if (selected == null) {
                File diagnostic = new File(output + ".search.json");
                TeamcenterSearch.writeJson(result, diagnostic);
                System.err.println(result.candidates.isEmpty() ? "[ERROR] No Teamcenter Item matched the query." : "[ERROR] Query is ambiguous. Select an Item ID from " + diagnostic.getAbsolutePath());
                return result.candidates.isEmpty() ? 5 : 6;
            }
            return extract(selected, output);
        } catch (Exception ex) {
            System.err.println("[ERROR] Teamcenter operation failed: " + safe(ex));
            return 7;
        } finally {
            try { session.logout(); } catch (Exception ignored) { }
        }
    }

    private static int extract(TeamcenterSearchResult.Candidate selected, String output) {
        PLMXMLExport export = new PLMXMLExport();
        export.initializeObjectPolicy();
        export.setResolvedItem(selected.liveItem);
        export.setRoot(selected.itemId, selected.revisionId == null ? "" : selected.revisionId);
        try {
            if (!export.openBOMWindow()) { System.err.println("[ERROR] Failed to open BOM window."); return 8; }
            export.printFullBOMTree();
            export.exportToJson(new File(output));
            export.exportToPLMXML(new File(output).getAbsoluteFile().getParent() == null ? "." : new File(output).getAbsoluteFile().getParent());
            File created = new File(output);
            if (!created.isFile() || created.length() == 0) { System.err.println("[ERROR] tc_extraction JSON was not created."); return 9; }
            System.out.println("[JSON] Created canonical Teamcenter extraction: " + created.getAbsolutePath());
            return 0;
        } finally { export.closeBOM(); }
    }

    private static void login(AppXSession session,String sso,String appId) {
        String user=System.getenv("TC_USERNAME"), password=System.getenv("TC_PASSWORD");
        User loggedIn;
        if (user!=null&&!user.isBlank()&&password!=null&&!password.isBlank()) {
            AppXCredentialManager manager=new AppXCredentialManager(sso,appId);
            manager.setUserPassword(user,password,"EngineeringDiscovery");
            session.setCredentialManager(manager);
            loggedIn=session.login();
        } else loggedIn=session.login();
        if (loggedIn==null) throw new IllegalStateException("Teamcenter login did not return a user.");
    }

    private static String prompt(){System.out.print("Enter Teamcenter product name or Item ID: ");try(Scanner s=new Scanner(System.in)){return s.nextLine().trim();}catch(Exception e){return "";}}
    private static String property(String n,String d){String v=System.getProperty(n);return v==null||v.isBlank()?d:v.trim();}
    private static String env(String n,String d){String v=System.getenv(n);return v==null||v.isBlank()?d:v.trim();}
    private static int integerProperty(String n,int d){try{return Integer.parseInt(property(n,Integer.toString(d)));}catch(Exception e){return d;}}
    private static String safe(Exception e){String m=e.getMessage();return m==null?e.getClass().getSimpleName():m.replace('\n',' ').replace('\r',' ');}
    private static void usage(){System.out.println("Operations:\n  -Doperation=search -Dquery=<name-or-id> -DqueryType=auto|name|id -Doutput=<search.json>\n  -Doperation=extract -Dquery=<name-or-id> -DqueryType=auto|name|id -Doutput=<tc_extraction.json>");}
}
