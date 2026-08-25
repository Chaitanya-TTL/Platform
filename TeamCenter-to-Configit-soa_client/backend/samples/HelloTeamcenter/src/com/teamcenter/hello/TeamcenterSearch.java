package com.teamcenter.hello;

import com.teamcenter.clientx.AppXSession;
import com.teamcenter.services.strong.core.DataManagementService;
import com.teamcenter.services.strong.query.FinderService;
import com.teamcenter.services.strong.query.SavedQueryService;
import com.teamcenter.services.strong.query._2007_06.Finder.WSOFindCriteria;
import com.teamcenter.services.strong.query._2007_06.Finder.WSOFindSet;
import com.teamcenter.services.strong.query._2008_06.SavedQuery.QueryInput;
import com.teamcenter.soa.client.model.ModelObject;
import com.teamcenter.soa.client.model.strong.Item;
import com.teamcenter.soa.client.model.strong.ItemRevision;
import com.teamcenter.soa.exceptions.NotLoadedException;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Executes bounded, live Teamcenter Item discovery without opening a BOM window. */
public final class TeamcenterSearch {
    private final SavedQueryService queryService;
    private final FinderService finderService;
    private final DataManagementService dmService;

    public TeamcenterSearch() {
        queryService = SavedQueryService.getService(AppXSession.getConnection());
        finderService = FinderService.getService(AppXSession.getConnection());
        dmService = DataManagementService.getService(AppXSession.getConnection());
    }

    public TeamcenterSearchResult search(String rawQuery, String rawType, int requestedLimit) {
        String query = rawQuery == null ? "" : rawQuery.trim();
        String type = normalizeType(rawType);
        int limit = Math.max(1, Math.min(requestedLimit, 50));
        TeamcenterSearchResult result = new TeamcenterSearchResult();
        result.query = query;
        result.queryType = type;
        if (query.isEmpty()) {
            result.status = "failed";
            result.errors.add("teamcenter-query-required");
            return result;
        }

        Map<String, TeamcenterSearchResult.Candidate> unique = new LinkedHashMap<>();
        List<Strategy> strategies = strategies(query, type);
        boolean queryCapabilityObserved = false;
        for (Strategy strategy : strategies) {
            try {
                List<Item> items = executeSavedQuery(strategy, limit);
                queryCapabilityObserved = true;
                addCandidates(unique, items, query, strategy.provider, limit);
            } catch (Exception ex) {
                result.warnings.add("teamcenter-saved-query-strategy-failed:" + safeMessage(ex));
            }
            if (unique.size() >= limit) break;
        }

        if (unique.isEmpty()) {
            try {
                addCandidates(unique, executeFinder(query, limit), query, "finder-service", limit);
                queryCapabilityObserved = true;
            } catch (Exception ex) {
                result.warnings.add("teamcenter-finder-fallback-failed:" + safeMessage(ex));
            }
        }

        result.candidates.addAll(unique.values());
        result.candidates.sort(Comparator.comparingInt(c -> rank(c.matchType)));
        if (result.candidates.size() > limit) {
            result.candidates.subList(limit, result.candidates.size()).clear();
            result.truncated = true;
        }
        result.status = !result.candidates.isEmpty() ? "success" : queryCapabilityObserved ? "empty" : "failed";
        if ("failed".equals(result.status)) result.errors.add("teamcenter-query-unavailable");
        return result;
    }

    public TeamcenterSearchResult.Candidate selectForExtraction(TeamcenterSearchResult result) {
        if (result == null || result.candidates.isEmpty()) return null;
        List<TeamcenterSearchResult.Candidate> exact = new ArrayList<>();
        for (var candidate : result.candidates) {
            if (candidate.matchType.startsWith("exact")) exact.add(candidate);
        }
        if (exact.size() == 1) return exact.get(0);
        if (exact.size() > 1) return null;
        return result.candidates.size() == 1 ? result.candidates.get(0) : null;
    }

    private List<Item> executeSavedQuery(Strategy strategy, int limit) throws Exception {
        var available = queryService.getSavedQueries();
        if (available.queries == null) return List.of();
        for (var q : available.queries) {
            if (q.name == null || !q.name.equalsIgnoreCase(strategy.savedQueryName)) continue;
            QueryInput input = new QueryInput();
            input.query = q.query;
            input.maxNumToReturn = limit;
            input.limitList = new ModelObject[0];
            input.entries = new String[]{ strategy.entryName };
            input.values = new String[]{ strategy.value };
            var response = queryService.executeSavedQueries(new QueryInput[]{ input });
            if (response.arrayOfResults == null || response.arrayOfResults.length == 0) return List.of();
            return loadItems(response.arrayOfResults[0].objectUIDS);
        }
        throw new IllegalStateException("saved-query-not-found:" + strategy.savedQueryName);
    }

    private List<Item> executeFinder(String query, int limit) throws Exception {
        List<Item> result = new ArrayList<>();
        for (String value : new String[]{ query, "*" + query + "*" }) {
            WSOFindCriteria criteria = new WSOFindCriteria();
            criteria.objectName = value;
            criteria.objectType = "Item";
            criteria.scope = "WSO_scope_All";
            WSOFindSet set = new WSOFindSet();
            set.criterias = new WSOFindCriteria[]{ criteria };
            var response = finderService.findWorkspaceObjects(new WSOFindSet[]{ set });
            if (response.outputList == null) continue;
            for (var output : response.outputList) {
                if (output.foundObjects == null) continue;
                for (ModelObject object : output.foundObjects) {
                    if (object instanceof Item) result.add((Item)object);
                    if (result.size() >= limit) return result;
                }
            }
        }
        return result;
    }

    private List<Item> loadItems(String[] uids) throws Exception {
        if (uids == null || uids.length == 0) return List.of();
        var loaded = dmService.loadObjects(uids);
        List<Item> result = new ArrayList<>();
        for (int i = 0; i < loaded.sizeOfPlainObjects(); i++) {
            ModelObject object = loaded.getPlainObject(i);
            if (object instanceof Item) result.add((Item)object);
        }
        return result;
    }

    private void addCandidates(Map<String, TeamcenterSearchResult.Candidate> unique, List<Item> items,
                               String query, String provider, int limit) throws Exception {
        if (items.isEmpty()) return;
        dmService.getProperties(items.toArray(new ModelObject[0]),
            new String[]{ "item_id", "object_name", "object_type", "revision_list" });
        for (Item item : items) {
            TeamcenterSearchResult.Candidate candidate = map(item, query, provider);
            TeamcenterSearchResult.Candidate previous = unique.get(candidate.uid);
            if (previous == null || rank(candidate.matchType) < rank(previous.matchType)) unique.put(candidate.uid, candidate);
            if (unique.size() >= limit) return;
        }
    }

    private TeamcenterSearchResult.Candidate map(Item item, String query, String provider) throws Exception {
        TeamcenterSearchResult.Candidate c = new TeamcenterSearchResult.Candidate();
        c.itemId = value(() -> item.get_item_id());
        c.objectName = value(() -> item.get_object_name());
        c.objectType = item.getClass().getSimpleName();
        c.uid = item.getUid();
        c.matchedBy = provider;
        c.matchType = classify(query, c.itemId, c.objectName);
        c.verified = true;
        c.liveItem = item;
        try {
            ModelObject[] revisions = item.get_revision_list();
            if (revisions != null && revisions.length > 0) {
                ModelObject latest = revisions[revisions.length - 1];
                dmService.getProperties(new ModelObject[]{ latest }, new String[]{ "item_revision_id", "release_status_list" });
                if (latest instanceof ItemRevision) {
                    c.revisionId = value(() -> ((ItemRevision)latest).get_item_revision_id());
                    c.revisionUid = latest.getUid();
                }
            }
        } catch (Exception ignored) { }
        return c;
    }

    private static List<Strategy> strategies(String query, String type) {
        List<Strategy> result = new ArrayList<>();
        if (!"name".equals(type)) result.add(new Strategy("Item ID", "Item ID", query, "saved-query-item-id-exact"));
        if (!"id".equals(type)) {
            result.add(new Strategy("Item Name", "Item Name", query, "saved-query-item-name-exact"));
            result.add(new Strategy("Item Name", "Item Name", "*" + query + "*", "saved-query-item-name-wildcard"));
        }
        return result;
    }

    private static String normalizeType(String type) {
        String value = type == null ? "auto" : type.trim().toLowerCase(Locale.ROOT);
        return value.equals("id") || value.equals("name") ? value : "auto";
    }

    private static String classify(String query, String id, String name) {
        if (id != null && id.equals(query)) return "exact-id";
        if (id != null && id.equalsIgnoreCase(query)) return "exact-id-normalized";
        if (name != null && name.equals(query)) return "exact-name";
        if (name != null && name.equalsIgnoreCase(query)) return "exact-name-normalized";
        if (name != null && name.toLowerCase(Locale.ROOT).startsWith(query.toLowerCase(Locale.ROOT))) return "name-prefix";
        return "partial-name";
    }

    private static int rank(String type) {
        if ("exact-id".equals(type)) return 0;
        if ("exact-id-normalized".equals(type)) return 1;
        if ("exact-name".equals(type)) return 2;
        if ("exact-name-normalized".equals(type)) return 3;
        if ("name-prefix".equals(type)) return 4;
        return 5;
    }

    public static void writeJson(TeamcenterSearchResult result, File output) throws IOException {
        File parent = output.getAbsoluteFile().getParentFile();
        if (parent != null) parent.mkdirs();
        Files.writeString(output.toPath(), toJson(result), StandardCharsets.UTF_8);
    }

    private static String toJson(TeamcenterSearchResult r) {
        StringBuilder b = new StringBuilder();
        b.append("{\n  \"schemaVersion\":\"").append(escape(r.schemaVersion)).append("\",");
        b.append("\n  \"source\":\"teamcenter\",\n  \"operation\":\"search\",");
        b.append("\n  \"query\":{\"originalInput\":\"").append(escape(r.query)).append("\",\"queryType\":\"").append(escape(r.queryType)).append("\"},");
        b.append("\n  \"status\":\"").append(escape(r.status)).append("\",\n  \"resultCount\":").append(r.candidates.size()).append(',');
        b.append("\n  \"truncated\":").append(r.truncated).append(",\n  \"candidates\":[");
        for (int i=0;i<r.candidates.size();i++) {
            var c=r.candidates.get(i); if(i>0)b.append(',');
            b.append("\n    {")
             .append(field("itemId",c.itemId)).append(',').append(field("objectName",c.objectName)).append(',')
             .append(field("objectType",c.objectType)).append(',').append(field("uid",c.uid)).append(',')
             .append(field("revisionId",c.revisionId)).append(',').append(field("revisionUid",c.revisionUid)).append(',')
             .append(field("lifecycleState",c.lifecycleState)).append(',').append(field("matchType",c.matchType)).append(',')
             .append(field("matchedBy",c.matchedBy)).append(",\"verified\":").append(c.verified).append('}');
        }
        b.append("\n  ],\n  \"warnings\":").append(strings(r.warnings)).append(',');
        b.append("\n  \"errors\":").append(strings(r.errors)).append(',');
        b.append("\n  \"executedAt\":\"").append(escape(r.executedAt)).append("\"\n}\n");
        return b.toString();
    }
    private static String field(String name,String value){return "\""+name+"\":"+(value==null?"null":"\""+escape(value)+"\"");}
    private static String strings(List<String> values){StringBuilder b=new StringBuilder("[");for(int i=0;i<values.size();i++){if(i>0)b.append(',');b.append('"').append(escape(values.get(i))).append('"');}return b.append(']').toString();}
    private static String escape(String value){if(value==null)return "";return value.replace("\\","\\\\").replace("\"","\\\"").replace("\r","\\r").replace("\n","\\n");}
    private static String safeMessage(Exception ex){String m=ex.getMessage();return m==null?ex.getClass().getSimpleName():m.replace('\n',' ').replace('\r',' ');}
    private interface Getter { String get() throws NotLoadedException; }
    private static String value(Getter getter){try{return getter.get();}catch(Exception e){return null;}}
    private static final class Strategy { final String savedQueryName,entryName,value,provider; Strategy(String q,String e,String v,String p){savedQueryName=q;entryName=e;value=v;provider=p;} }
}
