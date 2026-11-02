# Lattice Query-Aware Relationship Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve answer quality by retrieving canonical relationships that match the user's question and traversal direction before context reaches the model.

**Architecture:** Keep retrieval deterministic and inside the existing Copilot context builder. Resolve the current focal entity, classify only explicit traversal-direction cues, traverse canonical relationships in that direction when clear, and otherwise preserve bidirectional connected-path retrieval. Rank eligible relationships using the query, endpoint names/source/native IDs, and relationship kind/family; retain existing endpoint/evidence pairing, citations, limits, and authoritative semantic guidance.

**Tech Stack:** Existing TypeScript, Next.js server-side Copilot context builder, canonical engineering-intelligence graph contracts.

**Spec:** [2026-10-29-lattice-query-aware-relationship-retrieval-design.md](../specs/2026-10-29-lattice-query-aware-relationship-retrieval-design.md)

## Global Constraints

- “Change only context retrieval in the Copilot server implementation.”
- “Do not change the UI, API contracts, model prompt, provider configuration, persistence, or answer schema. Do not add placeholders.”
- “For ambiguous questions, preserve bidirectional connected-path retrieval.”
- “Preserve endpoint and evidence inclusion together, existing item/character limits, citations, authoritative relationship guidance, and uncertainty.”
- Per the user's explicit request, do not run tests, builds, review, or validation.

## Review Focus

The following behavior is not to be tested or validated in this task, at the user's request:

- Explicit downstream/impact wording should traverse canonical source-to-target edges.
- Explicit upstream wording should traverse target-to-source while preserving canonical edge fields.
- Ambiguous/neutral wording should preserve bidirectional connected paths.
- System names, entity display names, native IDs, and relationship kinds/families should affect relevance ranking without inventing relationships.
- Context trimming should continue keeping selected relationship endpoints and supporting evidence together.

---

### Task 1: Make relationship retrieval query-aware

**Files:**
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts` — relationship direction classification, endpoint-aware relevance scoring, and focal-entity traversal.

**Interfaces:**
- Consumes: `RelationshipLike`, `CopilotEntityContext`, existing `relevance()` and `containsExactIdentifier()` helpers, and the user question.
- Produces: the existing ordered relationship candidates with canonical edge direction and existing context packet shape; no API or contract changes.

- [ ] **Step 1: Implement deterministic traversal direction selection**

Add a local direction type and helper in `context-builder.ts` that returns `"forward"`, `"reverse"`, or `"either"` from explicit question wording. Classify clear downstream/impact/consequence phrasing as forward, clear upstream/“what affects this” phrasing as reverse, and all other wording as either. Resolve collisions or uncertain wording to `"either"`.

- [ ] **Step 2: Score relationship candidates using query-visible endpoint information**

When building `scoredRelationships`, include each relation's ID, kind/type, family, source and target entity IDs, and the corresponding endpoints' display names, source applications, native IDs, and properties in its relevance inputs. Keep scoring deterministic and preserve the stable relationship-ID tie-break.

- [ ] **Step 3: Apply directed eligibility during focal graph traversal**

Update `orderRelationshipsFromFocus` to accept the selected direction. For `"forward"`, traverse a relationship only when the current entity equals `sourceEntityId`; for `"reverse"`, only when it equals `targetEntityId`; for `"either"`, retain traversal from either endpoint. Keep each returned `RelationshipLike` unchanged so context and citations retain the canonical relationship direction.

- [ ] **Step 4: Wire direction and ranking into context assembly**

Pass the question-derived direction to the focal traversal, and preserve the existing focus resolution, relationship-guidance selection, endpoint/evidence co-selection, omission counts, context trimming, and uncertainty behavior.

- [ ] **Step 5: Stop without running verification commands**

Do not run tests, builds, linters, browser checks, reviews, or validation commands, as explicitly requested. Report that verification was intentionally not performed.
