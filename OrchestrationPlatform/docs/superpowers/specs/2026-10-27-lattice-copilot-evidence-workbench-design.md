# Lattice Copilot Evidence Workbench

**Status:** Approved for planning  
**Date:** 2026-10-27

## Intent

Redesign the investigation Copilot as a focused workbench for engineers reviewing
answers grounded in a Lattice investigation. The user should be able to read an
answer, inspect its supporting Lattice evidence or graph, and review real
investigation cues without losing the conversation or changing the main graph
unexpectedly.

The central interaction is an on-demand context area beside the conversation on
desktop. It switches among Evidence, Graph, and Review rather than stacking
sections into the transcript. The graph view is prepared from answer citations,
but it does not open or alter the main Lattice graph until the user chooses to
inspect it.

## Goals

- Give the answer and composer enough room to remain readable while a related
  evidence view is open on desktop.
- Let users move between evidence details, a citation-focused Lattice graph, and
  actual review cues in one contextual area.
- Make the cited graph scope understandable: distinguish directly cited
  entities/relationships from endpoint and ancestor context.
- Keep the chat as the primary surface and make the graph and review views
  explicitly user-triggered.
- On phones, use the available width for one task at a time and provide a clear
  return to the answer.
- Preserve current investigation lifecycle, conversation, runtime, and safety
  behavior.

## Non-goals

- Changing Copilot APIs, persistence, agent/runtime contracts, answer or message
  schemas, or conversation storage.
- Adding a new visualization library or replacing Lattice's graph renderer.
- Automatically opening the context area or mutating the main graph when an
  answer arrives.
- Adding generic prompt suggestions, fabricated activity, or synthetic graph
  entities/relationships.
- Turning advisory review cues into actions that execute without engineer
  approval.

## Anti-goals

- A tall sequence of evidence, graph, and review sections that pushes the answer
  and composer farther down the page.
- A tiny graph thumbnail that looks unrelated to the Lattice graph users already
  know.
- Surprise movement, expansion, selection, or inspector changes in the main
  graph.
- Hiding the answer or composer on desktop just to make room for context.
- Duplicating the same review-cue disclosure in multiple places.

## Current behavior and constraints

- `InvestigationCopilotPanel` is a modal right-side dialog, currently capped at
  520px on wider screens. It owns conversation selection, new conversations,
  archived/read-only state, run state, error reporting, and keyboard focus
  management.
- `CopilotKitChatSurface` renders validated structured answers, grouped
  citations, review suggestions, the composer, and actual Copilot run status.
  Entity and relationship citations are navigable; other citation kinds are
  plain references.
- `LatticeNextWorkspace` owns the investigation domain, the main graph
  projection, and citation navigation. Today, opening an entity or relationship
  citation expands/selects the main graph, opens its inspector, and closes
  Copilot.
- `RelationshipCanvas` renders a `RelationshipProjection` through the existing
  XYFlow-based Lattice graph infrastructure and expects graph interaction
  callbacks.
- The answer's citation contract already distinguishes entity, relationship,
  evidence, finding, source, and evaluation references. Only entity and
  relationship references can identify graph items for the focused graph.
- Current review suggestions are rendered as a collapsed, user-triggered
  disclosure, with run/archive gating. The redesign must keep only one such
  disclosure visible at a time.

The wider workbench needs a separate, derived graph projection and view state.
Reusing the main graph's mutable selection, expansion, viewport, or layout state
would violate the requirement that merely receiving an answer not change the
investigator's workspace.

## Approaches considered

### A. Expanded split workbench with an isolated Lattice graph view — selected

Keep the conversation and composer on one side of a widened Copilot workbench
and show one switchable Evidence / Graph / Review panel beside it. Reuse
`RelationshipCanvas` with a citation-focused projection and view-local
interaction state. This preserves the Lattice graph's visual language, avoids
transcript scroll growth, and keeps the main graph unchanged. It requires careful
separation of projection and interaction state.

This is the chosen approach. The user selected the side-by-side desktop
workbench, the cited-path graph scope, and this reuse of the existing Lattice
canvas. The user also chose to prepare the focused graph view on answer
completion while leaving the main graph untouched until the Graph view is
opened.
The user further confirmed that citations from an older answer switch the
context to that answer, and that multiple parent paths use one shortest path
with a stable tie-break.

### B. Keep the narrow drawer and stack context below the conversation

This minimizes layout changes but makes evidence and review increase transcript
scroll, and gives the graph less usable space. It conflicts with the user's
explicit preference for a side panel.

### C. Move Copilot into a separate full-page workspace

This offers the most space, but removes the existing overlay relationship with
the investigation and makes returning to the main workspace a more disruptive
navigation step. It is not needed to fit the selected side-by-side layout.

### Graph-rendering alternative rejected

A Copilot-only miniature renderer would be easier to isolate but would duplicate
graph presentation and could misrepresent Lattice relationships. The selected
implementation reuses `RelationshipCanvas` with an isolated projection and
state; it must not dispatch interactions into the main investigation state.

## Experience and behavior

### Desktop workbench

- Opening Copilot keeps its current modal and focus-management model.
- The default state remains conversation-first. The Evidence / Graph / Review
  context area is not expanded automatically when Copilot opens or when an
  answer arrives.
- Provide a clear, keyboard-accessible control to expand the contextual
  workbench. Expanding it keeps the conversation and composer beside the
  contextual panel rather than adding content below the transcript.
- The expanded context area contains one tab set: **Evidence**, **Graph**, and
  **Review**. Only one view is active at a time.
- Evidence is the initial context view when the user explicitly opens the
  context area. Graph is never selected automatically.
- Keep the existing conversation controls understandable and available without
  letting them overwhelm the answer. Preserve thread selection, new
  conversation, run-state gating, and archived read-only behavior.
- Keep the composer visually prominent and usable while the context area is
  expanded.
- The workbench may return to its compact conversation-first state using an
  explicit close/collapse control; closing Copilot continues to return focus to
  the element that opened it.

### Evidence

- Show real citations associated with the selected validated answer, including
  their existing kind, label, and available source, native identifier, or
  summary.
- The default context is associated with the latest validated answer. When a
  user opens a citation in an older answer, switch the context to that specific
  answer and its citations rather than continuing to show the latest answer.
- Preserve the answer's existing relationship between each claim or
  recommendation and the citations that support it.
- An entity or relationship citation opens the focused Graph view for its
  answer and focuses that graph item, without closing Copilot or changing the
  main graph. Other citation kinds open Evidence for their answer.
- Evidence, finding, source, and evaluation references remain inspectable as
  references, but must not be presented as graph nodes unless Lattice has an
  actual graph entity/relationship for them.
- If citation details are unavailable or no answer has citations, show a clear
  empty state based on the real state; do not manufacture content.

### Graph

- Build a focused projection from the graph citations of a validated answer.
  Prepare or refresh this derived context when a validated answer is received,
  but do not open the panel, move the main graph, or modify its selection,
  expansion, viewport, pinned positions, or inspector.
- Include directly cited entities and relationships. For each cited
  relationship, include its actual source and target endpoints. Include only
  one shortest real parent path needed to orient each cited entity/endpoint.
  Use a stable tie-break when equally short paths exist; do not show every
  alternate path.
- Include only real domain nodes and relationships. Never infer or fabricate a
  missing parent, edge, or citation target. If a target cannot be resolved
  against the current investigation domain, identify it as unavailable rather
  than displaying a made-up node.
- Visually distinguish directly cited items from endpoint/ancestor context and
  retain the source graph's existing node/relationship semantics.
- Highlight the answer's cited graph items. A user action on an entity or
  relationship citation, or selection of the Graph tab, may focus the derived
  view; answer completion alone must not reveal it.
- Reuse `RelationshipCanvas` and the existing Lattice graph provider. Its
  selection, expansion, pan/zoom, and layout state must be local to this
  context view. View-only operations must not dispatch commands to the main
  investigation graph or mutate persisted investigation state.
- `RelationshipCanvas` currently listens for window-level fit, collapse,
  reflow, Escape, and geometry events. Scope or disable those listeners for the
  additional canvas so its controls and animation signals cannot affect the
  main graph, and so the covered main workspace does not handle Copilot's
  keyboard actions.
- If the selected answer has no resolvable graph citations, present a concise
  empty state explaining that this answer has no graph-linked citations. Do not
  substitute the whole investigation graph.
- Keep graph controls keyboard accessible and at least 44px where they are
  actionable. Honor reduced-motion preferences through the renderer's existing
  behavior.

### Review

- Show only actual `InvestigationReviewCue` items supplied by the existing
  investigation data.
- Preserve the current collapsed, user-triggered review-suggestions disclosure
  and its count. The redesigned interface must render a single disclosure,
  never a second copy in the chat and the context view.
- Preserve cue actions, dismissal behavior, current run/connection gating, and
  archived read-only gating. No cue action may execute a recommendation
  automatically.
- When there are no cues, show a quiet, truthful empty state; do not invent
  review activity.

### Phone behavior

- At phone widths, the context panel replaces the transcript instead of
  compressing chat and graph side by side.
- The context view has a persistent, accessible **Back to answer** action that
  returns to the conversation and composer. Preserve the active answer/thread
  and do not reset conversation state when switching views.
- Context tabs remain switchable while the context view is active.
- Preserve modal focus containment, Escape-to-close, focus return, visible
  focus, reduced motion, and a minimum 44px target for actionable controls.

### Status, errors, and lifecycle

- Keep the real ThinkingOrb status for connection and run state; do not show
  simulated activity.
- Do not derive graph highlights from partial or unvalidated assistant output.
  Keep the last validated answer's graph context available while a new answer is
  running, then replace it only when the new validated answer is available.
- Keep loading, safe error messages, retry behavior, and explicit error states.
  Do not convert a failure into an empty success state.
- Archived investigations remain read-only: no sending messages, asking review
  cues, starting a conversation, or other write action that is currently gated.
- Preserve current thread restoration and saved-thread selection behavior.

## Design and implementation quality guidance

- Apply the available UI/UX guidance to prioritize contrast, keyboard use,
  responsive behavior, clear back navigation, 44px touch targets, and motion
  that respects reduced-motion settings.
- Keep the visual language specific to Lattice: preserve its palette and graph
  semantics, avoid generic SaaS-card styling, and make any transition explain a
  user action rather than add ambient animation.
- Reuse existing icons and interaction patterns before introducing new ones.
  Keep labels plain, consistent, and action-specific.
- When implementation touches CopilotKit behavior, verify current V2 guidance
  before changing integrations; this design does not call for API or runtime
  changes.
- The user requested the skills `ui-ux-pro-max`, `transitions-polish`,
  `motion-design`, `lavish`, `interaction-design`, `install-anti-slop`,
  `impeccable`, `grill-me`, `better-icons`, and `copilotkit`. The current skill
  registry exposes `ui-ux-pro-max` and `copilotkit`, which were loaded; it
  reported the other named skills as unavailable. Do not claim to have applied
  unavailable skills or install replacements without approval. Use the
  available design, interaction, accessibility, and icon guidance to cover
  their relevant concerns.

## Visual direction

- Preserve the existing Lattice palette, typography, and restrained surface
  styling; use hierarchy and spacing rather than introducing a new theme.
- Make the conversation/answer the primary reading column and the context panel
  a clearly secondary, switchable workspace.
- Avoid decorative graph flourishes, generic suggestion cards, redundant
  headings, excessive borders, and repeated metadata.
- Use concise labels from the existing product vocabulary. New labels should
  describe navigation or state plainly.
- Make empty, loading, and error states distinct and useful without adding
  placeholder data.

## Constraints

- No API, persistence, agent/runtime contract, message schema, or answer schema
  changes.
- No dependency changes.
- Use existing Lattice domain/projection data and renderer; no synthetic graph
  data.
- Keep graph-panel state isolated from main graph state.
- Do not regress accessibility, keyboard focus, reduced motion, archived mode,
  run gating, safe errors/retry, or real status indicators.
- Preserve unrelated worktree changes. Product implementation should be
  reviewed against the current dirty tree rather than reverting or overwriting
  other work.

## Likely implementation surfaces

- `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`:
  modal shell, compact/expanded workbench, desktop split, phone view switching,
  tabs, focus behavior, and existing conversation controls.
- `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`:
  answer-associated citation interactions and ensuring review suggestions are
  rendered exactly once.
- `frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx`:
  derive the focused graph context from the current domain and provide it
  without mutating main graph state; route citation actions into the Copilot
  context panel rather than closing it.
- Existing graph projection and canvas infrastructure:
  produce a restricted `RelationshipProjection` and render it through
  `RelationshipCanvas` with view-local state and safe interactions.
- Direct component and projection tests:
  verify desktop/phone navigation, no automatic panel/main-graph changes,
  cited-path inclusion and exclusions, citation routing, cue uniqueness,
  focus/accessibility, and preserved lifecycle gates.

These are likely surfaces, not permission to change public contracts. The
implementation plan should identify exact files and test seams after reviewing
the current workspace and projection helpers.

## Open to the builder

- Exact desktop width breakpoints and proportions, chosen to keep the answer
  readable and the graph usable at the actual supported viewport sizes.
- The smallest safe adaptation needed to host an independent `RelationshipCanvas`
  instance and prevent its controls from touching global graph state.
- How to retain the selected answer context when switching threads or when a
  new validated answer replaces it, provided the selected behavior above remains
  intact.
- Exact concise empty-state wording, using existing Lattice vocabulary and no
  invented data.
- The precise approach for exposing cited-versus-context graph highlighting
  using current node and edge visual semantics.

## Approval checklist

- [ ] Desktop shows the answer/chat and one on-demand Evidence / Graph / Review
      panel side by side.
- [ ] Phone context replaces chat and has a clear Back to answer action.
- [ ] Graph scope is the answer's cited entities/relationships, relationship
      endpoints, and minimum real parent path.
- [ ] Answer completion prepares but does not open the graph view or mutate the
      main graph.
- [ ] Evidence and review data are real, and review cues have only one
      collapsed user-triggered disclosure.
- [ ] APIs, persistence, schemas, runtime behavior, and dependencies remain
      unchanged.
- [ ] Existing focus, run, archive, error/retry, status, and reduced-motion
      behavior is preserved.
