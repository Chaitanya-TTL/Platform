# Concise Copilot Responses Implementation Plan

> **For agentic workers:** Implement natively in this session; keep the persisted answer contract compatible.

**Goal:** Make investigation answers easy to scan while retaining accessible, snapshot-backed detail on demand.

**Architecture:** Instruct the existing model response schema to provide a brief synthesis and avoid repeating claim details. Render the synthesis first and put claims, citations, recommendations, and uncertainties inside one accessible disclosure. Keep all persisted fields and validation behavior unchanged.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Vitest.

**Spec:** User-approved direction in the 2026-10-26 Copilot UX conversation: concise answer first, with evidence and caveats collapsed.

## Global Constraints

- Do not change the Copilot answer persistence schema.
- Preserve citation, revision, and approval validation.
- Do not make live model requests.

## Review Focus

- Empty details categories should not render an empty disclosure.
- The summary should not repeat the claims list; verify response instructions and UI hierarchy.
- Keyboard users must be able to open and close the details disclosure.

---

### Task 1: Concise model response and answer layout

**Files:**
- Modify: `frontend/features/lattice-next/copilot/policy.ts`
- Modify: `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Test: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`
- Test: `app/api/lattice/investigations/[investigationId]/copilot/route.test.ts`

- [ ] Instruct the model to write a concise synthesis and reserve claim bullets for distinct supporting facts.
- [ ] Render citations once with their claims, under a native `details` disclosure; group recommendations and uncertainty there.
- [ ] Test collapsed-by-default rendering, details content, keyboard-native disclosure semantics, and active snapshot revision in the prompt.
- [ ] Run the focused offline route and panel tests; do not call Azure.
