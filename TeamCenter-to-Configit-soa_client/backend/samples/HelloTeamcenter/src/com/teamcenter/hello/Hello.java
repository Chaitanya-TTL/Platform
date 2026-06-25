//==================================================
//
// Copyright 2022 Siemens Digital Industries Software
//
//==================================================
package com.teamcenter.hello;

import com.teamcenter.clientx.AppXCredentialManager;
import com.teamcenter.clientx.AppXSession;
import com.teamcenter.soa.client.model.strong.User;
import java.io.File;
import java.util.Scanner;

/**
 * This sample client application demonstrates some of the basic features of the
 * Teamcenter Services framework and a few of the services.
 * 
 * PRIMARY FEATURE: Automated BOM extraction to JSON for ConfigitAceIntegration pipeline
 * - Extracts BOM structure from Teamcenter
 * - Generates tc_extraction.json in HelloTeamcenter folder
 * - Auto-syncs to ConfigitAceIntegration/tc_extraction.json for ETL processing
 */
public class Hello
{
    /**
     * @param args -help or -h will print out a Usage statement
     */
    public static void main(String[] args)
    {
        if (args.length > 0)
        {
            if (args[0].equals("-help") || args[0].equals("-h"))
            {
                System.out.println("usage: java [-Dhost=HostAdress] [-Dsso=SsoURL -DappID=AppID] com.teamcenter.hello.Hello");
                System.out.println("Where:");
                System.out.println(" host: The address of the Teamcenter server to connect to, supported protocols:");
                System.out.println(" HTTP(S): http://hnjpitstop3srv:8080/tc");
                System.out.println(" TCCS: tccs://env_name Will connect to Teamcenter using the specified environment name");
                System.out.println(" TCCS: tccs Will query the TCCS module for available environments");
                System.out.println(" TCCS options require the TCCS module to be installed (FMS_HOME environment variable set).");
                System.out.println(" If the given TCCS environment is configured with SSO those settings will be used.");
                System.out.println(" If this option is not provided, the client will default to http://hnjpitstop3srv:8080/tc.");
                System.out.println(" sso: The SSO URL, login prompt will be through SSO");
                System.out.println(" appID: The SSO application ID.");
                System.out.println(" If the SSO arguments are not provided, the client will prompt for credentials at the console.");
                System.out.println("");
                System.out.println("ITEM ID INPUT:");
                System.out.println(" -DitemId=<itemId>: Specify the item ID directly (non-interactive)");
                System.out.println(" TC_ITEM_ID: Environment variable for non-interactive mode");
                System.out.println(" If neither is provided, the client will prompt for item ID after login.");
                System.exit(0);
            }
        }

        // Load TCCS configuration if present
        AppXSession.getConfigurationFromTCCS();

        String serverHost = AppXSession.getOptionalArg("host", "http://hnjpitstop3srv:8080/tc");
        String ssoURL = AppXSession.getOptionalArg("sso", "");
        String appID = AppXSession.getOptionalArg("appID", "");

        AppXSession session = new AppXSession(serverHost, ssoURL, appID);

        // ✅ ETL PIPELINE ENHANCEMENT: Support non-interactive login via environment variables
        // Check for TC_USERNAME and TC_PASSWORD environment variables (set by orchestration batch script)
        String tcUsername = System.getenv("TC_USERNAME");
        String tcPassword = System.getenv("TC_PASSWORD");
        
        User user = null;
        
        if (tcUsername != null && !tcUsername.trim().isEmpty() && 
            tcPassword != null && !tcPassword.trim().isEmpty()) {
            // Environment variables provided - login non-interactively
            System.out.println("[ETL] Non-interactive login using environment credentials...");
            AppXCredentialManager credentialManager = new AppXCredentialManager(ssoURL, appID);
            credentialManager.setUserPassword(tcUsername, tcPassword, "ETLPipeline");
            session.setCredentialManager(credentialManager);
            user = session.login();
        } else {
            // No environment variables - use existing interactive prompt behavior
            System.out.println("[ETL] Interactive login mode (no environment credentials found)");
            user = session.login();
        }

        // ✅ Extract BOM structure BEFORE logout
        PLMXMLExport export = new PLMXMLExport();
        
        // Initialize object property policy after login
        export.initializeObjectPolicy();
        
        // Prompt for item ID after login (supports non-interactive via env vars or system properties)
        String itemId = promptForItemId();
        if (itemId != null && !itemId.trim().isEmpty()) {
            export.setRoot(itemId, "");
            System.out.println("[BOM] Item ID set to: " + itemId);
        } else {
            System.out.println("[BOM] No item ID provided. Using default: 000575");
        }
        
        // Load item and extract BOM structure
        if (export.loadRootItem())
        {
            System.out.println("Item loaded successfully");
            
            if (export.openBOMWindow())
            {
                System.out.println("BOM window opened successfully");
                
                // Print the full BOM tree with all variant details to console
                export.printFullBOMTree();
                
                // ✓ Export extraction to JSON in HelloTeamcenter folder
                File helloTeamcenterOutput = new File("tc_extraction.json");
                export.exportToJson(helloTeamcenterOutput);
                
                // NOTE: Auto-sync is DISABLED here
                // The batch file (run-pipeline.bat) will explicitly copy this file to ConfigitAceIntegration
                // This gives the batch orchestrator explicit control over file movement
            }
            else
            {
                System.out.println("Failed to open BOM window");
            }
            
            // Close the BOM window
            export.closeBOM();
            
            // ✅ NEW: Export to PLMXML (includes VariantRuleCheck with AND/OR rules)
            System.out.println("\n========== PLMXML EXPORT ==========");
            export.exportToPLMXML(".");  // Export to current directory (HelloTeamcenter folder)
            System.out.println("=====================================\n");
        }
        else
        {
            System.out.println("Failed to load item");
        }

        // Terminate the session with the Teamcenter server
        session.logout();
    }
    
    /**
     * Prompt for item ID after login. Supports three modes:
     * 1. System property (-DitemId=<id>) - highest priority
     * 2. Environment variable (TC_ITEM_ID) - medium priority
     * 3. Interactive prompt - lowest priority (if no env vars/properties set)
     */
    private static String promptForItemId() {
        // Check system property first
        String itemIdFromProperty = System.getProperty("itemId");
        if (itemIdFromProperty != null && !itemIdFromProperty.trim().isEmpty()) {
            System.out.println("[INPUT] Item ID from system property (-DitemId): " + itemIdFromProperty);
            return itemIdFromProperty.trim();
        }
        
        // Check environment variable
        String itemIdFromEnv = System.getenv("TC_ITEM_ID");
        if (itemIdFromEnv != null && !itemIdFromEnv.trim().isEmpty()) {
            System.out.println("[INPUT] Item ID from environment variable (TC_ITEM_ID): " + itemIdFromEnv);
            return itemIdFromEnv.trim();
        }
        
        // Interactive prompt
        System.out.println("\n========== ITEM ID SELECTION ==========");
        System.out.println("Enter the Teamcenter Item ID to extract BOM from:");
        System.out.print("> ");
        
        try (Scanner scanner = new Scanner(System.in)) {
            String input = scanner.nextLine().trim();
            if (!input.isEmpty()) {
                System.out.println("[INPUT] Item ID from user input: " + input);
                return input;
            } else {
                System.out.println("[INPUT] No input provided, will use application default");
                return null;
            }
        } catch (Exception e) {
            System.out.println("[INPUT] Error reading input: " + e.getMessage());
            return null;
        }
    }
    
    /**
     * Auto-sync generated tc_extraction.json to ConfigitAceIntegration folder
     * Searches for AceWindchill/ConfigitAceIntegration in parent directories
     */
    private static void syncToConfigitAceIntegration(File sourceFile) {
        try {
            if (!sourceFile.exists()) {
                System.out.println("[JSON] ERROR: Source file not found: " + sourceFile.getAbsolutePath());
                return;
            }
            
            // Search up directory tree for AceWindchill folder
            File searchDir = new File(System.getProperty("user.dir")).getParentFile();
            File targetFile = null;
            
            for (int depth = 0; depth < 8 && searchDir != null; depth++) {
                File aceWindchillCheck = new File(searchDir, "AceWindchill");
                if (aceWindchillCheck.isDirectory()) {
                    File configitTarget = new File(aceWindchillCheck, 
                        "ConfigitAceIntegration" + File.separator + "tc_extraction.json");
                    if (configitTarget.getParentFile().isDirectory()) {
                        targetFile = configitTarget;
                        break;
                    }
                }
                searchDir = searchDir.getParentFile();
            }
            
            if (targetFile != null) {
                java.nio.file.Files.copy(
                    sourceFile.toPath(),
                    targetFile.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING
                );
                System.out.println("[JSON] ✓ Synced to ConfigitAceIntegration: " + targetFile.getAbsolutePath());
            } else {
                System.out.println("[JSON] ℹ ConfigitAceIntegration folder not found in parent directories.");
                System.out.println("[JSON]   Location searched: Parent directories of current working directory");
                System.out.println("[JSON]   WORKAROUND: Manually copy tc_extraction.json from HelloTeamcenter to ConfigitAceIntegration");
            }
            
        } catch (Exception e) {
            System.out.println("[JSON] ⚠ Auto-sync failed: " + e.getMessage());
            System.out.println("[JSON]   WORKAROUND: Manually copy tc_extraction.json from HelloTeamcenter to ConfigitAceIntegration");
        }
    }
}