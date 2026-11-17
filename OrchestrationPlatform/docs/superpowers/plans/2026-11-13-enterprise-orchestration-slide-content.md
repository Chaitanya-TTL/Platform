# Enterprise Orchestration Slide Content Plan

> **For agentic workers:** Follow the approved design in `docs/superpowers/specs/2026-11-13-enterprise-orchestration-slide-content-design.md`. Produce slide-ready content only; do not edit a PowerPoint deck.

**Goal:** Deliver accurate, concise content for the requested deployment-resource slide and an updated market-value slide showing the longer-term governed write-back ambition.

**Architecture:** Keep Slide 5 focused on deployment inputs and pending allocation/budget. Update the market-value slide to show a progression from connected domain context, to evidence-grounded answers, to future source-system changes prepared for human review and approval before write-back; retain a concise, source-supported competitor strip.

**Tech Stack:** Markdown copy and official vendor web sources.

**Spec:** `docs/superpowers/specs/2026-11-13-enterprise-orchestration-slide-content-design.md`

## Global Constraints

- Keep Slide 5 focused on deployment inputs and the internal/procured split.
- Mark resource ownership, availability, and costs as pending IT/procurement validation; do not imply confirmed internal capacity or invent a budget.
- Flag the storage sizing conflict in the current slide: 250 GB in the summary versus 2 TB expandable SSD in the requirements table.
- Keep the market-value content separate from Slide 5, with a small competitor strip.
- Describe the work as domain context engineering and orchestration for evidence-grounded answers, not as training an LLM from scratch.
- Show an intended progression from connecting domain context, to answering with evidence, to preparing a source-system change for human review and approval before write-back.
- Use examples such as creating a requirement or modifying a change notice; label write-back as a future capability, not as currently available.
- Distinguish documented competitor capabilities from the proposed project's differentiation opportunity.
- Do not create or edit a PowerPoint deck; provide slide-ready content only.
- Do not claim that competitors cannot support this use case or that this project is uniquely capable.
- Do not imply autonomous or unreviewed changes to enterprise source systems.
- Do not claim write-back is implemented or available today.

## Review Focus

- **Pending must not read as confirmed availability:** mark internal/procured responsibility and budget as pending.
- **Storage discrepancy must not be hidden:** preserve both source figures and flag validation.
- **Competitor capabilities and differentiation must not be overstated:** use official sources, describe only documented adjacent products or write actions, and frame differentiation as an opportunity to validate. (Task 2 review.)
- **AI terminology must not imply model training:** use “context engineering” and “orchestration.”
- **Future write-back must not sound live or autonomous:** mark it as future and require human review/approval before the source-system update. (Task 2 review.)

---

### Task 1: Preserving Slide 5 Deployment Content

**Files:**
- Review: `docs/superpowers/deliverables/2026-11-13-enterprise-orchestration-slide-content.md`
- Reference: user-provided Slide 5 image and approved design

**Interfaces:**
- Consumes: the approved current Slide 5 copy and its supplied-image source.
- Produces: confirmation that the deployment section remains unchanged while the adjacent market slide is revised.

- [x] **Step 1: Verify the deployment section remains intact** with pending internal/procured availability and budget, and the 250 GB/2 TB storage discrepancy.
- [x] **Step 2: Confirm the market-slide revision does not alter deployment requirements**, invent a budget, or treat unapproved resources as available.

### Task 2: Evolving the Market-Value Slide to Include Governed Actions

**Files:**
- Modify: `docs/superpowers/deliverables/2026-11-13-enterprise-orchestration-slide-content.md`
- Reference: official vendor URLs listed in the approved design

**Interfaces:**
- Consumes: the manager-provided direction, approved human-review-before-write-back boundary, and research basis in the design.
- Produces: a value-led slide with a problem statement, the progression from context to answers to future action, target customer value, a small adjacent-product strip, and concise source notes.

- [x] **Step 1: Draft the capability progression** as “Connect domain context” → “Answer with evidence” → “Prepare a change for review; after approval, write to the source system.” Explicitly label the final stage “Future capability.”
- [x] **Step 2: Include bounded action examples**: create a requirement and modify a change notice. State that the agent prepares the change for human review and approval before write-back.
- [x] **Step 3: State customer value as intended outcomes**, including reduced manual system-to-system searching and a path from investigation to controlled action; label these as expected value to validate, not measured results.
- [x] **Step 4: Review each competitor-strip capability claim** against the linked official source. Mention source-system actions only where that source explicitly documents them; otherwise limit the description to documented knowledge/search/orchestration/PLM overlap.
- [x] **Step 5: Add source notes** with the official vendor URLs from the approved design; do not state that the project's full cross-system engineering use case is absent from competitors.

### Task 3: Final Slide-Copy Review

**Files:**
- Review: `docs/superpowers/deliverables/2026-11-13-enterprise-orchestration-slide-content.md`
- Compare: `docs/superpowers/specs/2026-11-13-enterprise-orchestration-slide-content-design.md`

**Interfaces:**
- Consumes: both completed slide-copy sections.
- Produces: final concise copy with no unsupported availability, cost, training, or exclusivity claims.

- [x] **Step 1: Check Slide 5** for the pending sourcing/budget status and visible 250 GB/2 TB discrepancy.
- [x] **Step 2: Check the market slide** for a visible future-capability label, human review/approval before write-back, and supported competitor descriptions.
- [x] **Step 3: Confirm the two-slide scope**: Slide 5 remains a deployment-resource slide; the market-value content is a separate slide; no PowerPoint deck is edited.
