# Lattice Copilot Evidence-Led UX Design

## Status

Approved by the user on 2026-11-03. Product changes are limited to the
implementation scope below.

## Intent

Make the Lattice investigation Copilot feel like a distinctive evidence-review
tool rather than a generic chatbot, without adding clutter. The primary user is
an engineering investigator asking questions during a longer review session
and needing to verify each answer against the saved investigation snapshot.

The current CopilotKit V2 integration, Lattice-owned conversation storage, and
validated server turn flow are working. This project changes the presentation
and interaction hierarchy of the existing chat panel, not its authority,
model, data contracts, or persistence.

## What exists today

- `InvestigationCopilotPanel` opens a right-side drawer, which fills the
  viewport on a phone. At 1440px it is 520px wide.
- The panel has an investigation title and revision, a saved-conversation
  selector, a New conversation button, one collapsed Review suggestions
  disclosure, a CopilotKit transcript, and a docked composer.
- The empty state explains that answers use the selected evidence and saved
  snapshot. Populated messages show the user's prompt and validated assistant
  content; structured answer details and citations are available through a
  disclosure.
- Local browser review found a large, visually uninformative gap in sparse
  conversations. The surface reads as a standard dark chat panel and does not
  make evidence provenance the visual identity.
- Thread creation and switching, Escape close and focus return, focus
  wrapping, the empty-composer disabled state, and the subdued composer focus
  treatment were exercised in the local browser. At 390px and 1440px the
  panel fits without horizontal overflow.
- All 93 offline Copilot tests pass. The Azure transport tests mock network
  calls; no model call was made during this review.

## Product inventory

- **Investigation:** an engineering investigation with a stable ID and saved
  snapshot revision.
- **Conversation:** a Lattice-owned, investigation-scoped thread with an ID,
  title, user messages, and persisted validated assistant messages.
- **Assistant answer:** a concise answer plus structured claims,
  recommendations, uncertainties, follow-up questions, and citations.
- **Evidence:** source-backed records and engineering entities/relationships
  from the saved investigation snapshot. Some entity citations navigate to
  Lattice details; other citation types remain references.
- **Review cue:** an investigation-specific observation with a title, detail,
  and user-triggered prompt. Cues are not fabricated chat suggestions.
- **Lifecycle:** idle, connecting/restoring, running, stopped, or failed.
  Running and error states must describe real system state.
- **Access state:** active investigations allow turns; archived investigations
  remain readable but are read-only.
- **Observed sparse case:** the reviewed local thread list had two saved
  conversations, one visible user message, and four review cues. These are
  observations, not fixed design assumptions or product-wide totals.
- **Primary jobs:** ask about evidence or a relationship; verify a claim by
  opening its source; continue or switch an investigation-scoped conversation;
  review a cue; stop an active run.
- **Use pattern:** repeated desktop review sessions, with phone use supported
  by a full-width panel and touch-sized controls.
- **Product-specific identity:** the Lattice relationship graph, saved
  investigation snapshot, engineering source records, and answer-to-evidence
  trail.

## Screen question and finding

**Screen question:** What does the saved investigation evidence support, and
where can I verify it?

**Finding:** A useful Lattice answer is not only a response; its claims must
remain traceable to the evidence and revision that support them.

## Goals

- Put the answer first and make its evidence trail easy to find and verify.
- Make empty and sparse conversations feel intentional without filling them
  with generic suggestions, decorative cards, or invented metrics.
- Retain a quiet default surface: conversation management and review cues stay
  compact or collapsed until needed.
- Use real investigation cues and validated answer metadata as the source of
  visible content.
- Improve the density, hierarchy, and mobile reading experience while keeping
  the drawer's existing placement and CopilotKit V2 interaction model.
- Use `ThinkingOrb` only for real active-run feedback and preserve accessible
  status announcements and reduced-motion behavior.
- Preserve existing keyboard, focus-return, cancellation, error, retry, and
  archived-state behavior.

## Non-goals

- No CopilotKit Intelligence, hosted threads, external telemetry, new model
  provider, or live Azure calls.
- No new agent tools, generative UI, PLM/source-system mutations, or changes
  to the investigation graph.
- No changes to persisted message or answer schemas, Lattice storage, API
  routes, validation, idempotency, authorization, usage recording, or retry
  policy.
- No dependency changes or styling-library migration.
- No permanently visible evidence side rail in the 520px drawer.

## Anti-goals

- Do not turn the surface into a dashboard or add a grid of cards.
- Do not add generic prompt chips, placeholder conversations, fake counts, or
  claims not derived from the saved snapshot.
- Do not show both an expanded cue list and a second set of equivalent
  CopilotKit suggestions.
- Do not use gradients, glows, animated decoration, multiple accent colours,
  or a bright focus halo.
- Do not hide evidence behind a sequence of nested disclosures or make
  navigation depend on color alone.
- Do not shrink essential text or touch targets to make the panel appear
  denser.

## Approaches considered

1. **Evidence-led conversation — selected by the user.** Keep a calm,
   compact transcript, but make the validated answer and its trace to evidence
   the defining visual structure. Show the short answer first, bring relevant
   source references close to the claims they support, and keep extended
   analysis in one accessible disclosure. Keep the investigation's real review
   cues available without turning them into a prompt-card wall. This best
   differentiates Lattice without permanently splitting the narrow drawer.
2. **Minimal messenger — not selected.** Strip the panel to conversation and
   composer, moving thread management and review cues into secondary controls.
   This is the quietest option, but makes evidence provenance less visible and
   is less distinct from a general-purpose chat.
3. **Compact evidence workspace — not selected.** Place conversation beside
   a persistent evidence rail on wide screens and stack them on phones. This
   would expose more context immediately, but is likely to recreate the
   clutter the user asked to remove and would consume too much room in the
   current drawer.

## Visual direction

Use the existing `data-terminal` app-screen direction as the composition
reference: it was previously dealt for a dark developer-tool view and suits
long engineering review sessions. Keep Lattice's existing palette and type
roles rather than introducing a new color system. The distinguishing
“signature element” is the evidence trace itself: concise claims connected to
their supporting source references, with navigation on citations that already
support it. Use surface tone and spacing for hierarchy; reserve the existing
accent for meaningful interaction and evidence navigation.

The screen remains a working app surface, not a marketing page: no oversized
hero, decorative illustration, or entrance animation. Keep readable type,
clear labels, high-contrast metadata, restrained borders, and visible
keyboard focus.

## Proposed experience

### Panel chrome and conversations

- Keep the investigation name, snapshot revision, close control, and
  investigation-scoped thread selection.
- Preserve the new-conversation action and saved-thread selector. Refine their
  hierarchy and spacing so they read as conversation controls rather than a
  second header competing with the chat.
- Keep conversation selection and creation disabled during an active run;
  CopilotKit's stop action remains available.

### Empty and sparse conversations

- Keep the plain-language explanation that answers are grounded in the saved
  investigation.
- Keep the composer as the primary next action.
- Do not add generic sample prompts or artificial activity to occupy space.
- When real review cues exist, preserve one collapsed Review suggestions
  disclosure; do not expand a wall of cues by default or duplicate it with
  native suggestion chips.
- Make the message region's spacing respond to actual content density so a
  sparse thread does not look like a message stranded in a large, empty card.

### Populated conversation and evidence

- Keep the validated answer as the first and most legible part of the
  assistant response.
- Place source references close to the claim/recommendation they support,
  using their existing labels and navigation behavior. Do not imply that a
  non-navigable source is a link.
- Keep claims, additional sources, recommendations, uncertainties, and
  follow-up questions accessible in a single compact disclosure; avoid a
  collection of stacked cards.
- Preserve safe plain-text rendering when restored assistant metadata is
  missing or invalid.

### Activity, errors, and access state

- Show `ThinkingOrb` and a concise status only while a run is active. Do not
  invent stages or progress percentages.
- Keep sanitized error messages, validation-detail bounds, safe retry
  visibility, and billing-uncertainty guidance unchanged.
- Keep archived conversations readable, show the existing read-only
  explanation, and disable sending and actionable review cues.
- Keep focus trapped in the modal while open, return focus on close, maintain
  visible focus indication, and respect reduced-motion preferences.

### Responsive behavior

- At desktop widths, retain the right-side panel and use a stable reading
  measure for answer content.
- At 390px, the panel remains full-width, scrolls vertically without page
  overflow, and keeps the composer and controls usable with touch.
- Keep controls at least 44px tall where they are touch targets; body text
  remains readable at 14px or larger.

## Architecture and data boundaries

- Keep `InvestigationCopilotPanel` as the dialog shell and
  `CopilotKitChatSurface` as the CopilotKit V2 surface.
- Keep `/api/lattice/copilotkit`, the current investigation-scoped composite
  thread identity, and Lattice's existing thread list and restoration flow.
- Render only validated answer metadata supplied by the existing agent and
  persistence runner. Do not interpret arbitrary model text as HTML or as
  authoritative evidence.
- Keep citations and cue actions wired through existing callbacks.
- Make no changes to the Azure client or enable live calls during design,
  implementation, or validation.

## Implementation scope

Expected product changes are limited to:

- `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- directly related Copilot surface and panel tests
- the Copilot UX design and implementation plan documentation

The builder may adjust exact spacing, message grouping, and component markup
within these constraints. Any change that requires new evidence data,
server/API behavior, message-schema changes, or permanent additional panels
must return for user approval.

## Acceptance criteria

- The first view identifies the investigation scope and explains that answers
  use the saved snapshot without adding generic filler.
- A sparse conversation no longer reads as an isolated message surrounded by
  arbitrary empty UI; any remaining space is deliberate and the composer is
  still easy to find.
- A validated answer is visually primary, and its real supporting citations
  are discoverable at the point they support the answer.
- Review cues remain one collapsed, user-triggered surface with no duplicate
  suggestion UI.
- Existing thread create/switch/restore behavior, running-state gating,
  cancellation, error/retry/billing handling, archive state, and citation
  navigation remain intact.
- Desktop and 390px layouts have no horizontal overflow; keyboard dialog
  behavior, focus return, composer focus styling, and reduced motion remain
  accessible.
- Offline tests, focused lint, and TypeScript validation pass without live
  Azure calls. Browser review uses only the local application and sends no
  prompt.

## Validation approach

- Keep all Copilot tests local, with Azure live calls disabled. Cover the
  affected surface and panel tests plus the existing Copilot agent, runner,
  route, persistence, evaluation, and client suites.
- Run focused ESLint and a TypeScript no-emit check for implementation.
- Inspect the running localhost UI at 1440px and 390px, compare screenshots,
  and exercise empty/restored threads, conversation switching, review cues,
  composer states, keyboard close/focus, archived/read-only state, and
  reduced-motion behavior without sending a real prompt.
- Do not run `copilotkit verify`, a network-dependent build, or any live
  provider request as part of local validation.
