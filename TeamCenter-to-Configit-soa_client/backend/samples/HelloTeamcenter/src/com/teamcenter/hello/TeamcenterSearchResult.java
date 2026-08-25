package com.teamcenter.hello;

import com.teamcenter.soa.client.model.strong.Item;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** Machine-readable Teamcenter discovery result plus live Item handles for extraction. */
public final class TeamcenterSearchResult {
    public String schemaVersion = "1.0";
    public String source = "teamcenter";
    public String operation = "search";
    public String query;
    public String queryType;
    public String status = "empty";
    public boolean truncated;
    public String executedAt = Instant.now().toString();
    public final List<Candidate> candidates = new ArrayList<>();
    public final List<String> warnings = new ArrayList<>();
    public final List<String> errors = new ArrayList<>();

    public static final class Candidate {
        public String itemId;
        public String objectName;
        public String objectType;
        public String uid;
        public String revisionId;
        public String revisionUid;
        public String lifecycleState;
        public String matchType;
        public String matchedBy;
        public boolean verified;
        transient Item liveItem;
    }
}
