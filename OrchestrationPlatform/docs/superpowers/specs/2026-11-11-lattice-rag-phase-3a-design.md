# Lattice RAG Phase 3A Design

## Intent

Exercise the approved fixture-backed retrieval slice through the existing Copilot turn pipeline for explicit document questions. This demonstrates that authorized retrieved-document evidence can supplement the authoritative investigation graph without making frozen benchmark behavior or production integrations depend on RAG.

## Goals

- Add a `document` intent without changing existing intent classifications.
- Invoke retrieval only when the built context classifies the request as exactly `document` and a test-injected retrieval runtime explicitly enables it.
- Keep `CopilotContextPacket` authoritative and graph-only.
- Add a separate, clearly labeled retrieved-document section to the provider payload only after authorization, allowed-ID text loading, and budget allocation all succeed.
- Validate retrieval citations against only the budgeted, active `RetrievalEvidence` set.
- Persist sanitized retrieval outcomes separately from the investigation packet and conversation answer.
- Exercise the existing provider, answer repair, validation, conversation persistence, stage journaling, usage ledger, and error mapping with a mocked provider.
- Prove exact no-retrieval behavior for M1, M2, E1, and all existing non-document intents.

## Non-goals

- Production identity/RBAC, environment/config activation, request-body activation, or caller-provided principal data.
- Real enterprise document ingestion, embeddings, vector infrastructure, external retrieval dependencies, or live provider calls.
- Changes to graph entities, relationships, paths, chains, canonical identity, ontology authority, or `consequenceEvidenceState`.
- A separate document-turn executor or changes to the conversation answer schema.

## Approaches

1. **Existing executor with a test-injected retrieval runtime — selected.** Reuse `executeCopilotTurn` and its provider, repair, validation, persistence, journaling, and usage behavior. Inject the feature flag, fixture principal, fixture index/policy, and diagnostics store only from server-side tests; production construction supplies no retrieval runtime. This avoids duplicated turn semantics and prevents request-controlled authorization.
2. **Separate document-turn executor — not selected.** This isolates the experiment but duplicates provider orchestration, repair, validation, persistence, and error mapping, increasing the risk that document answers diverge from the established path.

Within the selected approach, keep the context packet graph-only and pass retrieved evidence as a separate optional prompt-construction input. Adding retrieval fields to the packet would weaken its role as the authoritative investigation snapshot.

## Decisions and constraints

- Classify existing intents with their current precedence first. Add document classification only as a final eligible classification so terms such as “impact,” “consequence,” “relationship,” and “evidence” retain their existing classifications. M2 must not become a document request.
- The production `executeCopilotTurn` default has no retrieval runtime and no environment/configuration switch. No HTTP body or query field can enable retrieval or set principal, tenant, group, entitlement, policy, or ACL values.
- A document-intent turn without an injected runtime records `retrieval-dependency-unavailable` and proceeds with the existing graph-only provider payload. A disabled injected runtime records `retrieval-disabled`.
- On principal absence, access denial, or retrieval error, record a sanitized outcome and proceed graph-only. Never pass partial evidence, excerpts, denied metadata, or retrieval citations into provider input or validation. Do not retry retrieval or call the provider a second time.
- Record each document-turn retrieval outcome as a dedicated, request-correlated turn-stage journal record with a stable reason code and sanitized aggregate fields only. On successful fixture retrieval, persist the existing sanitized retrieval diagnostics separately through the injected diagnostics store. Neither record is added to the packet, provider response, or conversation answer.
- If document retrieval succeeds, use the existing retrieval sequence: metadata-only lexical/semantic search, ranking/filtering, authorization, allowed-ID-only text loading, evidence creation, then budget allocation. Only budget-retained evidence is eligible for prompt serialization and retrieval citation validation.
- Candidate-level ACL denials remain filtered as in Phase 2; only allowed IDs can be loaded. Treat a failed/inconsistent authorization decision, or no authorized results when matching candidates existed, as an overall `retrieval-access-denied` fallback. Never include partial results after an overall unavailable, denied, or failed outcome.
- If all retrieved evidence is omitted by budgeting, use the existing graph-only payload unchanged.
- The existing low-graph-confidence short-circuit remains unchanged unless intent is exactly `document` and at least one authorized `RetrievalEvidence` survives budgeting. That narrow case may continue through the existing provider flow. Keep low graph confidence visible as uncertainty; retrieved evidence supports document-content claims only and cannot support graph, identity, relationship, path, chain, or consequence claims.
- For document turns with disabled, unavailable, denied, failed, or fully budget-omitted retrieval, preserve the existing insufficient-evidence short-circuit when graph confidence is below threshold. Do not call the provider merely because retrieval ran.
- Graph context remains first and protected. Use the existing allocator and 24,000-character hard limit, reserve and retrieval/primer caps; retrieval may not trim graph context. Phase 3A need not add an application primer unless an existing primer source is identified and useful.
- Store a versioned, sanitized retrieval outcome by request ID separately from investigation snapshots and conversation messages. Stable outcome reason codes: `retrieval-disabled`, `retrieval-dependency-unavailable`, `retrieval-principal-unavailable`, `retrieval-access-denied`, and `retrieval-failed`. Do not persist text, excerpts, private URLs, credentials, access tokens, raw ACL lists, or denied candidate metadata in this outcome record.
- Validation knows graph citation IDs from the existing context and retrieval citation IDs only from the active budget-retained evidence. Fallback turns use an empty allowed retrieval-citation set. Retrieval-only citations cannot substantiate graph identity, relationship, traceability, impact, path, chain, or consequence claims; such claims must have authoritative graph citations and remain subject to existing validation.
- Keep the existing answer/citation object shape. Extend `CopilotCitationKind` only with `"retrieval-document"` and map the active budget-retained evidence to these citation records when validating and persisting an answer. Do not add citations for evidence omitted by budgeting or for any fallback outcome.
- No production retrieval runtime is constructed; fixture runtime and mocked provider are test-only.

## Current implementation seams

- `frontend/features/lattice-next/copilot/context-builder.ts`: `classifyQuestion`, `buildInvestigationContext`, and `engineeringPromptPayload`. The prompt builder currently serializes the graph packet; it will gain a separate optional retrieval-section input that adds output only when nonempty.
- `frontend/features/lattice-next/copilot/contracts.ts`: `CopilotContextPacket.questionIntent` currently enumerates frozen intent values. It may add `"document"`; `CopilotCitationKind` may add `"retrieval-document"`. No retrieval data or citation is added to the packet.
- `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`: `executeCopilotTurn` and internal turn stages own graph construction, provider invocation, answer repair, validation, persistence, stage journal, and error mapping. The optional runtime is server-side dependency injection, absent by default.
- `frontend/features/lattice-next/copilot/answer-validator.ts`: `validateCopilotAnswer` derives known citations from context packet citations. It will accept a separate optional active retrieval-citation mapping, validate only those IDs, return matching retrieval citation records in the existing answer shape, and reject retrieval-only support for graph-authority claims without extending M2 consequence authorization.
- `frontend/features/lattice-next/copilot/retrieval/`: Phase 2 already provides contracts, `buildRetrievalQuery`, `retrieveEvidence`, `allocateRetrievalBudget`, fixture index, fixture policy, and deterministic test evidence.
- `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`: request body is allowlisted; it must remain free of retrieval enablement and principal fields.

## Intended flow

1. Load and validate the investigation snapshot; build authoritative graph context.
2. If intent is not `document`, follow the current path unchanged with zero retrieval calls.
3. If intent is `document`, consult only the server-side injected test runtime. If absent or disabled, persist the corresponding sanitized outcome in the turn-stage journal and retain graph-only payload.
4. Require the fixture principal; missing principal records `retrieval-principal-unavailable` without text loading.
5. Build the retrieval query from the question and authoritative graph context; retrieve metadata candidates, authorize them, and load only authorized candidate IDs.
6. Create `RetrievalEvidence`, allocate budget against protected graph context, and select only budget-retained evidence.
7. On success with nonempty retained evidence, pass a clearly labeled retrieval section to prompt construction and its citation IDs to answer validation. Only this exact document-intent case may proceed past the existing low-graph-confidence short-circuit; preserve graph-confidence uncertainty. Otherwise pass neither and keep the existing short-circuit behavior.
8. Use the existing single provider call, repair, validation, conversation persistence, and usage ledger. Add a request-correlated retrieval outcome record to the stage journal; do not alter existing stages for non-document turns.
9. On successful retrieval, persist sanitized detailed retrieval diagnostics through the injected diagnostics store. Retrieval failure does not trigger retries or a second provider call.

## Validation plan

- Focused intent tests: document questions classify as `document`; M1/M2/E1 and every existing intent retain exact classifications, including mixed document/impact wording.
- Retrieval orchestration tests: exact authorization-before-text ordering; principal absence and denial prevent loading; injected failures record stable sanitized reason codes; no internal details or denied candidate information reaches provider or returned turn data.
- Prompt and validation tests: `CopilotContextPacket` remains graph-only; only budget-retained evidence appears in a separate labeled payload section; only those citations validate and can be persisted in the existing citation shape; retrieval-only citations cannot substantiate graph-authority claims; fallback has an empty retrieval allowlist; fully budget-omitted evidence yields the byte-identical graph-only payload.
- End-to-end mocked turn tests: successful document retrieval, no injected dependency, disabled runtime, missing principal, access denial, retrieval failure, and budget omission. Assert a single provider call for graph-only fallback when graph confidence permits it, zero partial retrieval evidence/citations on fallback, and separately persisted sanitized outcomes.
- Insufficient-evidence behavior tests: (1) low graph confidence plus retained authorized document evidence gives one provider call; (2) low confidence plus no retained evidence preserves the existing insufficient-evidence answer and makes zero provider calls; (3) unauthorized evidence is never loaded or leaked and preserves insufficiency; (4) M1/M2/E1 preserve existing short-circuit/provider behavior.
- Request-boundary tests: environment variables and client request fields cannot enable retrieval or supply principal scope.
- Byte-for-byte parity tests for M1, M2, E1 and all pre-existing non-document intents, covering packet serialization and projected provider payload.
- Run the new focused tests, existing retrieval tests, protected graph/answer-validator regressions, focused M2 execute-turn validation, changed-file ESLint, and `git diff --check`. No live provider request.

## Implementation calls

- Keep `executeCopilotTurn(command)` as the unchanged production entry point. Factor an internal executor that accepts optional test-only retrieval dependencies; tests may call that internal seam, while API routes and production callers cannot supply it.
- Use the existing turn-stage journal as the separate persistence mechanism for sanitized outcome codes, including the production default's dependency-unavailable outcome. Extend its record with retrieval-only fields and a `retrieval-completed` stage; existing non-document turns do not emit this stage.
- Use the Phase 2 `RetrievalDiagnosticsStore` port, injected only by fixture tests, to persist detailed successful retrieval diagnostics. Do not create a new production retrieval persistence backend.
- Define document intent with explicit document/specification/requirements/manual cues only after all existing intent checks; specific change-analysis, evidence, relationship, and impact questions keep their current classifications.
- Count the serialized graph payload and retrieval-section envelope as protected budget characters before calling the existing allocator; add only its retained evidence afterward and assert the resulting serialized payload remains within 24,000 characters.
- Only a nonempty, budget-retained authorized document evidence set bypasses the existing below-threshold graph-only short-circuit. Other intents and all retrieval fallback outcomes retain the existing behavior.
- Mixed candidate-level allow/deny results may use authorized evidence only; an overall authorization failure or empty authorized result is graph-only fallback. This preserves Phase 2's required behavior of excluding an unauthorized best lexical match while allowing a lower-ranked authorized match.
