# Lattice query-aware relationship retrieval

## Intent

Improve engineering answer quality by selecting investigation relationships
that match the user's question rather than treating every edge in the focal
entity's connected component as equally eligible. The current context builder
has entity scoring and graph walking, but its graph walk is undirected and its
relationship score omits endpoint names and source applications.

## Goals and non-goals

- Make retrieval question-aware using the identified focal entity, canonical
  relationship direction, endpoint source applications/names, and relationship
  kind/family.
- For clearly downstream/impact questions, prefer forward edges; for clearly
  upstream questions, prefer reverse traversal; keep canonical edge endpoints
  unchanged in the context. For ambiguous questions, preserve bidirectional
  connected-path retrieval.
- Preserve endpoint and evidence inclusion together, existing item/character
  limits, citations, authoritative relationship guidance, and uncertainty.
- Change only context retrieval in the Copilot server implementation.
- Do not change the UI, API contracts, model prompt, provider configuration,
  persistence, or answer schema. Do not add placeholders.
- At the user's request, do not run tests, builds, review, or validation.

## Approaches

- **Query-aware relationship retrieval (selected):** use question direction and
  endpoint/relationship relevance when traversing canonical relationships from
  the focal entity. This fixes direction mismatch and irrelevant connected
  paths before the model sees the context.
- **Broader multi-hop expansion:** add more connected edges using the current
  lexical anchor and undirected traversal. This increases graph coverage but
  does not resolve the observed direction mismatch or irrelevant-path noise.

The user selected query-aware retrieval as the highest-impact improvement.
Implementation details such as exact deterministic direction cues are left to
the builder; ambiguous wording must retain a bidirectional fallback rather than
silently excluding relevant relationships.
