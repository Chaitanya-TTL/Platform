# Lattice Source-Aware Results

**Status:** Approved by the user  
**Scope:** Federated search results within the Lattice Discovery screen

## Intent

Users must be able to tell immediately whether an engineering record came from Windchill, SAP, Configit, or Codebeamer. Merely printing the source name as secondary text in one mixed result list is not enough, and the current combination of a separate source-status list plus flattened results makes the screen harder to scan.

## Selected interaction

Replace the separate source-status list and mixed result list with a source switcher. Show one source's results at a time. Each included source tab identifies the application and shows its result count or current status. Open the first source that returns results; once the user selects a source tab, do not switch it automatically. If every source returns no results or fails, open the first requested source so its empty or error state is visible.

Selections remain keyed to result IDs and persist when switching tabs. Show one selected count and preserve the existing investigation action. Keep Codebeamer bulk selection within the Codebeamer tab.

## Record preview

Use the source-native record type and identifier/revision as the record's primary identity, followed by the most useful source-specific context available in the existing result model. Show only fields present in the record; do not invent values or render empty placeholders. Keep remaining metadata and match explanation available through an explicit disclosure.

Use the existing normalized result fields (`entityType`, `nativeId`, `revision`, `version`, `displayName`, `description`, `matchReason`, and `sourceMetadata`) and the existing per-source contracts. Do not change connector APIs, result ranking, match semantics, or investigation payloads.

Examples of useful context, when supplied:

- Windchill: part number, revision, lifecycle, plant, or organization.
- SAP: material identifier, plant/organization, catalog revision/status, or staleness.
- Configit: work item or package type, model code, package path, version, or package state.
- Codebeamer: requirement/external key, tracker, project, or classification.

## Goals and boundaries

- Make record provenance unmistakable while reducing simultaneous result/status content.
- Preserve per-source progress, success, empty, partial, unavailable, failure, cancellation, timeout, retry, and technical-detail behavior.
- Preserve independent result selection across sources and the existing governed investigation flow.
- Keep the search composer, recent-investigation shelf, history, global shell, theme, and all APIs unchanged.
- Keep the existing Next.js, React, Tailwind, Motion, and Tabler stack; add no dependencies.
- Support keyboard operation, clear focus, screen-reader tab state, responsive layouts, and reduced motion.

## Alternatives considered

- **Grouped source sections:** all systems remain visible, retaining cross-source comparison but preserving a long, information-dense page.
- **Mixed results with stronger labels:** avoids source switching but still requires users to decode each row's provenance.
- **Source switcher (selected):** shows one system's records at a time, making provenance and source-native context the organizing principle. Switching is an intentional trade-off; selected records remain selected across tabs.

## Acceptance criteria

- Only the active source's records are visible; tabs show each requested source and its result count or search state.
- The first source with results is selected automatically until the user chooses a tab; user choice is not overridden by later connector responses.
- Each record presents its native object type and identifier/revision, with curated source-specific context when available and no invented or empty values.
- Match explanation and remaining technical metadata remain available on demand.
- Selection and Codebeamer bulk-selection behavior continue to work across tab changes.
- Connector errors do not hide successful records from other sources; empty/all-failed states remain actionable.
- Existing search, cancellation, retry, and investigation creation behavior is unchanged.
