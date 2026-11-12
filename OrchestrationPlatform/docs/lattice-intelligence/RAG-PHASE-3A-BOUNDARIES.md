# Lattice RAG Phase 3A boundaries

Phase 3A is a controlled, fixture-backed integration of document retrieval into the existing Copilot turn executor. It demonstrates the prompt, authorization, citation, diagnostics, and fallback boundaries; it does not make live Lattice answers use production RAG.

## Graph authority and retrieval evidence

The investigation snapshot remains authoritative for canonical subjects and identities, subject traceability, ontology-resolved relationships, reasoning, engineering briefs, consequence evidence state, impact paths and chains, and answer validation. Retrieved evidence is a separate optional document-content source. Similarity and shared subjects or entities are ranking signals only; they never create or modify graph relationships or consequences. When document text conflicts with graph authority, both provenances remain distinguishable and the graph remains authoritative.

Only exact `document` intent can enter the retrieval branch. M1, M2, E1, and all other non-document intents remain retrieval-disabled. `CopilotContextPacket` stays graph-only; the provider receives a separate retrieved-document section only when retrieval completes, authorization succeeds, and evidence survives the context budget.

## Fail-closed turn behavior

The production retrieval runtime is unavailable by default. Only tests can inject an enabled fixture runtime and test principal; request-body fields and environment values cannot enable retrieval or supply principal scope. Candidate metadata is authorized before text loading, and only allowed chunk IDs may be passed to text loading.

Unavailable, missing-principal, denied, failed, or fully budget-omitted retrieval uses the authoritative graph-only payload. No partial retrieval evidence, excerpt, or retrieval citation is included in that fallback turn. Retrieval citation validation receives an empty active retrieval-citation set. Retrieval is not retried, and the provider is not called a second time. Existing graph-confidence and insufficient-evidence behavior remains in effect.

Stable journal outcome reason codes are:

- `retrieval-disabled`
- `retrieval-dependency-unavailable`
- `retrieval-principal-unavailable`
- `retrieval-access-denied`
- `retrieval-failed`
- `retrieval-no-evidence`
- `retrieval-budget-omitted`
- `retrieval-succeeded`

Journal and retrieval diagnostics are sanitized. They may record reason codes, aggregate counts, score components, selected identifiers, and omission reasons, but not chunk text, excerpts, private source URLs, credentials, access tokens, raw ACL memberships, or denied candidate metadata. Internal failure details and denied metadata are not sent to the provider or returned to the UI.

## Citation namespace

Retrieved document citations use the deterministic, revision- and chunk-sensitive namespace:

```text
cite:retrieval-document:v1:<encoded-documentId>:<encoded-revision>:<encoded-chunkId>
```

Components are encoded independently. Only citations corresponding to authorized, budget-retained evidence are active during validation and eligible to be persisted with a successful answer. Retrieval citations cannot substantiate graph-authority claims.

## Production blockers

This phase does not identify or implement production identity/RBAC. Real ingestion remains blocked until the following are resolved and verified:

- Trusted server-side principal and tenant derivation, investigation authorization, and applicable source ACL semantics.
- Mapping of users/groups and source-document ACLs, including policy-version handling, revocation, and stale-access behavior.
- Document ownership and permission to extract, retain, search, and disclose each content class to the model service.
- Durable index and diagnostics storage, deployment topology, encryption, residency, retention, backup, and audit requirements.
- Source-specific extraction, revision/lifecycle/deletion, and content-hash behavior.
- Measured corpus, latency, throughput, and cost constraints before selecting production lexical/vector infrastructure or embedding and reranking services.

No real enterprise documents, production vector database, embedding provider, external retrieval dependency, or live provider request was used for this slice.
