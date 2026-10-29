# Lattice source filter layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Lattice search-source cards wide enough to show their checkbox, logo, and full source name without cutoff.

**Architecture:** Replace the viewport-triggered five-column grid with an auto-fitting CSS grid using a 220px minimum card width (capped to the container width). Keep the existing label and input behavior unchanged.

**Tech Stack:** Next.js, React, Tailwind CSS v4, Vitest.

**Spec:** [2026-10-28-lattice-source-filter-layout-design.md](../specs/2026-10-28-lattice-source-filter-layout-design.md)

## Global Constraints

- Preserve existing source selection behavior, defaults, checkbox semantics, logos, and visual states.
- Keep the change limited to the source filter layout.
- Use responsive columns so cards wrap into fewer, wider columns as needed.

## Review Focus

- Container narrower than 220px: the grid must still use the full available width rather than overflow.
- Search column around 550px: cards must wrap to fewer columns and avoid the current five narrow cards.
- Wider search column: additional columns should appear only when each card can retain the minimum width.
- Long source labels such as “Codebeamer”: available card width must prevent mid-word clipping.
- Checked and disabled states: changing layout must not alter existing checkbox state or disabled behavior.

---

### Task 1: Make source cards responsively wrap

**Files:**
- Modify: `frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx` — replace the forced `xl:grid-cols-5` source-card grid.
- Test: `frontend/features/lattice-next/tests/discovery-workspace.test.tsx` — pin the auto-fit grid class and retain existing selection assertions.

**Interfaces:**
- Consumes: `LATTICE_SOURCES`, `SOURCE_LABELS`, and the existing `state.selectedSources` state.
- Produces: source cards whose columns auto-fit at a minimum of 220px, capped to 100% of the grid width.

- [x] **Step 1: Add a regression assertion**

Add a test named `uses a responsive minimum-width grid for source filters` that renders `DiscoveryWorkspace` and asserts the source grid includes `grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))]`. Keep the existing Windchill/SAP checked-default assertions unchanged.

- [x] **Step 2: Run the focused test and confirm it fails**

Run from `OrchestrationPlatform/frontend`:

```powershell
npm test -- features/lattice-next/tests/discovery-workspace.test.tsx
```

Expected: the new responsive-grid assertion fails because the component still uses `xl:grid-cols-5`.

- [x] **Step 3: Implement the responsive grid**

In `DiscoveryWorkspace.tsx`, replace `grid-cols-1 sm:grid-cols-2 xl:grid-cols-5` with `grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))]`, retaining the existing gap and all checkbox markup/state behavior.

- [x] **Step 4: Run focused component tests**

Run:

```powershell
npm test -- features/lattice-next/tests/discovery-workspace.test.tsx
```

Expected: all tests pass, including the responsive-grid assertion and unchanged source-default assertions.

- [x] **Step 5: Verify the rendered layout at constrained and wide widths**

Use the running Lattice page at a 1366px viewport and a wide viewport. Expected: the constrained left search column renders wider cards across multiple rows with full source names; wide columns add cards per row without changing their checkbox state or behavior.
