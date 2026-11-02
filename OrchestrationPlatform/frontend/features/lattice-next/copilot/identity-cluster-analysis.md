# Sprint 1A.3 Identity Cluster Analysis

## Live investigation

Investigation: `lattice-21d72fde-eb14-4d9b-8d9f-b4f2f91ed78a`  
Snapshot revision: `1`  
Entity count: `239`  
Identity cluster count: `5`

## Cluster contents

| Cluster ID | Entity count | Applications | Entities | Canonical IDs | Native IDs |
|---|---:|---|---|---|---|
| `identity:codebeamer:primary-codebeamer:item:1190` | 1 | Codebeamer | SR-001 Steering Material (`requirement`) | `codebeamer:primary-codebeamer:item:1190` | `1190` |
| `identity:codebeamer:primary-codebeamer:item:1191` | 1 | Codebeamer | SR-002 Steering Dimensions (`requirement`) | `codebeamer:primary-codebeamer:item:1191` | `1191` |
| `identity:codebeamer:primary-codebeamer:item:1194` | 1 | Codebeamer | SR-003 Steering Weight (`requirement`) | `codebeamer:primary-codebeamer:item:1194` | `1194` |
| `identity:codebeamer:primary-codebeamer:item:1192` | 1 | Codebeamer | SR-004 Steering Type (`requirement`) | `codebeamer:primary-codebeamer:item:1192` | `1192` |
| `cluster:orwtpartwtpart1717121` | 2 | Windchill | Steering (`source-representation`); Steering (`part-occurrence`) | `subject:steering`; `windchill:0:0000003874/0000003874#0` | `OR:wt.part.WTPart:1717121`; `0000003874/0000003874#0` |

## Cross-application result

- Cross-application clusters: **0**
- Single-application clusters: **5**
- Multi-entity clusters: **1**, but it is Windchill-only.
- Applications represented in the investigation: Codebeamer 67, Configit 41,
  SAP 114, Windchill 17.

The identity resolver formed a small number of clusters, but none joins
Windchill, SAP, Configit, or Codebeamer to another application. The SAP and
Configit entities do not appear in any identity cluster.

## Finding

Identity resolution is not generating cross-source subjects for this live
investigation. This is direct evidence against a cross-application identity
cluster being available for ontology materialization. It does not show that
identity resolution deleted the 239 entities; it shows that the five persisted
clusters contain no cross-application membership.
