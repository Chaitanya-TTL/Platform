# Lattice Discovery and Investigation Copilot UI Update

**Status:** Approved  
**Scope:** Discovery search controls and the investigation Copilot conversation surface

## Intent

Make Discovery's search and source selection feel like deliberate product controls rather than default form elements. Make the investigation Copilot easier to read and navigate by prioritizing the answer, removing the fixed follow-up strip, and moving investigation-specific conversation history into an integrated sidebar.

The user supplied screenshots and React Bits references for the source picker, thinking indicator, response text, prompt bar, and Microsoft Copilot conversation navigation. Treat those as interaction references, not as permission to import unrelated controls or replace the existing product behavior.

## Current experience

- Discovery uses a bottom-border search field and native checkboxes for five source systems. The available local logos are Windchill, SAP, Configit, and Codebeamer; no Teamcenter logo was found in the frontend public assets.
- Windchill and SAP are selected by default. Search orchestration, per-source tabs/status, result selection, and investigation creation are already implemented and must remain unchanged.
- The investigation Copilot is a right-side dialog. It uses a native `<select>` for saved threads, a full-width "New conversation" button, a fixed follow-up cue strip, and a custom assistant renderer that puts the validated answer into one plain-text paragraph.
- CopilotKit v2 provides public view slots for custom input and message presentation. Existing thread APIs, run state, cited-answer context, and investigation-specific history are already available.
- The project already has Motion, GSAP, Tabler icons, and `thinking-orbs`. Hugeicons are not installed. Use existing dependencies unless a justified markdown-rendering dependency is needed.
- The current right-side "Why this answer?" context panel is separate from conversation history and must remain available.

## Goals

1. Replace the primitive-looking Discovery search treatment with a quiet, well-proportioned search bar that has a visible, accessible focus state without a bright blue glow or focus-fill treatment.
2. Present source selection as compact, logo-led controls with clear selected/unselected states, accessible names, and the same selected-source behavior and defaults.
3. Give each investigation a Copilot conversation rail, with an explicit open/close control and a list limited to threads belonging to that investigation.
4. Make "New chat" icon-only at rest and smoothly reveal its text on hover or keyboard focus; keep its accessible name available when collapsed.
5. Improve answer readability with proper paragraph/list/heading rendering and human-readable, clickable citations where citation tokens match validated citations.
6. Use the supplied thinking, response-reveal, and prompt-composer patterns selectively: preserve live status, do not invent internal reasoning steps, and show only a text field plus send/stop control in the composer.
7. Remove the fixed follow-up-cue strip from the conversation surface.

## Non-goals

- Changing search APIs, connectors, ranking, source selection defaults, result semantics, investigation creation, or investigation payloads.
- Changing Copilot thread persistence, model configuration, context construction, answer validation schema, citation authority, or run/retry behavior.
- Replacing the CopilotKit chat runtime or its streaming/thread lifecycle.
- Adding attachments, model selection, tools menus, slash commands, dictation, or unrelated PromptBar controls.
- Redesigning the "Why this answer?" evidence/context panel, the global application shell, or recent-investigation presentation.
- Removing backend follow-up fields or changing server-side review-cue generation; only remove the fixed UI strip.

## Approaches considered

### A. Overlay conversation rail

Keep the current Copilot width and let the conversation list slide over the message area.

- **Benefit:** Minimal width change and a compact implementation.
- **Trade-off:** Opening history obscures the conversation the user is switching from, especially on desktop.
- **Decision:** Not selected; it does not preserve the side-by-side orientation in the supplied reference.

### B. Integrated, in-flow conversation rail — selected

Expand the desktop Copilot dialog to accommodate a left conversation rail and a readable chat column. Keep the current chat in view while the rail opens. On narrow screens, show the conversation rail as a full-screen in-dialog view with a clear way back to the chat.

- **Benefit:** Closely follows the supplied Microsoft Copilot navigation model while keeping history and the current conversation understandable together.
- **Trade-off:** The desktop dialog becomes wider and needs deliberate responsive behavior.
- **Decision:** Selected by the user. Keep the CopilotKit runtime and thread APIs; change only the surface layout and presentation.

### C. Replace CopilotKit's chat surface

Build a bespoke conversation UI and wire messages, streaming, errors, retries, and thread history directly to the existing endpoints.

- **Benefit:** Maximum layout control.
- **Trade-off:** Reimplements behavior already supplied by CopilotKit and increases regression risk without being required by the requested design.
- **Decision:** Not selected.

## Proposed experience

### Discovery search and source selection

- Keep the search-first page hierarchy and existing query field, cancel/search actions, and form semantics.
- Replace the bottom-border treatment with a restrained, contained search surface. Focus should be clear through a neutral, high-contrast outline/border rather than a blue ring, glow, or background highlight.
- Use local logo assets for Windchill (`/images/wc_Logo.png`), SAP (`/images/sap_Logo.png`), Configit (`/images/configit_Logo.png`), and Codebeamer (`/images/cb.png`). Present the source name as text as well as the logo so recognition never depends on color or image loading.
- No Teamcenter logo exists in the frontend public assets. Use a neutral "TC" monogram in the same footprint until a genuine Teamcenter logo is supplied; do not invent or fetch a replacement brand asset.
- Make source controls feel like compact selectable tiles/chips, with an obvious selected state independent of the logo, accessible checkbox semantics, visible keyboard focus, and comfortable touch targets. Preserve the current Windchill + SAP default, five sources, labels, disabled-during-search behavior, and selected-source state.

### Investigation Copilot navigation and conversation

- Add a conversation-rail toggle to the Copilot header with an accessible label, `aria-expanded`, and a stable controlled-panel relationship.
- The rail lists only threads returned for the active investigation. Selecting a saved thread uses the existing thread-switch path. An unsaved new conversation is represented clearly while active. Loading, error/retry, empty, archived, and running states remain explicit.
- Remove the native conversation dropdown. Keep one "New chat" action: icon-only while idle, expanding to include its label on hover and keyboard focus, and collapsing when neither applies. Keep a minimum 44px target and visible keyboard focus.
- Preserve the separate "Why this answer?" panel and its citation/relationship interactions.
- Remove the fixed follow-up cue strip so it no longer consumes permanent chat space. Do not remove follow-up data from the server contracts.

### Answer, thinking state, and composer

- Render validated `answer.answer` as readable Markdown (paragraphs, headings, lists, and inline emphasis). Keep raw HTML disabled.
- Recognize inline citation markers in the form `(cite:{kind}:{encodedId})` only when the exact marker matches a validated citation's `citationId` (for example, `(cite:entity:sap%3Ahistory%3Aaccounting-line-count)`). Render matched markers as concise clickable citation labels that open the existing citation/context flow; do not infer a citation from decoded or partial text, and never show URL-encoded citation identifiers as ordinary prose. Preserve unmatched answer text rather than silently dropping it.
- If needed to make formatting explicit, adjust only the answer-field instructions in the model prompt; retain the JSON answer schema and validation. Ask the model for concise structure and useful paragraph/list breaks, not a rigid report template.
- Use the supplied ThoughtLine behavior for the actual running state. Do not expose fabricated trace steps. Respect reduced motion and settle into the completed state without shifting the conversation.
- Use the supplied TextType behavior as a restrained, one-pass reveal of new answer text, coordinated with CopilotKit's live stream so it does not replay a full answer after streaming completes. Reduced-motion users should see content immediately.
- Use only the PromptBar's text-entry surface and send/stop action. Preserve CopilotKit submission, `MAX_MESSAGE_LENGTH`, archived/read-only behavior, and the running stop action. Do not add attachments, model/effort controls, or menus.
- Use existing Motion/GSAP/Tabler dependencies where useful; do not add Hugeicons. If a safe Markdown renderer must become a direct dependency, add only that focused dependency and keep raw HTML disabled.

## Constraints and acceptance criteria

- Search results, status, retry/cancel, source selection, selected record IDs, and investigation creation behave exactly as before.
- A selected or deselected source is conveyed by more than logo color; all five source labels remain visible and keyboard/screen-reader controls remain usable.
- The conversation rail is scoped to the current investigation, and switching threads never changes investigation identity.
- The new-chat action works for pointer and keyboard users and is disabled consistently during thread loading/runs and for archived investigations.
- Long and multiline model answers remain readable at narrow widths. Matching citation markers open the existing supporting context; absent citation data does not crash rendering.
- Thinking and answer motion respect `prefers-reduced-motion`, and streaming remains readable without a second delayed playback.
- The composer still sends through the existing CopilotKit message path and changes to stop while a run is active.
- The follow-up strip is absent, while other error, retry, evidence, and conversation behaviors remain.

## Implementation decisions left to the builder

- Choose exact desktop width, rail width, mobile transition, and motion duration based on the existing dialog and viewport constraints.
- Prefer existing source logos and icons; use `next/image` or an equally appropriate local-asset pattern with stable dimensions and descriptive alternatives.
- Keep focus management predictable when opening/closing the rail and switching between mobile rail and conversation.
- Add focused tests for accessible source selection, answer/citation rendering, conversation navigation, new-chat action, and follow-up-strip removal.
