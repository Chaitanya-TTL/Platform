# Lattice RAG Phase 2 boundaries

Phase 2 is a provider-neutral, fixture-backed retrieval slice. It demonstrates contracts, metadata-only candidate search, fail-closed authorization, ranking, deduplication, deterministic citations, budgeting, diagnostics, and local evaluation. It does not retrieve real enterprise documents or connect to a production index.

## Graph authority and retrieved evidence

The canonical investigation subject, subject-traceability graph, ontology-resolved relationships, reasoning package, engineering brief, consequence evidence state, impact paths/chains, and existing answer validation remain authoritative and unchanged. Retrieved documents are separate supporting evidence with their own source, revision, access decision, and provenance.

Similarity, lexical overlap, shared subject IDs, or shared entity IDs are ranking signals only. They must never create canonical identities, engineering relationships, subject-traceability edges, impact paths, impact chains, or consequence evidence. Conflicts preserve both provenances; retrieved text does not override graph authority.

## Frozen intent boundary

Retrieval is not wired into the production investigation-to-provider flow in this phase. M1, M2, and E1 remain retrieval-disabled; their context packets, provider payloads, citations, and M2 consequence evidence state are covered by parity regressions. M2 consequence validation and repair are not extended to accept retrieved evidence.

## Citation namespace

Fixture retrieval evidence uses the deterministic, revision- and chunk-sensitive form:

```text
cite:retrieval-document:v1:<encoded-documentId>:<encoded-revision>:<encoded-chunkId>
```

Each component is encoded independently. Retrieval citations remain distinct from entity, relationship, finding, source, evaluation, and evidence citations.

## Access boundary

Fixture retrieval returns candidate metadata and scores without chunk text. A fail-closed access-policy port checks principal identity, tenant, policy version, ACL scope, and application entitlement before the retrieval service asks the index to load text. Only authorized chunk IDs may be passed to text loading or used to build retrieval evidence.

The policy implementation in tests is **not production RBAC**. Repository discovery did not identify an application-level authenticated principal or investigation/document authorization source. No client-supplied principal is trusted as an authorization input.

## Production blockers before real ingestion

Resolve and verify all of the following before indexing or retrieving real source content:

- The authenticating identity source, trusted server-side principal, tenant model, and investigation authorization rules.
- Principal/group/application entitlement claims and source-document ACL mapping, including revocation and stale-policy behavior.
- Deployment topology, shared durable storage, regional/data-residency requirements, encryption, retention, backup, and audit access.
- Source owners' permission to extract, retain, chunk, search, embed, and disclose each document class to the selected model service.
- Supported document formats, attachment access, text extraction/OCR, language handling, content hashing, and revision/lifecycle/deletion semantics.
- Measured corpus quality, latency, throughput, and cost requirements before selecting embeddings, vector/lexical infrastructure, or reranking services.

No production vector database, embedding provider, external retrieval dependency, real enterprise document, or provider call is part of this phase.

## Phase 3A relationship

Phase 2 remains frozen as the provider-neutral retrieval foundation. A separate Phase 3A slice exercises prompt integration only for explicit document intent using a test-injected fixture runtime and mocked provider. It does not activate production retrieval or change the graph-only behavior of M1, M2, E1, or other non-document intents. See [RAG-PHASE-3A-BOUNDARIES.md](./RAG-PHASE-3A-BOUNDARIES.md) for the turn-level fallback and integration boundary.
