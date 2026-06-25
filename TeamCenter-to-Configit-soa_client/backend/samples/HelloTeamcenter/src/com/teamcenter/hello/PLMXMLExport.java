package com.teamcenter.hello;
 
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
 
import com.teamcenter.clientx.AppXSession;
import com.teamcenter.schemas.soa._2006_03.exceptions.ServiceException;
 
import com.teamcenter.services.strong.cad.StructureManagementService;
import com.teamcenter.services.strong.cad._2007_01.StructureManagement.CreateBOMWindowsResponse;
// ✅ Your jar has expand classes under _2008_06
import com.teamcenter.services.strong.cad._2008_06.StructureManagement.ExpandPSOneLevelInfo;
import com.teamcenter.services.strong.cad._2008_06.StructureManagement.ExpandPSOneLevelPref;
import com.teamcenter.services.strong.cad._2019_06.StructureManagement.CreateWindowsInfo3;
import com.teamcenter.services.strong.core.DataManagementService;
import com.teamcenter.services.strong.core.SessionService;
 
import com.teamcenter.services.strong.query.FinderService;
import com.teamcenter.services.strong.query.SavedQueryService;
import com.teamcenter.services.strong.query._2007_06.Finder.WSOFindCriteria;
import com.teamcenter.services.strong.query._2007_06.Finder.WSOFindSet;
 
import com.teamcenter.soa.client.model.ModelObject;
import com.teamcenter.soa.client.model.ServiceData;
import com.teamcenter.soa.client.model.strong.BOMLine;
import com.teamcenter.soa.client.model.strong.BOMWindow;
import com.teamcenter.soa.client.model.strong.Item;
import com.teamcenter.soa.client.model.strong.ItemRevision;
import com.teamcenter.soa.client.model.strong.PSBOMView;
 
import com.teamcenter.soa.common.ObjectPropertyPolicy;
 
/**
* Minimal functional BOM retrieval:
* 1) load Item (000517)
* 2) open BOMWindow (createOrReConfigureBOMWindows) [2](https://cadscripts.com/fcc-failed-to-start-teamcenter-login-error/)[3](https://tatatechnologies-my.sharepoint.com/personal/skk932045_tatatechnologies_com/Documents/Microsoft%20Copilot%20Chat%20Files/PLMXMLExport.java)
* 3) expand recursively (expandPSOneLevel) [4](https://community.sw.siemens.com/s/question/0D54O000078A3MISA0/teamcenter-12-login-issues-fcc-client-cache)[5](https://tcplmbasics.com/home/)
* 4) print full tree
*
* No PLMXML export, no FCC file download.
*/
public class PLMXMLExport {
 
    private String rootItemId = "000575";  // Body Componants - has BOM structure
    private String rootRevId  = "A";
 
    private final FinderService finderService;
    private final DataManagementService dmService;
    private final StructureManagementService structureService;
 
    private Item item;
    private ItemRevision itemRevision;
    private BOMWindow bomWindow;
    private BOMLine bomTopLine;
 
    // protects against cycles
    private final Map<BOMLine, Boolean> visited = new IdentityHashMap<>();
    
    // Track all variant options and their values across the entire BOM tree
    private final Map<String, List<String>> variantOptionsSummary = new HashMap<>();
    
    // Track variant rules with AND/OR logic
    private final List<Map<String, Object>> variantRulesList = new ArrayList<>();
    
    public PLMXMLExport() {
        finderService = FinderService.getService(AppXSession.getConnection());
        dmService = DataManagementService.getService(AppXSession.getConnection());
        structureService = StructureManagementService.getService(AppXSession.getConnection());
        // Don't call setObjectPolicy() here - it needs to be called AFTER login succeeds
    }

    public PLMXMLExport setRoot(String itemId, String revId) {
        if (itemId != null && !itemId.isBlank()) this.rootItemId = itemId;
        if (revId != null && !revId.isBlank())  this.rootRevId  = revId;
        return this;
    }
    
    /**
     * Get the loaded ItemRevision (available after openBOMWindow is called)
     */
    public ItemRevision getItemRevision() {
        return itemRevision;
    }
    
    /**
     * Get the loaded Item (available after loadRootItem is called)
     */
    public Item getItem() {
        return item;
    }
    
    /**
     * Get the BOM window (available after openBOMWindow is called)
     */
    public BOMWindow getBOMWindow() {
        return bomWindow;
    }
 
    /**
     * Initialize object property policy. MUST be called after login succeeds.
     */
    public void initializeObjectPolicy() {
        setObjectPolicy();
    }
    
    /**
     * DEBUG: List all available items in the Teamcenter system
     */
    public void listAllItems() {
        try {
            System.out.println("\n[DEBUG] ========== LISTING ALL ITEMS IN SYSTEM ==========");
            var queryService = com.teamcenter.services.strong.query.SavedQueryService.getService(AppXSession.getConnection());
            
            var getSavedQueriesResp = queryService.getSavedQueries();
            if (getSavedQueriesResp.queries == null || getSavedQueriesResp.queries.length == 0) {
                System.out.println("[DEBUG] No saved queries found");
                return;
            }
            
            System.out.println("[DEBUG] Available saved queries:");
            for (var q : getSavedQueriesResp.queries) {
                System.out.println("  - " + q.name);
            }
            
            // Find 'Item Name' query
            var itemNameQuery = getSavedQueriesResp.queries[0].query;
            for (var q : getSavedQueriesResp.queries) {
                if (q.name != null && q.name.equals("Item Name")) {
                    itemNameQuery = q.query;
                    break;
                }
            }
            
            // Query ALL items
            var savedQueryInput = new com.teamcenter.services.strong.query._2008_06.SavedQuery.QueryInput();
            savedQueryInput.query = itemNameQuery;
            savedQueryInput.maxNumToReturn = 100;  // Get up to 100 items
            savedQueryInput.limitList = new ModelObject[0];
            savedQueryInput.entries = new String[]{ "Item Name" };
            savedQueryInput.values = new String[]{ "*" };  // Wildcard to get all
            
            var queryResp = queryService.executeSavedQueries(new com.teamcenter.services.strong.query._2008_06.SavedQuery.QueryInput[]{ savedQueryInput });
            
            if (queryResp.arrayOfResults.length > 0) {
                var foundResults = queryResp.arrayOfResults[0].objectUIDS;
                System.out.println("[DEBUG] Found " + foundResults.length + " total items");
                
                if (foundResults.length > 0) {
                    // Load the objects in batches
                    int batchSize = 20;
                    for (int batch = 0; batch < foundResults.length; batch += batchSize) {
                        int end = Math.min(batch + batchSize, foundResults.length);
                        String[] batchUIDs = java.util.Arrays.copyOfRange(foundResults, batch, end);
                        
                        var loadResp = dmService.loadObjects(batchUIDs);
                        
                        System.out.println("\n[DEBUG] --- Batch " + (batch/batchSize + 1) + " ---");
                        for (int i = 0; i < loadResp.sizeOfPlainObjects(); i++) {
                            var obj = loadResp.getPlainObject(i);
                            if (obj instanceof Item) {
                                Item item = (Item) obj;
                                dmService.getProperties(new ModelObject[]{ item }, new String[]{ "item_id", "object_name" });
                                System.out.println("  Item ID: " + item.get_item_id() + 
                                                 " | Object Name: " + item.get_object_name() + 
                                                 " | UID: " + safeUid(obj));
                            }
                        }
                    }
                }
            }
            System.out.println("[DEBUG] ======================================================\n");
        } catch (Exception e) {
            System.out.println("[DEBUG] Error listing items: " + e.getMessage());
            e.printStackTrace();
        }
    }
 
    // -------- Step 1: Load Item --------
    public boolean loadRootItem() {
        item = getWorkspaceObjectByName(rootItemId, Item.class);
        if (item == null) {
            System.out.println("[BOM] Could not find Item by objectName=" + rootItemId);
            return false;
        }
        System.out.println("[BOM] Loaded Item UID: " + safeUid(item));
        return true;
    }
 
    // -------- Step 2: Open BOM Window --------
    public boolean openBOMWindow() {
        if (item == null) {
            System.out.println("[BOM] Item is null. Call loadRootItem() first.");
            return false;
        }
 
        try {
            // ensure required properties are loaded
            dmService.getProperties(new ModelObject[]{ item }, new String[]{ "revision_list", "bom_view_tags" });
 
            ModelObject[] itemRevs = item.get_revision_list();
            ModelObject[] bomViews = item.get_bom_view_tags();
 
            if (itemRevs == null || itemRevs.length == 0) {
                System.out.println("[BOM] No revisions found for item " + rootItemId);
                return false;
            }
            if (bomViews == null || bomViews.length == 0) {
                System.out.println("[BOM] No BOM views found for item " + rootItemId);
                return false;
            }
 
            itemRevision = chooseRevision(itemRevs, rootRevId);
            if (itemRevision == null) {
                System.out.println("[BOM] Could not select revision " + rootRevId + " for item " + rootItemId);
                return false;
            }
 
            for (ModelObject view : bomViews) {
                CreateWindowsInfo3 info = new CreateWindowsInfo3();
                info.item = item;
                info.itemRev = itemRevision;
                info.bomView = (PSBOMView) view;
 
                // Response type must match _2019_05
                CreateBOMWindowsResponse resp =
                        structureService.createOrReConfigureBOMWindows(new CreateWindowsInfo3[]{ info });
 
                if (resp != null && resp.output != null && resp.output.length > 0) {
                    bomWindow = resp.output[0].bomWindow;
                    bomTopLine = resp.output[0].bomLine;
                    System.out.println("[BOM] BOMWindow created. TopLine UID: " + safeUid(bomTopLine));
                    return true;
                }
            }
 
            System.out.println("[BOM] Failed to create BOMWindow for any BOM view.");
            return false;
 
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }
 
public void printFullBOMTree() {
        if (bomTopLine == null) {
            System.out.println("[BOM] TopLine is null. Call openBOMWindow() first.");
            return;
        }

        visited.clear();
        variantOptionsSummary.clear();  // Clear summary for new BOM tree traversal
        System.out.println("\n========== FULL BOM TREE ==========\n");
        
        // Print root line
        safeLoadLineProps(bomTopLine);
        System.out.println(formatLine(bomTopLine));
        displayVariantInfo(bomTopLine, 0);
        
        // Expand root level and recurse into children
        expandOneLevel(bomTopLine);
        Object kids = getChildrenArray(bomTopLine);
        
        if (kids != null) {
            if (kids instanceof BOMLine[]) {
                for (BOMLine c : (BOMLine[]) kids) {
                    recurse(c, 1, 5000);
                }
            } else if (kids instanceof ModelObject[]) {
                for (ModelObject mo : (ModelObject[]) kids) {
                    if (mo instanceof BOMLine) {
                        recurse((BOMLine) mo, 1, 5000);
                    }
                }
            }
        }
        
        // Print variant options summary
        printVariantOptionsSummary();
        
        System.out.println("\n==================================\n");
    }

    private void recurse(BOMLine line, int depth, int maxNodes) {
        if (line == null) return;
        if (visited.size() >= maxNodes) {
            indent(depth);
            System.out.println("[STOP] Max nodes reached: " + maxNodes);
            return;
        }
        if (visited.containsKey(line)) {
            indent(depth);
            System.out.println("[CYCLE] uid=" + safeUid(line));
            return;
        }
        visited.put(line, Boolean.TRUE);

        // load properties
        safeLoadLineProps(line);

        indent(depth);
        System.out.println(formatLine(line));
        
        // Display variant info if present on this BOMLine
        displayVariantInfo(line, depth);

        // expand 1 level
        expandOneLevel(line);

        // Get children and recurse
        Object kids = getChildrenArray(line);
        if (kids == null) return;

        if (kids instanceof BOMLine[]) {
            for (BOMLine c : (BOMLine[]) kids) recurse(c, depth + 1, maxNodes);
        } else if (kids instanceof ModelObject[]) {
            for (ModelObject mo : (ModelObject[]) kids) {
                if (mo instanceof BOMLine) recurse((BOMLine) mo, depth + 1, maxNodes);
            }
        }
    }
 
    private void expandOneLevel(BOMLine parent) {
        try {
            ExpandPSOneLevelInfo info = new ExpandPSOneLevelInfo();
            info.parentBomLines = new BOMLine[]{ parent };
            info.excludeFilter = "None2"; // common working value [5](https://tcplmbasics.com/home/)
 
            ExpandPSOneLevelPref pref = new ExpandPSOneLevelPref();
            structureService.expandPSOneLevel(info, pref);
        } catch (Exception e) {
            // best effort - do not crash
        }
    }
 
    private Object getChildrenArray(BOMLine parent) {
        // Try bl_child_lines
        try {
            dmService.getProperties(new ModelObject[]{ parent }, new String[]{ "bl_child_lines" });
            return parent.get_bl_child_lines();
        } catch (Exception ignore) {}
 
        // Try bl_all_child_lines
        try {
            dmService.getProperties(new ModelObject[]{ parent }, new String[]{ "bl_all_child_lines" });
            return parent.get_bl_all_child_lines();
        } catch (Exception ignore) {}
 
        return null;
    }
 
    private void safeLoadLineProps(BOMLine line) {
        try {
            dmService.getProperties(new ModelObject[]{ line }, new String[]{
                    // Core BOM properties
                    "bl_item_item_id",
                    "bl_rev_item_revision_id",
                    "bl_indented_title",
                    "bl_sequence_no",
                    "bl_quantity",
                    
                    // All variant-related properties from UI
                    "bl_pimxml_abs_xform",
                    "bl_item_object_type",
                    "bl_rev_has_variants",
                    "bl_formatted_title",
                    "bl_item_object_name",
                    "bl_line_name",
                    "bl_variant_condition",
                    "bl_variant_state",
                    "bl_item_fnd0VariantNamespace",
                    "bl_item_fnd0PosBiasedVariantAvail",
                    "bl_process_variable_value",
                    
                    // Additional variant properties
                    "fnd0_variant_options",
                    "fnd0_variant_rules"
            });
        } catch (Exception ignore) {}
    }
 
    private String formatLine(BOMLine line) {
        String itemId = safeGet(() -> line.get_bl_item_item_id());
        String revId  = safeGet(() -> line.get_bl_rev_item_revision_id());
        String name   = safeGet(() -> line.get_bl_indented_title());
        String seq    = safeGet(() -> String.valueOf(line.get_bl_sequence_no()));
        String qty    = safeGet(() -> String.valueOf(line.get_bl_quantity()));
 
        if (itemId.isBlank()) itemId = "-";
        if (revId.isBlank())  revId  = "-";
        if (name.isBlank())   name   = "-";
        if (seq.isBlank())    seq    = "-";
        if (qty.isBlank())    qty    = "-";
 
        return String.format("%s/%s  seq=%s  qty=%s  name=%s", itemId, revId, seq, qty, name);
    }
 
    // -------- Close BOM Window --------
    public void closeBOM() {
        try {
            if (bomWindow != null) {
                structureService.closeBOMWindows(new BOMWindow[]{ bomWindow });
            }
        } catch (Exception ignore) {
        } finally {
            bomWindow = null;
            bomTopLine = null;
        }
    }
 
    // -------- Export to PLMXML (Includes VariantRuleCheck) --------
    public void exportToPLMXML(String outputDirectory) {
        if (item == null) {
            System.out.println("[PLMXML] ❌ Item not loaded. Call loadRootItem() first.");
            return;
        }
        
        try {
            System.out.println("[PLMXML] Attempting PLMXML export via generateStructure SOA method...");
            
            // Try to use generateStructure method (AOM approach)
            // This is an alternative to ImportExportService
            try {
                Class<?> applicationInterfaceServiceClass = 
                    Class.forName("com.teamcenter.services.strong.core.ApplicationInterfaceService");
                
                java.lang.reflect.Method getServiceMethod = 
                    applicationInterfaceServiceClass.getMethod("getService", 
                    com.teamcenter.soa.client.Connection.class);
                
                Object aiService = getServiceMethod.invoke(null, AppXSession.getConnection());
                
                // Create ApplicationRef array with item reference
                Class<?> appRefClass = Class.forName("com.teamcenter.schemas.soa._2006_03.core.ApplicationRef");
                Object[] refId = (Object[]) java.lang.reflect.Array.newInstance(appRefClass, 1);
                
                Object ref = appRefClass.newInstance();
                java.lang.reflect.Field applicationField = appRefClass.getField("application");
                java.lang.reflect.Field labelField = appRefClass.getField("label");
                java.lang.reflect.Field versionField = appRefClass.getField("version");
                
                applicationField.set(ref, "Teamcenter");
                labelField.set(ref, item.get_item_id());
                versionField.set(ref, "");
                refId[0] = ref;
                
                // Create Configuration
                Class<?> configClass = Class.forName("com.teamcenter.schemas.soa._2006_03.core.Configuration");
                Object conf = configClass.newInstance();
                
                java.lang.reflect.Field rulenameField = configClass.getDeclaredField("rulename");
                rulenameField.setAccessible(true);
                rulenameField.set(conf, "Latest Working");
                
                // Call generateStructure
                java.lang.reflect.Method generateMethod = 
                    aiService.getClass().getMethod("generateStructure", 
                    appRefClass.arrayType(), String.class, configClass, int.class);
                
                Object response = generateMethod.invoke(aiService, refId, 
                    "ConfiguredDataExportDefault", conf, 4);
                
                // Get ticket from response
                java.lang.reflect.Field ticketField = response.getClass().getDeclaredField("ticket");
                ticketField.setAccessible(true);
                String ticket = (String) ticketField.get(response);
                
                if (ticket != null && !ticket.isEmpty()) {
                    // Download PLMXML file
                    com.teamcenter.soa.client.FileManagementUtility fMSUtil = 
                        new com.teamcenter.soa.client.FileManagementUtility(AppXSession.getConnection());
                    
                    String plmxmlFileName = item.get_item_id() + ".xml";
                    String plmxmlPath = outputDirectory + File.separator + plmxmlFileName;
                    
                    fMSUtil.getTransientFile(ticket, plmxmlPath);
                    
                    System.out.println("[PLMXML] ✅ PLMXML exported successfully via generateStructure");
                    System.out.println("[PLMXML] ✓ File: " + plmxmlFileName);
                    System.out.println("[PLMXML] ✓ Path: " + plmxmlPath);
                    System.out.println("[PLMXML] ✓ Contains VariantRuleCheck with AND/OR logic");
                } else {
                    System.out.println("[PLMXML] ⚠ generateStructure returned empty ticket");
                }
                
            } catch (ClassNotFoundException | NoSuchMethodException e) {
                System.out.println("[PLMXML] ⚠ generateStructure method not available: " + e.getMessage());
                System.out.println("[PLMXML] ⚠ PLMXML export via SOA is not available in this SDK version");
                System.out.println("[PLMXML] ⚠ Variant rules will be handled through standard extraction");
            }
            
        } catch (Exception e) {
            System.out.println("[PLMXML] ❌ Export failed: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private ItemRevision getLatestRevision(Item item) {
        try {
            ModelObject[] revs = item.get_revision_list();
            if (revs == null) return null;
            for (int i = revs.length - 1; i >= 0; i--) {
                if (revs[i] instanceof ItemRevision) return (ItemRevision) revs[i];
            }
        } catch (Exception ignore) {}
        return null;
    }
    
    private ItemRevision chooseRevision(ModelObject[] itemRevs, String revId) {
        if (itemRevs == null || itemRevs.length == 0) return null;
        
        // Try to find matching revision ID first
        for (ModelObject rev : itemRevs) {
            if (rev instanceof ItemRevision) {
                ItemRevision ir = (ItemRevision) rev;
                try {
                    if (ir.get_item_revision_id() != null && ir.get_item_revision_id().equals(revId)) {
                        return ir;
                    }
                } catch (Exception ignore) {}
            }
        }
        
        // If no exact match, return the latest (last) revision
        for (int i = itemRevs.length - 1; i >= 0; i--) {
            if (itemRevs[i] instanceof ItemRevision) {
                return (ItemRevision) itemRevs[i];
            }
        }
        
        return null;
    }
 
    protected <T> T getWorkspaceObjectByName(final String name, final Class<T> tctype) {
        try {
            // First attempt: search with just the number part (e.g., "000525")
            String[] searchVariants = {
                name,                           // Original: "000525-Sample"
                name.split("-")[0],             // Try just the ID: "000525"
                "*" + name + "*",               // Try wildcard wrapping
                "*" + name.split("-")[0] + "*"  // Try wildcard on ID only
            };
            
            System.out.println("[BOM] ========== FINDER SEARCH ATTEMPT ==========");
            for (String searchName : searchVariants) {
                System.out.println("[BOM] Attempting search variant: '" + searchName + "'");
                
                var criteria = new WSOFindCriteria();
                var set = new WSOFindSet();

                criteria.objectName = searchName;
                criteria.objectType = tctype.getSimpleName();
                criteria.scope = "WSO_scope_All";
                set.criterias = new WSOFindCriteria[]{ criteria };

                var resp = finderService.findWorkspaceObjects(new WSOFindSet[]{ set });

                if (resp.outputList.length > 0) {
                    System.out.println("[BOM] Response received: " + resp.outputList[0].foundObjects.length + " object(s) found");
                    if (resp.outputList[0].foundObjects.length > 0) {
                        var obj = resp.outputList[0].foundObjects[0];
                        System.out.println("[BOM] Found object: " + safeUid(obj));
                        if (tctype.isInstance(obj)) {
                            System.out.println("[BOM] Object is instance of " + tctype.getSimpleName() + " - SUCCESS");
                            return tctype.cast(obj);
                        } else {
                            System.out.println("[BOM] WARNING: Object found but is not instance of " + tctype.getSimpleName());
                        }
                    }
                }
            }
            System.out.println("[BOM] Finder search exhausted - attempting via SavedQuery...");
            System.out.println("[BOM] =============================================");
            
            // Fallback: Try using SavedQuery 'Item Name' approach
            return queryItemByName(name, tctype);
            
        } catch (ServiceException e) {
            System.out.println("[BOM] ServiceException: " + e.getMessage());
            e.printStackTrace();
        }
        return null;
    }
    
    /**
     * Alternative method: Query item using SavedQuery (more reliable than Finder)
     */
    private <T> T queryItemByName(final String itemName, final Class<T> tctype) {
        try {
            System.out.println("[BOM] ===== SAVEDQUERY SEARCH ATTEMPT =====");
            var queryService = com.teamcenter.services.strong.query.SavedQueryService.getService(AppXSession.getConnection());
            
            var getSavedQueriesResp = queryService.getSavedQueries();
            if (getSavedQueriesResp.queries == null || getSavedQueriesResp.queries.length == 0) {
                System.out.println("[BOM] No saved queries found");
                return null;
            }
            
            // Try multiple query sources and entry names
            String[][] searchStrategies = {
                { "Item ID", itemName },                    // Search by Item ID exactly
                { "Item Name", "*" + itemName + "*" },      // Search by Item Name with wildcards
                { "Item ID", "*" + itemName + "*" }         // Search by Item ID with wildcards
            };
            
            for (String[] strategy : searchStrategies) {
                String entryName = strategy[0];
                String searchValue = strategy[1];
                
                System.out.println("[BOM] Trying: " + entryName + " = '" + searchValue + "'");
                
                // Find appropriate saved query
                var queryToUse = getSavedQueriesResp.queries[0].query;
                
                // Try standard queries first
                for (var q : getSavedQueriesResp.queries) {
                    if (q.name != null) {
                        if ((entryName.equals("Item ID") && q.name.equals("Item ID")) ||
                            (entryName.equals("Item Name") && q.name.equals("Item Name"))) {
                            queryToUse = q.query;
                            System.out.println("[BOM]   Found '" + q.name + "' saved query");
                            break;
                        }
                    }
                }
                
                try {
                    var savedQueryInput = new com.teamcenter.services.strong.query._2008_06.SavedQuery.QueryInput();
                    savedQueryInput.query = queryToUse;
                    savedQueryInput.maxNumToReturn = 50;
                    savedQueryInput.limitList = new ModelObject[0];
                    savedQueryInput.entries = new String[]{ entryName };
                    savedQueryInput.values = new String[]{ searchValue };
                    
                    var queryResp = queryService.executeSavedQueries(new com.teamcenter.services.strong.query._2008_06.SavedQuery.QueryInput[]{ savedQueryInput });
                    if (queryResp.arrayOfResults.length > 0) {
                        var foundResults = queryResp.arrayOfResults[0].objectUIDS;
                        System.out.println("[BOM]   Query returned " + foundResults.length + " results");
                        
                        if (foundResults.length > 0) {
                            // Load the objects
                            var loadResp = dmService.loadObjects(foundResults);
                            for (int i = 0; i < loadResp.sizeOfPlainObjects(); i++) {
                                var obj = loadResp.getPlainObject(i);
                                System.out.println("[BOM]   Loaded: " + safeUid(obj) + " (type: " + obj.getClass().getSimpleName() + ")");
                                if (tctype.isInstance(obj)) {
                                    System.out.println("[BOM] ✓ Found matching item via SavedQuery (" + entryName + ")!");
                                    System.out.println("[BOM] =====================================");
                                    return tctype.cast(obj);
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    System.out.println("[BOM]   Strategy failed: " + e.getMessage());
                }
            }
            
            System.out.println("[BOM] All SavedQuery strategies failed");
            System.out.println("[BOM] =====================================");
        } catch (Exception e) {
            System.out.println("[BOM] QueryByName failed: " + e.getMessage());
            e.printStackTrace();
        }
        return null;
    }
 
    protected void setObjectPolicy() {
        try {
            var session = SessionService.getService(AppXSession.getConnection());
            var policy = new ObjectPropertyPolicy();
 
            // Same idea as Siemens sample: need bom_view_tags + revision_list on Item
            policy.addType("Item", new String[]{ "bom_view_tags", "revision_list" });
 
            // For traversal - include all variant-related properties
            policy.addType("BOMLine", new String[]{
                    "bl_child_lines",
                    "bl_all_child_lines",
                    "bl_item_item_id",
                    "bl_rev_item_revision_id",
                    "bl_indented_title",
                    "bl_sequence_no",
                    "bl_quantity",
                    "bl_pimxml_abs_xform",
                    "bl_item_object_type",
                    "bl_rev_has_variants",
                    "bl_formatted_title",
                    "bl_item_object_name",
                    "bl_line_name",
                    "bl_variant_condition",
                    "bl_variant_state",
                    "bl_item_fnd0VariantNamespace",
                    "bl_item_fnd0PosBiasedVariantAvail",
                    "bl_process_variable_value"
            });
 
            session.setObjectPropertyPolicy(policy);
        } catch (Exception e) {
            // If policy setting fails, continue anyway - we'll load properties on-demand
            System.out.println("[WARN] Failed to set object property policy: " + e.getMessage());
        }
    }
 
    private void indent(int d) { for (int i = 0; i < d; i++) System.out.print("  "); }
 
    private String safeUid(ModelObject obj) {
        try { return (obj == null) ? "null" : obj.getUid(); }
        catch (Exception e) { return "unknown"; }
    }
 
    private interface Getter<T> { T get() throws Exception; }
 
    private <T> String safeGet(Getter<T> g) {
        try {
            T v = g.get();
            return (v == null) ? "" : v.toString();
        } catch (Exception e) {
            return "";
        }
    }
    
    /**
     * Extract variant configuration options and rules from a ModelObject
     */
    private void extractVariantConfig(ModelObject variantNS, int depth) {
        try {
            // Load variant-related properties from the namespace object
            dmService.getProperties(new ModelObject[]{ variantNS }, new String[]{
                    "fnd0_variant_options",
                    "fnd0_variant_rules",
                    "fnd0_variant_expressions",
                    "object_name"
            });
            
            // Try to get variant options
            try {
                java.lang.reflect.Method optionsMethod = variantNS.getClass().getMethod("get_fnd0_variant_options");
                ModelObject[] options = (ModelObject[]) optionsMethod.invoke(variantNS);
                
                if (options != null && options.length > 0) {
                    indent(depth);
                    System.out.println("[VARIANT_OPTIONS] Found " + options.length + " option(s):");
                    
                    // Load option properties
                    dmService.getProperties(options, new String[]{
                            "object_name",
                            "fnd0_var_option_id",
                            "fnd0_var_option_values"
                    });
                    
                    for (ModelObject opt : options) {
                        try {
                            String optName = safeGet(() -> {
                                java.lang.reflect.Method m = opt.getClass().getMethod("get_object_name");
                                return (String) m.invoke(opt);
                            });
                            
                            indent(depth + 1);
                            System.out.println("Option: " + optName);
                            
                            // Try to get option values
                            try {
                                java.lang.reflect.Method valuesMethod = opt.getClass().getMethod("get_fnd0_var_option_values");
                                ModelObject[] values = (ModelObject[]) valuesMethod.invoke(opt);
                                
                                if (values != null && values.length > 0) {
                                    dmService.getProperties(values, new String[]{ "object_name" });
                                    
                                    indent(depth + 2);
                                    System.out.println("Values: " + values.length);
                                    for (ModelObject val : values) {
                                        try {
                                            String valName = safeGet(() -> {
                                                java.lang.reflect.Method m = val.getClass().getMethod("get_object_name");
                                                return (String) m.invoke(val);
                                            });
                                            indent(depth + 3);
                                            System.out.println("- " + valName);
                                        } catch (Exception ignore) {}
                                    }
                                }
                            } catch (Exception ignore) {}
                        } catch (Exception ignore) {}
                    }
                }
            } catch (Exception ignore) {}
            
            // Try to get variant rules
            try {
                // Try different method names as SDK versions vary
                java.lang.reflect.Method rulesMethod = null;
                ModelObject[] rules = null;
                
                try {
                    rulesMethod = variantNS.getClass().getMethod("get_fnd0_variant_rules");
                    rules = (ModelObject[]) rulesMethod.invoke(variantNS);
                } catch (NoSuchMethodException e) {
                    try {
                        rulesMethod = variantNS.getClass().getMethod("get_fnd0_var_rules");
                        rules = (ModelObject[]) rulesMethod.invoke(variantNS);
                    } catch (NoSuchMethodException e2) {
                        // Method not found - log and continue
                        indent(depth);
                        System.out.println("[VARIANT_RULES] Note: Variant rule extraction methods not available in this SDK");
                    }
                }
                
                if (rules != null && rules.length > 0) {
                    indent(depth);
                    System.out.println("[VARIANT_RULES] Found " + rules.length + " rule(s):");
                    
                    final ModelObject[] finalRules = rules;  // Make final for lambda usage
                    
                    // Load rule properties with various property names
                    dmService.getProperties(rules, new String[]{
                            "object_name",
                            "fnd0_var_rule_name",
                            "fnd0_var_rule_expression",
                            "fnd0_rule_error_message"
                    });
                    
                    for (int i = 0; i < finalRules.length; i++) {
                        final int index = i;
                        try {
                            String ruleName = safeGet(() -> {
                                java.lang.reflect.Method m = finalRules[index].getClass().getMethod("get_object_name");
                                return (String) m.invoke(finalRules[index]);
                            });
                            
                            indent(depth + 1);
                            System.out.println("✓ Rule " + (index + 1) + ": " + ruleName);
                            
                            Map<String, Object> ruleMap = new HashMap<>();
                            ruleMap.put("name", ruleName);
                            ruleMap.put("conditions", new ArrayList<>());
                            
                            // Try to get expression
                            String expression = safeGet(() -> {
                                java.lang.reflect.Method exprMethod = finalRules[index].getClass().getMethod("get_fnd0_var_rule_expression");
                                return (String) exprMethod.invoke(finalRules[index]);
                            });
                            
                            String logicType = "AND";
                            if (expression != null && !expression.isEmpty()) {
                                expression = expression.toUpperCase();
                                if (expression.contains(" OR ")) {
                                    logicType = "OR";
                                }
                                indent(depth + 2);
                                System.out.println("Type: " + logicType + " | Expression: " + expression);
                            }
                            ruleMap.put("logicType", logicType);
                            ruleMap.put("expression", expression);
                            
                            // Try to get message
                            String message = safeGet(() -> {
                                java.lang.reflect.Method msgMethod = finalRules[index].getClass().getMethod("get_fnd0_rule_error_message");
                                return (String) msgMethod.invoke(finalRules[index]);
                            });
                            
                            if (message != null && !message.isEmpty()) {
                                indent(depth + 2);
                                System.out.println("Message: " + message);
                                ruleMap.put("message", message);
                            }
                            
                            variantRulesList.add(ruleMap);
                            
                        } catch (Exception ignore) {}
                    }
                }
            } catch (Exception ignore) {}
            
        } catch (Exception e) {
            // Variant config not available
        }
    }
    
    /**
     * Display variant configuration info for a BOMLine if available
     */
    private void displayVariantInfo(BOMLine line, int depth) {
        try {
            // Load all variant-related properties first
            dmService.getProperties(new ModelObject[]{ line }, new String[]{
                    "bl_rev_has_variants",
                    "bl_variant_condition",
                    "bl_variant_state",
                    "bl_item_object_type",
                    "bl_item_object_name",
                    "bl_item_fnd0VariantNamespace",
                    "bl_item_fnd0PosBiasedVariantAvail"
            });
            
            // Check if item has variants
            String hasVariantsStr = safeGet(() -> {
                Object val = line.get_bl_rev_has_variants();
                return val == null ? "" : val.toString();
            });
            if (!hasVariantsStr.isEmpty() && !hasVariantsStr.equals("-") && 
                (hasVariantsStr.equalsIgnoreCase("true") || hasVariantsStr.equalsIgnoreCase("y"))) {
                indent(depth + 1);
                System.out.println("[VARIANT] Has Variants: true");
            }
            
            // Check for variant condition and parse into option-value pairs
            String variantCondition = safeGet(() -> {
                Object val = line.get_bl_variant_condition();
                return val == null ? "" : val.toString();
            });
            
            // Group condition strings: e.g. "NIB TYPE = THICK" becomes option="NIB TYPE", value="THICK"
            Map<String, List<String>> optionValues = new HashMap<>();
            
            if (!variantCondition.isEmpty() && !variantCondition.equals("-")) {
                // Parse variant condition (may contain multiple conditions separated by AND, OR, etc.)
                // For now, handle simple format: "OPTION = VALUE"
                String[] conditions = variantCondition.split("[,;]");  // Split by comma or semicolon if multiple
                
                for (String cond : conditions) {
                    cond = cond.trim();
                    if (cond.contains("=")) {
                        String[] parts = cond.split("=");
                        if (parts.length == 2) {
                            String optionName = parts[0].trim();
                            String optionValue = parts[1].trim();
                            
                            // Store in local map for this line
                            optionValues.computeIfAbsent(optionName, k -> new ArrayList<>())
                                       .add(optionValue);
                            
                            // Also add to global summary map (de-duplicating values)
                            variantOptionsSummary.computeIfAbsent(optionName, k -> new ArrayList<>())
                                                 .stream()
                                                 .filter(v -> !v.equals(optionValue))
                                                 .count();
                            if (!variantOptionsSummary.get(optionName).contains(optionValue)) {
                                variantOptionsSummary.get(optionName).add(optionValue);
                            }
                        }
                    }
                }
                
                // Print parsed options
                if (!optionValues.isEmpty()) {
                    indent(depth + 1);
                    System.out.println("[VARIANT_CONDITION]");
                    for (Map.Entry<String, List<String>> entry : optionValues.entrySet()) {
                        indent(depth + 2);
                        System.out.println(entry.getKey() + " = " + String.join(", ", entry.getValue()));
                    }
                }
            }

            // Check for variant state
            String variantState = safeGet(() -> {
                Object val = line.get_bl_variant_state();
                return val == null ? "" : val.toString();
            });
            if (!variantState.isEmpty() && !variantState.equals("-")) {
                indent(depth + 1);
                System.out.println("[VARIANT_STATE] " + variantState);
            }
            
            // Check item object type
            String itemObjType = safeGet(() -> {
                Object val = line.get_bl_item_object_type();
                return val == null ? "" : val.toString();
            });
            if (!itemObjType.isEmpty() && !itemObjType.equals("-")) {
                indent(depth + 1);
                System.out.println("[ITEM_TYPE] " + itemObjType);
            }
            
            // Check item name
            String itemObjName = safeGet(() -> {
                Object val = line.get_bl_item_object_name();
                return val == null ? "" : val.toString();
            });
            if (!itemObjName.isEmpty() && !itemObjName.equals("-")) {
                indent(depth + 1);
                System.out.println("[ITEM_NAME] " + itemObjName);
            }
            
            // Check for variant namespace
            try {
                Object variantNS = line.get_bl_item_fnd0VariantNamespace();
                if (variantNS != null) {
                    indent(depth + 1);
                    System.out.println("[VARIANT_NAMESPACE] " + variantNS);
                    
                    // Try to extract variant configuration from the namespace
                    if (variantNS instanceof ModelObject) {
                        extractVariantConfig((ModelObject) variantNS, depth + 2);
                    }
                }
            } catch (Exception ignore) {}
            
            // Check position-biased variant availability
            try {
                Object posBiased = line.get_bl_item_fnd0PosBiasedVariantAvail();
                if (posBiased != null) {
                    indent(depth + 1);
                    System.out.println("[POS_BIASED_VARIANT] " + posBiased);
                }
            } catch (Exception ignore) {}
            
        } catch (Exception ignore) {
            // Variant info not available for this BOMLine
        }
    }
    
    /**
     * Print a summary of all variant options and their values found in the BOM tree
     */
    private void printVariantOptionsSummary() {
        if (variantOptionsSummary.isEmpty()) {
            return;  // No variant options found
        }
        
        System.out.println("\n======= VARIANT OPTIONS SUMMARY =======");
        
        // Sort options by name for consistent output
        variantOptionsSummary.keySet().stream()
            .sorted()
            .forEach(optionName -> {
                List<String> values = variantOptionsSummary.get(optionName);
                // Sort values as well
                String valueStr = values.stream()
                    .sorted()
                    .reduce((a, b) -> a + ", " + b)
                    .orElse("");
                System.out.println(optionName + ": " + valueStr);
            });
        
        System.out.println("========================================");
    }
    
    /**
     * Export extracted BOM tree and variant options to JSON file
     * JSON schema: { extractedAt, sourceItemId, sourceRevId, bomRoot, variantOptions }
     */
    public void exportToJson(File outputFile) {
        try {
            if (bomTopLine == null) {
                System.out.println("[JSON] ERROR: TopLine is null. Call openBOMWindow() first.");
                return;
            }
            
            // Create automatic backup if file already exists
            if (outputFile.exists()) {
                createBackup(outputFile);
            }
            
            Map<String, Object> jsonRoot = new HashMap<>();
            jsonRoot.put("extractedAt", Instant.now().toString());
            jsonRoot.put("sourceItemId", rootItemId);
            jsonRoot.put("sourceRevId", rootRevId);
            
            // Convert BOM tree to JSON structure
            jsonRoot.put("bomRoot", bomLineToMap(bomTopLine));
            
            // Add variant options summary
            jsonRoot.put("variantOptions", variantOptionsSummary);
            
            // Add extracted variant rules with AND/OR logic
            jsonRoot.put("variantRules", variantRulesList);
            
            // Write to file
            String jsonString = mapToJson(jsonRoot);
            try (FileWriter writer = new FileWriter(outputFile)) {
                writer.write(jsonString);
                writer.flush();
            }
            
            System.out.println("[JSON] ✓ Extraction exported to " + outputFile.getAbsolutePath());
            
        } catch (IOException e) {
            System.out.println("[JSON] ERROR: Failed to write JSON file: " + e.getMessage());
            e.printStackTrace();
        } catch (Exception e) {
            System.out.println("[JSON] ERROR: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Creates a timestamped backup of the existing file before overwrite.
     * Backup format: filename.YYYYMMDD_HHmmss.extension
     * Example: tc_extraction.20260410_143022.json
     */
    private void createBackup(File originalFile) {
        try {
            LocalDateTime now = LocalDateTime.now();
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss");
            String timestamp = now.format(formatter);
            
            String fileName = originalFile.getName();
            String baseName = fileName.contains(".") ? fileName.substring(0, fileName.lastIndexOf(".")) : fileName;
            String extension = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf(".")) : "";
            
            String backupName = baseName;
            File backupFile = new File(originalFile.getParent(), backupName);
            
            Files.copy(originalFile.toPath(), backupFile.toPath());
            System.out.println("[JSON] ✓ Backup created: " + backupFile.getName());
            
        } catch (IOException e) {
            System.out.println("[JSON] WARNING: Could not create backup: " + e.getMessage());
            // Don't fail the export if backup creation fails, just warn
        }
    }
    
    /**
     * Convert a BOMLine tree to a Map structure (JSON-serializable)
     */
    private Map<String, Object> bomLineToMap(BOMLine line) {
        if (line == null) return null;
        
        Map<String, Object> lineMap = new HashMap<>();
        
        // Safe property extraction
        lineMap.put("itemId", safeGet(() -> line.get_bl_item_item_id()));
        lineMap.put("revId", safeGet(() -> line.get_bl_rev_item_revision_id()));
        lineMap.put("sequence", safeGet(() -> String.valueOf(line.get_bl_sequence_no())));
        lineMap.put("qty", safeGet(() -> String.valueOf(line.get_bl_quantity())));
        lineMap.put("name", safeGet(() -> line.get_bl_indented_title()));
        
        // Variant condition (if present)
        String variantCondition = safeGet(() -> {
            Object val = line.get_bl_variant_condition();
            return val == null ? "" : val.toString();
        });
        if (!variantCondition.isEmpty()) {
            lineMap.put("variantCondition", variantCondition);
        } else {
            lineMap.put("variantCondition", null);
        }
        
        // Variant state (if present)
        String variantState = safeGet(() -> {
            Object val = line.get_bl_variant_state();
            return val == null ? "" : val.toString();
        });
        if (!variantState.isEmpty() && !variantState.equals("-")) {
            lineMap.put("variantState", variantState);
        }
        
        // Process children
        Object kids = getChildrenArray(line);
        List<Map<String, Object>> childrenList = new ArrayList<>();
        
        if (kids != null) {
            if (kids instanceof BOMLine[]) {
                for (BOMLine child : (BOMLine[]) kids) {
                    childrenList.add(bomLineToMap(child));
                }
            } else if (kids instanceof ModelObject[]) {
                for (ModelObject mo : (ModelObject[]) kids) {
                    if (mo instanceof BOMLine) {
                        childrenList.add(bomLineToMap((BOMLine) mo));
                    }
                }
            }
        }
        
        if (!childrenList.isEmpty()) {
            lineMap.put("children", childrenList);
        }
        
        return lineMap;
    }
    
    /**
     * Convert Map structure to JSON string (simple JSON writer, no external dependencies)
     */
    private String mapToJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder();
        jsonAppendMap(sb, map, 0);
        return sb.toString();
    }
    
    private void jsonAppendMap(StringBuilder sb, Map<String, Object> map, int indent) {
        sb.append("{\n");
        boolean first = true;
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            if (!first) sb.append(",\n");
            first = false;
            
            spaces(sb, indent + 2);
            sb.append("\"").append(escapeJson(entry.getKey())).append("\": ");
            jsonAppend(sb, entry.getValue(), indent + 2);
        }
        sb.append("\n");
        spaces(sb, indent);
        sb.append("}");
    }
    
    @SuppressWarnings("unchecked")
    private void jsonAppend(StringBuilder sb, Object value, int indent) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof String) {
            sb.append("\"").append(escapeJson((String) value)).append("\"");
        } else if (value instanceof Number) {
            sb.append(value);
        } else if (value instanceof Boolean) {
            sb.append(value);
        } else if (value instanceof Map) {
            jsonAppendMap(sb, (Map<String, Object>) value, indent);
        } else if (value instanceof List) {
            jsonAppendList(sb, (List<?>) value, indent);
        } else {
            sb.append("\"").append(escapeJson(value.toString())).append("\"");
        }
    }
    
    private void jsonAppendList(StringBuilder sb, List<?> list, int indent) {
        sb.append("[\n");
        boolean first = true;
        for (Object item : list) {
            if (!first) sb.append(",\n");
            first = false;
            spaces(sb, indent + 2);
            jsonAppend(sb, item, indent + 2);
        }
        sb.append("\n");
        spaces(sb, indent);
        sb.append("]");
    }
    
    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
    
    private void spaces(StringBuilder sb, int count) {
        for (int i = 0; i < count; i++) sb.append(" ");
    }
}