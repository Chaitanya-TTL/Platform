# Lattice Investigation Copilot Implementation Plan

> **For agentic workers:** Execute task-by-task. Keep each task within its listed files, run its focused tests before moving on, and do not implement Stage 2 write-back.

**Goal:** Give engineers an investigation-scoped copilot that explains the current Lattice evidence, traces cross-system relationships, highlights evidence-backed gaps and possible impacts, and recommends next steps for the engineer to approve.

**Architecture:** Keep the persisted Lattice investigation as the authority. The browser sends an investigation ID, conversation ID, message, and expected snapshot revision to a same-origin server route. The server loads the canonical snapshot, builds a bounded evidence context, calls the configured Azure OpenAI deployment, validates and resolves citations, and persists the conversation separately from investigation events. Discovery lists saved investigations; reopen restores their current persisted snapshot and most recent conversation, while refresh is explicit and produces a new investigation revision.

**Tech Stack:** Existing Next.js 16.3 frontend / TypeScript / React 19; existing Lattice Investigation Kernel and file-backed server store; Azure OpenAI Chat Completions REST API using server-side `fetch`; Vitest.

**Spec:** This plan records the decisions agreed in the brainstorming conversation. There is no separate design document.

## Global Constraints

- Stage 1 is read-only: the copilot may explain, analyze, surface hypotheses, and recommend actions; it must not invoke source-system mutations or write-back tools.
- Investigation facts come only from the requested investigation's persisted canonical snapshot and its evidence. Chat history is conversational context, not an authoritative fact source.
- Every factual answer and recommendation must cite entity/evidence IDs from the active snapshot, with snapshot revision recorded; unsupported claims must be labeled as hypotheses or stated as unknown.
- Reopening never refreshes source systems implicitly. Refresh is an explicit engineer action and creates a newer snapshot revision.
- Closing archives the investigation without deleting its snapshot, events, evidence, or copilot threads. Reopening restores the same investigation and resumes its latest thread; the engineer can start another thread explicitly.
- Azure credentials stay server-side. Do not put the API key in client bundles, URLs, telemetry, logs, persisted investigation data, or the skill/plan files.
- Use the existing Azure deployment `gpt-4o-mini`; configure endpoint, deployment, API version, and API key through server environment settings. The supplied endpoint URL uses `api-version=2025-01-01-preview`, while the accompanying configuration says `2024-12-01-preview`; verify which version is enabled and set one explicit value before the first live call.
- No model fine-tuning in Stage 1. Use a versioned system policy, structured investigation context, citation validation, and an evaluation set. Reassess fine-tuning only if measured failures show prompting/retrieval are insufficient.
- The current file-backed investigation store is suitable for the present single-instance setup only. Multi-user or horizontally scaled production requires shared durable storage and investigation authorization before enabling the copilot outside a trusted internal environment.

## Review Focus

1. Cross-investigation leakage: requests for one investigation must never load another investigation's snapshot or transcript.
2. Unsupported answers: citations must resolve to the exact active snapshot revision; model-invented IDs must be rejected or returned as uncited uncertainty.
3. Partial or stale source data: unavailable, failed, stale, or conflicting inputs must remain visible; refresh must not erase the last usable snapshot on failure.
4. Large investigations: context construction must be deterministic and bounded, and any omitted evidence must be disclosed rather than silently treated as absent.
5. Secret and operational safety: API keys must not reach the browser, logs, telemetry, or persisted records; no Stage 1 route may mutate Windchill, SAP, Configit, Teamcenter, or Codebeamer.

## Engineer Journey

1. In Discovery, the engineer sees recent investigations with subject, saved time, source coverage, revision, and a freshness indication; they can reopen one or start a new search.
2. Reopening restores the saved lattice without querying connected systems and offers the last copilot conversation, a new conversation, or an explicit refresh.
3. The copilot panel gives a concise investigation orientation: what sources and records are present, key confirmed relationships, missing/partial evidence, and useful questions to investigate. Deterministic cues can proactively flag observable conditions such as incomplete source coverage, unresolved approved relationships, changed values after refresh, or conflicting evidence; they must not claim an impact that the evidence does not establish.
4. The engineer asks a question. The copilot answers from the active snapshot, links claims to source records/evidence, marks uncertainty, and may suggest next investigative steps.
5. The engineer can accept, dismiss, or discuss recommendations, but the copilot does not execute them against enterprise systems.
6. Explicit refresh re-runs the selected sources through the existing investigation workflow. The prior snapshot remains available while refresh is running; completion publishes a new revision and the copilot identifies changed, added, removed, and unavailable data.
7. Closing archives the investigation and preserves its threads. Reopening resumes the last thread by default against the latest saved revision, with revision boundaries visible in the transcript.

## File Map

| File | Responsibility |
|---|---|
| `frontend/features/lattice-next/kernel/ports/investigation-repository.ts` | Add durable listing and archive metadata operations to the investigation repository contract. |
| `frontend/features/lattice-next/kernel/server/file-investigation-store.ts` | Enumerate only valid investigation directories and persist archive metadata using the existing atomic-file pattern. |
| `frontend/features/lattice-next/kernel/contracts/investigation-snapshot.ts` | Add optional archive metadata without overloading processing lifecycle. |
| `frontend/features/lattice-next/kernel/contracts/investigation-command.ts` | Define archive and restore commands. |
| `frontend/features/lattice-next/kernel/contracts/investigation-event.ts` | Define archive and restore events for durable audit history. |
| `frontend/features/lattice-next/kernel/application/investigation-command-handler.ts` | Validate and emit archive/restore events. |
| `frontend/features/lattice-next/kernel/application/investigation-event-reducer.ts` | Apply archive/restore metadata transitions. |
| `frontend/app/api/lattice/investigations/route.ts` | Add a bounded recent-investigation list endpoint; retain existing create behavior. |
| `frontend/app/api/lattice/investigations/[investigationId]/route.ts` | Add archive/restore operations while retaining load and command dispatch. |
| `frontend/features/lattice-next/kernel/infrastructure/http-investigation-authority.ts` | Add typed client calls for listing and archive/restore. |
| `frontend/app/api/lattice/investigations/[investigationId]/refresh/route.ts` | Explicitly re-run the persisted selections through the existing refresh/source execution flow. |
| `frontend/features/lattice-next/kernel/server/copilot-conversation-store.ts` | Persist copilot conversations separately under the investigation data root. |
| `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts` | Load the active snapshot, resume/create a conversation, build context, call Azure, validate response, persist and return it. |
| `frontend/features/lattice-next/copilot/contracts.ts` | Define conversation, message, citation, recommendation, and request/response types. |
| `frontend/features/lattice-next/copilot/context-builder.ts` | Build a deterministic, bounded context packet from canonical entities, relationships, evidence, findings, source statuses, and snapshot revision. |
| `frontend/features/lattice-next/copilot/azure-openai-client.ts` | Server-only Azure OpenAI Chat Completions transport with timeout, bounded retries, typed errors, and redaction. |
| `frontend/features/lattice-next/copilot/answer-validator.ts` | Validate structured response shape and ensure every citation references the loaded snapshot. |
| `frontend/features/lattice-next/copilot/policy.ts` | Version the read-only copilot behavior and explicit factual/inference/recommendation rules. |
| `frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx` | Add recent active and archived investigations, captured-time/source-freshness labels, and reopen action. |
| `frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx` | Add explicit close/archive, resume-or-new-thread handoff, refresh control, and copilot panel entry point. |
| `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx` | Render thread, input, citations, uncertainty, recommendations, loading/error/retry states. |
| Focused tests beside the modules above | Prove persistence, isolation, evidence grounding, freshness, refresh, archive/reopen, and UI flows. |

Exact file names may adjust to current repository conventions during implementation, but ownership boundaries and behavior must stay as listed.

## Tasks

### Task 1: Durable investigation index and archive lifecycle

**Files:**
- Modify: `frontend/features/lattice-next/kernel/ports/investigation-repository.ts`
- Modify: `frontend/features/lattice-next/kernel/server/file-investigation-store.ts`
- Modify: `frontend/features/lattice-next/kernel/contracts/investigation-snapshot.ts`
- Modify: `frontend/features/lattice-next/kernel/contracts/investigation-command.ts`
- Modify: `frontend/features/lattice-next/kernel/contracts/investigation-event.ts`
- Modify: `frontend/features/lattice-next/kernel/application/investigation-command-handler.ts`
- Modify: `frontend/features/lattice-next/kernel/application/investigation-event-reducer.ts`
- Modify: `frontend/app/api/lattice/investigations/route.ts`
- Modify: `frontend/app/api/lattice/investigations/[investigationId]/route.ts`
- Modify: `frontend/features/lattice-next/kernel/infrastructure/http-investigation-authority.ts`
- Test: `frontend/features/lattice-next/kernel/testing/` repository/kernel tests

**Interfaces:**
- Add `InvestigationListItem` with `investigationId`, `subjectLabel`, `lifecycle`, `revision`, `createdAt`, `updatedAt`, optional `archivedAt`, per-source status, and captured/freshness summary.
- Add `InvestigationRepository.list(options)` returning bounded metadata summaries, not full canonical payloads.
- Add explicit `archive` and `restore` commands/events; keep archive state separate from operational lifecycle values such as `ready` and `refreshing`.
- Add `GET /api/lattice/investigations?includeArchived=false&limit=<bounded>` and archive/restore command handling on the item route.

- [ ] Add tests that create multiple persisted investigations, list them newest-first, and confirm archived items are excluded by default and included on request.
- [ ] Add tests that archive and restore one investigation while preserving its canonical snapshot, events, and revision.
- [ ] Add path validation tests proving listing ignores malformed directories and never reads outside the configured investigation root.
- [ ] Implement the repository, kernel events, and API/client methods; keep list payloads bounded and omit full evidence bodies.
- [ ] Run the focused kernel and API route tests.

### Task 2: Explicit refresh with revision and stale-data behavior

**Files:**
- Modify: `frontend/features/lattice-next/kernel/infrastructure/current-investigation-runtime.ts`
- Modify: `frontend/features/lattice-next/kernel/application/investigation-command-handler.ts`
- Modify: `frontend/features/lattice-next/kernel/application/investigation-event-reducer.ts`
- Create: `frontend/app/api/lattice/investigations/[investigationId]/refresh/route.ts`
- Reuse: `frontend/features/lattice-next/discovery/structure-resolver.ts` and source execution adapters
- Test: relevant kernel/source execution tests under `frontend/features/lattice-next/kernel/testing/`

**Interfaces:**
- Refresh accepts only an investigation ID and expected revision; source selections come from the persisted snapshot, never from an untrusted client replacement.
- Return `{ investigationId, previousRevision, revision, lifecycle, sourceStatuses, changedEntityIds, addedEntityIds, removedEntityIds }` when assembly completes.

- [ ] Test that refresh increments the execution epoch/revision and rejects stale results from a prior epoch.
- [ ] Test that reopening does not call source adapters and that refresh does.
- [ ] Test that source failure preserves last-known canonical values with explicit stale/failed source status; it must not publish an empty replacement snapshot.
- [ ] Test changed/added/removed summaries against previous and new canonical revisions.
- [ ] Implement explicit refresh by reusing the existing refresh command and source pipeline; keep the previous published canonical revision readable until a new complete or partial canonical snapshot is published.
- [ ] Run focused source execution, stale-result, and refresh tests.

### Task 3: Azure OpenAI server configuration and transport

**Files:**
- Create: `frontend/features/lattice-next/copilot/azure-openai-client.ts`
- Create: `frontend/features/lattice-next/copilot/config.ts`
- Create: `frontend/features/lattice-next/copilot/tests/azure-openai-client.test.ts`
- Modify only if needed: `frontend/.env.example` with blank variable names and no values

**Interfaces:**
- `getCopilotConfig(): CopilotConfigResult` validates server-only `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`.
- `completeCopilotTurn(request: AzureChatRequest): Promise<AzureChatResponse>` sends to `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={apiVersion}` using the Azure `api-key` header.

- [ ] Test missing/invalid settings, endpoint normalization, request body and headers using mocked `fetch`; assert the key is never returned in error text.
- [ ] Test timeout, non-2xx response, malformed JSON, and bounded retry behavior without network access.
- [ ] Resolve the supplied API-version mismatch (`2025-01-01-preview` in the target URL vs `2024-12-01-preview` in the configuration note) by verifying the deployed Azure resource supports the selected value; keep it an environment setting, never hardcode it.
- [ ] Implement the REST client with a server-only module boundary; do not add a client-visible `NEXT_PUBLIC_` credential or install an SDK unless the focused implementation proves `fetch` insufficient.
- [ ] Run Azure client unit tests and a no-secret static scan of client bundles/source references.

### Task 4: Bounded investigation context and citation contract

**Files:**
- Create: `frontend/features/lattice-next/copilot/contracts.ts`
- Create: `frontend/features/lattice-next/copilot/context-builder.ts`
- Create: `frontend/features/lattice-next/copilot/answer-validator.ts`
- Create: `frontend/features/lattice-next/copilot/policy.ts`
- Test: `frontend/features/lattice-next/copilot/tests/context-builder.test.ts`
- Test: `frontend/features/lattice-next/copilot/tests/answer-validator.test.ts`

**Interfaces:**
- `buildInvestigationContext(snapshot, userMessage, options): CopilotContextPacket` includes investigation ID, canonical revision, subject, source selection/status/freshness, relevant entities, universal and source relationships, findings, unresolved evaluations, evidence summaries, and stable citation IDs.
- `CopilotAnswer` contains `answer`, `claims[]` with `citationIds[]`, `recommendations[]` with rationale and `approvalRequired: true`, `uncertainties[]`, `followUpQuestions[]`, and `snapshotRevision`.
- Context-builder output is deterministic for the same snapshot revision and query; large snapshots are bounded and disclose which evidence categories were omitted.

- [ ] Test direct identifier questions resolve the selected entity and return the correct native ID citation.
- [ ] Test relationship traversal questions provide source and target endpoint citations, preserving each source-native value independently.
- [ ] Test no-evidence, partial-source, stale-source, conflicting-evidence, and unsupported-entity queries produce explicit uncertainty rather than fabricated claims.
- [ ] Test token/context-size bounds and deterministic evidence ordering for large investigations.
- [ ] Test response validation rejects malformed citations, nonexistent evidence IDs, and mismatched snapshot revisions.
- [ ] Implement the versioned system policy: investigation-only facts, citations for factual claims, hypothesis labels for analysis, recommendation-only actions, no tool calls or system mutations.
- [ ] Run the focused context and validation tests.

### Task 5: Persisted investigation-scoped copilot conversations

**Files:**
- Create: `frontend/features/lattice-next/kernel/ports/copilot-conversation-store.ts`
- Create: `frontend/features/lattice-next/kernel/server/file-copilot-conversation-store.ts`
- Create: `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`
- Create: `frontend/app/api/lattice/investigations/[investigationId]/copilot/threads/[threadId]/route.ts`
- Test: `frontend/features/lattice-next/kernel/server/tests/file-copilot-conversation-store.test.ts`
- Test: `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.test.ts`

**Interfaces:**
- `CopilotConversationStore.listThreads(investigationId)`, `loadThread(investigationId, threadId)`, `createThread(investigationId, threadId, title)`, and `appendTurn(investigationId, threadId, expectedThreadRevision, userMessage, assistantTurn)`.
- Persist each user/assistant turn with timestamp, investigation ID, thread ID, and snapshot revision. Store only validated answer/citation structures, not provider credentials or raw request headers.
- `POST /api/lattice/investigations/{id}/copilot` accepts `{ threadId?, expectedSnapshotRevision, message }`; absent `threadId` creates a new thread. GET returns thread summaries/messages for the selected investigation only.

- [ ] Test thread isolation across investigation IDs, resume of the latest thread, explicit new-thread creation, and optimistic-concurrency conflicts.
- [ ] Test archived investigations remain readable and their conversations are retained; reject chat writes to an archived investigation until it is reopened.
- [ ] Test message length, request body size, and per-request history bounds.
- [ ] Implement atomic file writes following `file-investigation-store.ts`; persist under a separate `copilot/` subtree so chat records do not mutate canonical investigation snapshots.
- [ ] Run store/API tests, including concurrent append behavior.

### Task 6: Copilot orchestration route and evidence-grounded response

**Files:**
- Modify: `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`
- Reuse: `frontend/features/lattice-next/kernel/server/server-kernel-runtime.ts`
- Reuse: `frontend/features/lattice-next/copilot/context-builder.ts`, `azure-openai-client.ts`, `answer-validator.ts`, and `policy.ts`
- Test: copilot route tests under `frontend/app/api/lattice/investigations/[investigationId]/copilot/`

- [ ] Test unknown investigation/thread returns 404 and mismatched snapshot revision returns 409 without calling Azure.
- [ ] Test Azure transport failure does not persist a fabricated assistant turn; user message can be safely retried with an idempotency key.
- [ ] Test assistant response citations are validated and resolved server-side to labels/native IDs before persistence and response.
- [ ] Test injection-like instructions inside source descriptions/attachments are treated as untrusted evidence, never as policy or tool instructions.
- [ ] Test there are no connected-system mutation tools/routes exposed from the copilot and that recommendations always require engineer approval.
- [ ] Implement route flow: validate request → load exact investigation/revision → load bounded thread history → build context packet → call Azure → validate and resolve citations → persist assistant turn → return structured response.
- [ ] Add safe timeouts, rate/size limits, request correlation IDs, redacted errors, and bounded retry only for transient provider failures.
- [ ] Run route integration tests with mocked Azure fetch; then run one manually authorized, low-cost smoke request only after deployment settings are configured.

### Task 7: Discovery recent/archived investigations and explicit resume/refresh

**Files:**
- Modify: `frontend/features/lattice-next/discovery/DiscoveryWorkspace.tsx`
- Create: `frontend/features/lattice-next/discovery/RecentInvestigations.tsx`
- Modify: `frontend/features/lattice-next/kernel/infrastructure/http-investigation-authority.ts`
- Modify: `frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx`
- Test: `frontend/features/lattice-next/tests/recent-investigations.test.tsx`
- Test: `frontend/features/lattice-next/tests/investigation-reopen-refresh.test.tsx`

- [ ] Test Discovery lists durable investigations with subject, saved/updated timestamp, revision, source status, archive state, and freshness captured from snapshot source temporal metadata.
- [ ] Test reopen uses the existing `?investigation=<id>` restore path, does not search or contact source adapters, and opens the saved canonical snapshot.
- [ ] Test archive removes an investigation from the default active list without deleting its snapshot or copilot threads; archived filter exposes it for restore.
- [ ] Test explicit refresh shows the prior snapshot while in progress, then shows the new revision and changed/added/removed summary after completion.
- [ ] Implement the recent/archived list in Discovery and the distinct actions `Open`, `Refresh`, and `Close/Archive`; display “Captured … ago” and source-reported stale/unknown indicators, never infer freshness from chat timestamps.
- [ ] Run focused Discovery and workspace interaction tests.

### Task 8: Investigation copilot panel and resume/new-thread workflow

**Files:**
- Create: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Modify: `frontend/features/lattice-next/workspace/LatticeNextWorkspace.tsx`
- Create: `frontend/features/lattice-next/copilot/client.ts`
- Test: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`

- [ ] Test loading, empty, streaming/non-streaming completion, provider error/retry, stale revision, no evidence, citation navigation, and archived read-only states.
- [ ] Test reopening selects the last thread by default, while “New conversation” starts a separate thread using the same current snapshot.
- [ ] Test citations focus/select the relevant existing node or relationship without adding extra graph nodes or changing investigation data.
- [ ] Implement a dockable side panel consistent with Lattice’s current workspace/inspector patterns; include conversation history, answer, citations, uncertainty, recommendations, and an explicit “not executed” boundary.
- [ ] Show deterministic, dismissible review cues from snapshot facts on open and after refresh; clicking a cue asks the copilot to explain it using the same evidence-grounded route. Do not trigger automatic LLM calls or present unsupported impact predictions as facts.
- [ ] Keep free-form investigation analysis on demand and apply the same evidence, context, and cost limits as chat.
- [ ] Run focused component tests and the relevant Lattice workspace tests.

### Task 9: Evaluation, privacy, and release gates

**Files:**
- Create: `frontend/features/lattice-next/copilot/evals/` fixtures with synthetic/redacted investigation snapshots and expected citation behaviors
- Modify: relevant API security and Lattice test suites only as required
- Document: environment variable names and local setup in the existing developer configuration documentation

- [ ] Create evaluation cases for native-ID lookup, cross-source relationship traversal, change explanation, partial evidence, conflicting values, unsupported questions, cross-investigation isolation, prompt injection inside evidence, and oversized context.
- [ ] Test deterministic review cues for incomplete source coverage, unresolved relationships, refreshed value changes, and conflicting evidence; verify they are suppressed when the corresponding signal is absent.
- [ ] Require factual claims to have at least one valid citation; score citation precision, unsupported-claim rate, correct uncertainty, investigation isolation, latency, and token/cost budget.
- [ ] Add a deployment gate: before shared or multi-user production use, establish authentication/authorization and replace process-local file storage with a shared store; do not expose an unauthenticated Azure-backed route publicly.
- [ ] Verify environment/API-version configuration and ensure secret scanning/build output finds no Azure key in client assets, source control, logs, or persisted chat data.
- [ ] Record baseline behavior against gpt-4o-mini deployment using synthetic/redacted data; no real customer or credential data in eval prompts.
- [ ] Run focused suites, frontend typecheck/build, security scan, and the full required evaluation set; report pass/fail/skip counts and any launch blockers.

## Acceptance Criteria

- An engineer can find, reopen, archive, and restore saved investigations in Discovery.
- Reopening restores the exact saved snapshot without silently contacting source systems and presents captured-time/freshness information.
- Refresh is explicit, advances revision, preserves the last successful snapshot through failures, and makes source changes inspectable.
- Each investigation can resume its own last copilot thread or create a new thread against the same investigation; records never cross investigation IDs.
- The copilot answers questions about the active item/session using the saved canonical graph, relationships, findings, provenance, and evidence.
- Factual claims link to valid snapshot entities/evidence; hypotheses and recommendations are visibly labeled and disclose evidence gaps/conflicts.
- The copilot cannot execute or initiate source-system changes in Stage 1.
- Azure credentials are server-only; API version is explicitly configured and verified against the deployment.
- The feature has bounded context/message sizes, useful error states, and documented internal deployment/auth prerequisites.

## Stage Boundary

Stage 1 ends at evidence-cited explanations, impact analysis, gap detection, and recommendations for engineer approval. Stage 2, planned separately after Stage 1 is validated, may add approved write-back actions with per-action authorization, confirmation, audit trail, idempotency, and compensating/recovery behavior.