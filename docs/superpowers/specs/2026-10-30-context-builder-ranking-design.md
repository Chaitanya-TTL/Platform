# Context-builder ranking design

## Intent

Improve benchmark E1 answer quality by making summary entity and relationship
selection business-aware. Engineering entities and relationships must outrank
metadata nodes when both are present.

## Goals

- Remove identifier-only filtering for summary questions.
- Select the highest-ranked business entities for summary context.
- Weight entity importance toward engineering significance.
- Rank major relationships by engineering meaning before graph metadata.
- Keep metadata entities and relationships available as fallback when no better
  business candidates exist.
- Limit the change to `context-builder.ts`.

## Non-goals

- No ontology, knowledge-graph, PLM Brain, extraction, enrichment, impact-path,
  prompt, or UI changes.
- No change to relationship generation or evidence semantics.

## Approach

Use the approved surgical ranking fix:

- Add `businessWeight` for entity kinds and names.
- Add `relationshipBusinessWeight` for relationship kinds and families.
- Apply business significance as the dominant factor in entity importance.
- Remove summary-specific identifier filtering and select the top three ranked
  business entities.
- Filter/deprioritize obvious metadata entities when constructing the
  engineering brief, while retaining them as fallback candidates.
- Sort major relationships by business weight, then cross-application status,
  relationship status, strength, and evidence.

## Validation

Add focused regression coverage for a summary investigation containing
requirements, parts, materials, configurations, and metadata nodes. Verify that
the selected entities and major relationships prioritize engineering content.
Run the focused test and the frontend build if the environment permits.
