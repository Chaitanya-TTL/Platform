# Three-Question Market Slide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrative market slide with concise copy that directly answers the three stakeholder questions.

**Architecture:** Edit only the market-slide section of the existing Markdown deliverable. Organize it under headings for the unique offering, customer value, and existing competition; retain source notes and the boundary between current evidence-grounded answers and future human-approved write-back.

**Tech Stack:** Markdown documentation; existing official vendor source links.

**Spec:** `docs/superpowers/specs/2026-11-13-three-question-market-slide-design.md`

## Global Constraints

- Do not edit Slide 5 or the PowerPoint deck.
- Do not claim model training, autonomous changes, implemented write-back, or proven market uniqueness.
- Do not claim competitors lack cross-system capabilities.
- Keep the slide concise; detailed source URLs and caveats may remain in notes beneath the slide copy.
- Keep write-back as a longer-term objective requiring human review and approval.

## Review Focus

- **Current vs. future capability:** ensure no wording implies source-system write-back is available today.
- **Uniqueness:** frame the proposed differentiation as an opportunity or hypothesis, not a proven market gap.
- **Competitor coverage:** make clear that the named offerings have adjacent overlap and do not imply an exhaustive market survey.
- **Slide brevity:** keep supporting citations and caveats out of the three concise answer blocks where possible, retaining them in source notes.
- **Scope isolation:** verify Slide 5 and its resource/budget statements remain untouched.

---

### Task 1: Revising the market slide copy

**Files:**
- Modify: `docs/superpowers/deliverables/2026-11-13-enterprise-orchestration-slide-content.md`
- Reference: `docs/superpowers/specs/2026-11-13-three-question-market-slide-design.md`

**Interfaces:**
- Consumes: the approved three-question design and the deliverable's existing vendor sources.
- Produces: a concise market slide with three sections answering:
  1. What is unique about the offering?
  2. What customer value does it add?
  3. What competing or existing tools overlap?

- [x] **Step 1: Replace the narrative market-slide structure** with three direct question headings and concise, plain-language answers. Describe connected engineering-domain context across PLM, ERP, requirements/ALM, and configuration systems, evidence-grounded answers, and the longer-term governed-action direction.
- [x] **Step 2: Preserve claim boundaries and sources.** State that creating/updating records is a future capability subject to human approval. Keep competitor descriptions tied to the existing official sources and avoid claims of exclusive capability or absent competition.
- [x] **Step 3: Review the revised deliverable.** Confirm the three questions are answered directly, supporting source notes remain, the copy is slide-ready, and Slide 5 is unchanged.
- [x] **Step 4: Run `git diff --check`.** No whitespace errors were reported.
