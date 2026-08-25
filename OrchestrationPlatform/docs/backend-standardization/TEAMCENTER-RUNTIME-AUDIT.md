# Teamcenter Runtime and Source Audit

Status: static source audit complete; installed-runtime collection pending execution in the target environment; connected validation blocked pending approved replacement credentials.

## Exact execution sequence

1. `PipelineController` accepts the Teamcenter Item ID.
2. `PipelineOrchestrator` creates progress and audit state.
3. `SubprocessExecutor.ExecuteTeamcenterAsync` invokes `cmd.exe /c call run-pipeline.bat <itemId>`.
4. The batch sets `TC_ITEM_ID`, builds the Java client, and starts `com.teamcenter.hello.Hello`.
5. `Hello.main` loads TCCS configuration, creates `AppXSession`, selects environment or direct host behavior, and authenticates.
6. `AppXSession` creates the SOA `Connection` and installs exception, partial-error, model-event, and request listeners.
7. `PLMXMLExport.initializeObjectPolicy` installs the object property policy after login.
8. `PLMXMLExport.loadRootItem` resolves an `Item` through Finder with a SavedQuery fallback.
9. `openBOMWindow` loads `revision_list` and `bom_view_tags`, selects an `ItemRevision`, iterates `PSBOMView` objects, and calls `createOrReConfigureBOMWindows`.
10. The extractor recursively calls `expandPSOneLevel`, loads BOMLine properties, and builds the normalized tree.
11. `exportToJson` writes `tc_extraction.json`.
12. `closeBOM` closes the BOM window.
13. `exportToPLMXML` attempts reflective `ApplicationInterfaceService.generateStructure` with rule `Latest Working`, export rule `ConfiguredDataExportDefault`, and FMS transient-file retrieval.
14. `AppXSession.logout` closes the Teamcenter session.
15. The batch copies Teamcenter JSON to ConfigitAceIntegration and performs optional transformation/publication work.
16. The canonical adapter validates ownership and freshness, then captures artifacts into request-scoped storage.

## Native object and structure semantics observed

- `Item` is resolved separately from `ItemRevision`.
- Revision selection uses an explicitly requested revision when present; otherwise the last revision in `revision_list` is selected. This is implementation behavior, not proof of a configured revision rule.
- `PSBOMView`, `BOMWindow`, and root `BOMLine` remain distinct objects.
- Traversal uses BOMLine identity and an `IdentityHashMap`, so repeated canonical Items can remain separate BOMLine occurrences in memory.
- Extracted BOMLine properties include item ID, revision ID, sequence, quantity, variant condition, variant state, transform, object type, names, variant namespace, process-variable value, variant options, and variant rules.
- Canonical JSON currently owns Item ID, revision, sequence, quantity, variant state, variant condition, and children. A stable source-native occurrence UID is not proven in the normalized output and remains missing evidence.

## Configuration behavior

- BOM window creation does not explicitly provide a revision rule in `CreateWindowsInfo3`.
- PLMXML generation independently references `Latest Working` and `ConfiguredDataExportDefault` through reflective API usage.
- PLMXML generation is therefore not proof that the BOM window used the same rule.
- Precise versus imprecise behavior is not explicitly selected by the Java source and must be collected from runtime or exported evidence.
- Variant properties are loaded from BOMLine, but configured occurrence semantics must still be validated against a known configured structure.

## Saved-query assessment

The source contains `SavedQueryService`, `getSavedQueries`, Item ID and Item Name strategy strings, wildcard values, and a debug `listAllItems` method. This proves code presence only. It does not prove that the target environment exposes the same saved-query names, entries, permissions, result types, limits, pagination, or candidate continuity. Product-name discovery remains `capability-limited`.

## Resource lifecycle

- `BOMWindow` is closed through `closeBOM` after extraction.
- Session logout occurs at the end of `Hello.main`.
- The current entry point does not wrap all extraction operations in a top-level `try/finally`; unexpected exceptions can bypass orderly cleanup. This is documented but not changed in Slice 2.
- FMS is used only by the reflective PLMXML transient-file path found in source.

## Preserved components

Slice 2 does not modify Java, SOA JARs, Ant configuration, run-pipeline.bat, authentication, revision rules, BOM-window behavior, FMS configuration, or Java target.
