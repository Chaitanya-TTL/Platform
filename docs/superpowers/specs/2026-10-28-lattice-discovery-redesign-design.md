# Lattice Discovery Redesign

**Status:** Proposed; awaiting product approval  
**Scope:** Discovery screen presentation and interaction only

## Intent

Make Lattice Discovery feel like the clearest way to find an engineering product and begin an investigation—not a history report followed by a stack of source dashboards. A user arriving at `/lattice` should be able to start a fresh federated search immediately, understand what is happening across connected systems, select the records that matter, and move into an investigation. Returning to prior work remains easy, but does not displace the primary task.

The selected direction is **search first, with a compact recent-investigation shelf beneath it**. Show at most three recent active investigations on the discovery screen, with a distinct “View all” path for the full list and archive controls.

## Current experience and constraints

- `/lattice` renders `DiscoveryWorkspace` unless an investigation or handoff is already active.
- The current discovery screen renders saved investigations before search. `RecentInvestigations` requests 30 items and prints source statuses, freshness, revisions, lifecycle, timestamps, and actions for every row; this is the main cause of the long first view.
- Search is federated across Teamcenter, Windchill, SAP, Configit, and Codebeamer. Windchill and SAP are selected initially.
- Each source has independent readiness, loading, success, empty, partial, failure, timeout, cancellation, and retry states. One source can fail while others succeed.
- Results include engineering identifiers, revision/version, match classification and reason, source metadata, and technical detail. Results can be selected independently. Codebeamer also supports direct-match, all-result, and clear-selection actions.
- Investigation creation uses the selected results and opens the existing governed investigation flow. Existing loading, success, partial-evidence, and error notifications remain.
- Saved investigations support active/archived filtering, reopen, refresh, archive, and restore. The API accepts a list limit up to 100; the current discovery view requests 30.
- The frontend is Next.js 16, React 19, Tailwind 4, and DM Sans, with `motion` already installed. Keep the existing theme preference and application shell; do not introduce a framework, styling-library, or backend migration.
- `DiscoveryWorkspace.tsx`, `LatticeNextWorkspace.tsx`, and the new `RecentInvestigations.tsx` currently have uncommitted changes. Treat these as user work and integrate around them; do not discard or re-create them. Keep investigation-workspace and Copilot changes out of scope.

## Goals

- Make a new search the unmistakable first action.
- Reduce the initial amount of history and connector detail without removing access to it.
- Present federated results as one understandable working set, while keeping source provenance, partial success, match quality, and technical details available when needed.
- Preserve existing search, selection, investigation, history, refresh, archive, restore, error, and recovery behavior.
- Make the discovery screen responsive, keyboard-operable, accessible, and calm during asynchronous work.

## Non-goals

- Changing search APIs, connectors, query classification, ranking, identity resolution, result limits, evidence semantics, or investigation creation.
- Adding AI-generated summaries, a graph, dashboard metrics, or new investigation features.
- Redesigning the investigation workspace or global navigation/theme system.
- Adding dependencies or replacing the existing stack.

## Approaches considered

### A. Search first; recent work behind a disclosure

The search composer and results occupy the full canvas. A compact “Recent investigations” disclosure reveals history on request.

- **Benefit:** The quietest first screen and maximum space for search.
- **Trade-off:** Resuming work requires an extra action and recent work is less discoverable.
- **Decision:** Not selected; it under-serves the need to resume a small amount of useful work.

### B. Search first; a three-item recent shelf below it — selected

The search composer leads the screen. A compact, finite shelf beneath it shows the three most recently updated active investigations, with a clear “View all” route to history.

- **Benefit:** Supports the selected primary job while retaining immediate continuity; the first screen stays bounded.
- **Trade-off:** Adds a small secondary block, which must remain visually subordinate and must not repeat full source-level detail.
- **Decision:** Selected by the user. It is the strongest balance of fresh discovery and easy resumption.

### C. Search beside a capped recent rail

Search occupies the main column while a narrow rail shows up to three recent investigations.

- **Benefit:** Resuming is always visible on wide screens.
- **Trade-off:** The rail competes with search and results for width, and requires a more complex mobile fold.
- **Decision:** Not selected; the shelf provides continuity without keeping a second permanent column.

## Proposed experience

### First view

1. Keep the existing Lattice application shell and theme switch.
2. Make “Find an engineering product” the page’s clear heading and place a single, prominent query field with the primary search action directly below it.
3. Keep source selection available but compact: show which sources are included, preserve the current Windchill + SAP default, and let users include or exclude any of the five sources without presenting five full source panels before a query exists.
4. Put the three-row recent shelf after the search controls. Each row should prioritize the subject label, recency, and a concise freshness/lifecycle cue. Avoid printing every source status, revision, and action inline on this landing surface.
5. Link to a dedicated full-history view (or an equivalent URL-backed history state) rather than expanding an unbounded list in place. That view retains Active/Archived, full source/freshness details, reopen, refresh, archive, and restore. Request up to the API-supported limit of 100; do not imply that more than 100 items are available until the API supports paging.
6. If there are no recent investigations, keep the same frame and present one sentence that directs the user to search. If loading or listing fails, keep search usable and report the history error locally with Retry.

### Search and results

- Do not show empty connector cards before a search. After submission, use a compact per-source progress/status treatment and a single integrated results area rather than five vertically stacked dashboards.
- Preserve independent per-source progress and completion. A failed or timed-out source must not hide successful results from other systems.
- Keep provenance and the source-specific identifier visible on each result. Show the match category in plain language; reveal its match reason and technical detail on demand.
- Keep the initial results bounded per source, with an explicit “Show more” action; selected results must remain selected if temporarily collapsed.
- Preserve Codebeamer’s direct/verified selection, select-all, and clear controls in its result group.
- Show the investigation action and selected count only when results are selected. Keep the existing identity-evidence caution visible at the point where it affects the user’s decision.
- Keep search cancellation, source retry, empty results, partial results, unsupported capabilities, and technical details available in the state where they apply.
- Starting an investigation must keep its current labels, loading feedback, governed API call, success/partial/error notifications, and navigation to the investigation workspace.

### History actions

- The compact shelf opens an investigation directly; it does not refresh or archive as a side effect.
- Full history keeps Active and Archived views and all current row information and actions.
- Keep refresh tied to the selected investigation revision and continue reporting the resulting revision and changed/added/removed entity counts.
- Archive remains reversible. Prefer a brief Undo affordance in the success notification; Restore remains available in Archived history. No server command semantics change.

## Visual and interaction principles

- Treat this as a working app screen, not a marketing hero or an analyst report. Its one question is “What can I find or resume?”; the first viewport should answer it with the search action and a finite recent shelf.
- Use real engineering-source vocabulary and provenance as the product’s substance. The distinctive visual move is one query flowing into a unified, source-aware result set—not generic AI ornaments, empty dashboards, or a graph added for decoration.
- Use one restrained neutral surface system, clear type hierarchy, and one action accent. Source colors are semantic identifiers only. Avoid the current cyan-glow-on-navy treatment, decorative gradients, ambient blobs, icon-topped source cards, repeated badges, duplicate status summaries, vanity counts, and ornamental labels.
- Keep the page compact by default: no more than three recent rows; no more than three initially visible results per source; deeper technical details and the full history are intentional user actions. Do not repeat freshness or status information in both a global summary and every row.
- Preserve the existing light/dark theme setting and DM Sans typography. Refine discovery locally rather than changing the global theme, adding fonts, or introducing a new component library.
- Keep transitions responsive and purposeful: immediate pressed/focus feedback; a quick, interruptible transition for opening history or technical details; restrained result arrival/progress feedback during search; no automatic page-load choreography or ambient animation.
- Respect `prefers-reduced-motion`; keep status changes understandable without motion. Use transform/opacity for movement and retain stable layout during loading.
- Use semantic headings and buttons/links, an explicitly labelled query field, visible keyboard focus, a polite live region for search progress, and keyboard-accessible source/result selection. Ensure touch targets and layouts work at phone width without horizontal scrolling.

## Implementation boundaries

Expected primary surface: `features/lattice-next/discovery/DiscoveryWorkspace.tsx` and `features/lattice-next/discovery/RecentInvestigations.tsx`. The implementation may extract focused presentation components for the composer, source scope, result set, and recent shelf if that reduces complexity. `workspace/LatticeNextWorkspace.tsx` should only change if required to support a URL-backed history state; investigation rendering and Copilot behavior stay untouched. Reuse the current `HttpInvestigationAuthority`, `FederatedSearchOrchestrator`, reducer, and existing tests where possible. Scope new styling to discovery and reuse existing Tailwind/theme conventions.

## Acceptance criteria

- On a fresh `/lattice` visit, search is the first dominant action and the initial recent shelf contains no more than three entries.
- “View all” reaches a bounded full-history view with Active/Archived, Open, Refresh, Archive, and Restore behavior intact; it does not append an endless list to the search landing view.
- All five sources remain selectable and the initial Windchill + SAP selection is unchanged.
- Search states, per-source retry/cancel, partial success, match information, technical details, Codebeamer bulk selection, result selection, and investigation creation remain functional.
- A source failure does not erase successful results from other sources.
- Listing failure or empty history does not block a new search; loading, empty, failure, and retry states are explicit.
- Desktop and mobile show the same hierarchy; mobile keeps search first and does not scroll horizontally.
- Keyboard, focus, live-region, reduced-motion, and minimum touch-target checks pass.
- Focused tests cover recent-list capping, full-history/archive filtering, navigation, source-selection defaults, federated partial/failure states, result selection, and starting an investigation. Type checking and a production build pass.
- Browser verification exercises search, source toggles, cancellation/retry, selection, investigation start, history navigation, archive/restore, refresh, and responsive states.

## Open implementation calls

- Choose the simplest URL-backed full-history presentation that preserves browser back behavior and does not disturb investigation query parameters; prefer a same-page history state unless routing constraints require a dedicated route.
- Reuse existing row actions and error handling; any extraction should be driven by clear component boundaries rather than a new design system.
- If tests reveal that the server’s ordering or result cap differs from the intended “most recently updated” shelf, make the ordering/cap explicit in the existing repository contract rather than sorting inconsistently in the UI.

## Separate tooling follow-up

The user also requested the vendored Oxlint anti-slop plugin. The frontend currently has npm + ESLint and no Oxlint configuration. After this design spec is approved, handle that installation as a separate tooling task; it is not a dependency of the discovery UI redesign and does not replace the visual anti-slop guardrails above.
