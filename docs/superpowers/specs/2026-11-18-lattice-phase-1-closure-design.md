# Lattice Phase 1 Closure Design

## Intent

Close the existing .NET AI Runtime as a narrow Engineering Impact Answer capability, without repeating its foundation work or claiming capabilities that have not been proven. The closure must determine what works in the current repository, strengthen safe runtime behavior in small independently verifiable slices, and state clearly whether authorization, product integration, live behavior, and measured product value remain blocked.

The user-facing target remains: “What is impacted if Requirement R-123 changes?” PLM Brain continues to be authoritative for entities, relationships, impact paths/chains, and evidence.

## Baseline and Current Findings

Baseline repository commit: `98186f0672a44800a19c88936bdb2d37127c221d` (`fix: complete AI runtime contract wiring`).

The worktree already contains unrelated/uncommitted changes, including tracked edits in the Copilot context builder/contracts/tests and PLM Brain ontology files, plus other unrelated files. These are not part of this design and must be preserved. Any future overlapping edit must first be reconciled with the existing change; stage only the closure-owned hunks/files.

Baseline verification completed before implementation:

- `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj`: passed, 80/80.
- Offline evaluation CLI: passed, 12/12 cases, 100% required path and link coverage.
- `dotnet build Orchestration.API/Orchestration.API.csproj`: succeeded, 0 errors; existing NU1507 package-source warnings.
- Frontend impact evidence service and authorization tests: passed, 13/13.
- `dotnet test Orchestration.API.Tests/Orchestration.API.Tests.csproj --no-restore`: blocked by pre-existing missing `Governance`, `AvailabilityState`, and `CompletenessState` symbols.

Repository inspection established:

- API composition registers `UnavailableResourceAuthorizationDecisionProvider`, which returns no decision. The authorization flow denies rather than authorizing real answer requests. No approved replacement provider, investigation authorization handler, or policy adapter was found in the repository.
- The ASP.NET endpoint distinguishes successful answers from generic denial, but missing provider configuration currently reaches the denial path instead of a sanitized readiness/unavailable result.
- The current Lattice Copilot path is the TypeScript `executeCopilotTurn` path. It builds its existing Copilot context and invokes its Azure model client. No call to `POST api/engineering/impact-answer` was found in the frontend.
- The current .NET endpoint requires JWT authentication. Product integration therefore also needs a valid user token propagation path and an approved resource decision source; the feature must remain disabled until both are available.
- The existing deterministic evaluation uses fixture PLM data and canned model responses. It measures contract behavior, not live model quality or semantic support.
- Current prompt assets are one source-controlled, versioned bundle. Current answer validation verifies schema and reference integrity; it does not prove semantic entailment.

## Approaches

### A. Continue safe, independently tested Case B closure slices — selected

Keep authorization fail-closed and make the missing provider operationally explicit. Continue the safe runtime hardening and deterministic evaluation work in small commits. Add a product routing boundary only behind a disabled feature flag; do not invoke the .NET runtime from the product until an approved identity path and policy provider are configured. This advances code and provides precise rollout gates without inventing authorization.

### B. Pause after baseline and rollout gate

Record the current state and wait for platform/security owners to supply a provider and identity contract before doing more runtime or product work. This reduces potential integration rework but leaves safe, testable improvements incomplete.

**Decision:** Use Approach A. The provider is not in this checkout, and the user confirmed no approved provider is available externally for this work. Phase 1 cannot be declared operational under this design.

## Goals

- Preserve the current Context Compiler, PLM boundary, model gateway, prompt packaging, reference validation, telemetry foundation, and fixture evaluation.
- Make authorization readiness, policy denial, and provider outage observably different without exposing sensitive policy details.
- Narrowly support explicit engineering-impact questions and an explicit, investigation-bound, authorization-bound scope policy.
- Close deterministic validation gaps that can be proven from current structured contracts.
- Make context budgeting explicitly estimated and account for prompt overhead, output reservation, and a safety margin.
- Default linkable identifiers out of telemetry unless separately approved.
- Expand offline regression coverage while explicitly marking semantic and live-model quality as unevaluated.
- Prepare, but keep disabled, a product routing boundary that cannot bypass authorization or silently fall back after denial.
- Produce a closure report with evidence, limitations, and an honest release decision.

## Non-goals

- Implementing a fabricated, allow-all, or claim-only authorization provider.
- Declaring production operation without an approved policy source, identity/token propagation, approved Azure deployment, and secured PLM service.
- Replacing or recomputing PLM Brain reasoning in .NET.
- Adding document RAG, embeddings, vector storage, MCP, agent frameworks, broad question answering, model routing, or caching.
- Claiming factual, semantic, or engineering approval based on citation membership or canned model responses.
- Editing or reverting existing unrelated dirty worktree changes.

## Slice Sequence and Subtasks

Each numbered subtask is an independently reviewable implementation unit with its own focused tests or evidence check. Complete and commit one subtask before starting the next. Run the slice-level integration checks after its subtasks; do not mark a whole slice complete because its types or interfaces exist.

### Slice 1 — Establish the real baseline

1. Commit a baseline report containing the starting commit, exact test/build outcomes, known API test compile errors, DI authorization registration, and Copilot route trace.
2. Record whether the current Copilot invokes the runtime and list external prerequisites. No production code changes in this slice.

Acceptance: report matches the commands and repository state and does not imply live-model or operational authorization success.

### Slice 2 — Case B authorization readiness and response semantics

1. Add a readiness diagnostic with the stable code `AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED`; expose it through the repository’s supported health/readiness surface without returning policy details.
2. Make authorization-provider absence and provider unavailability return sanitized service-unavailable outcomes; preserve 403 for a genuine policy denial.
3. Add focused API/provider tests proving the distinct outcomes and zero PLM/model calls for unavailable or denied authorization.
4. Document the exact provider contract and external rollout gate in `docs/ai-runtime/authorization-provider-rollout-gate.md`.

Acceptance: default composition stays fail-closed; there is no allow-all path; diagnostics are actionable but sanitized; denial/unavailability cannot reach PLM or model stages.

### Slice 3 — Remove unused per-request authorization cache

1. Confirm all authorization provider callers and prove whether same-operation duplicate calls exist.
2. If absent, remove the cache and its key type; retain one decision per controller request and reuse the resulting authorization context for entity resolution and evidence retrieval.
3. Update tests for one decision and no cross-request state.

Acceptance: no cache remains without demonstrated reuse, and authorization context reuse across the two PLM operations is unchanged.

### Slice 4 — Honest narrow question and scope policy

1. Add table-driven question interpretation tests for supported phrasings, explicit identifiers, missing identifiers, unsupported categories, multiple identifiers, and ambiguous descriptions.
2. Implement only the narrow engineering-impact intent; preserve the original question and never invent a subject.
3. Add tests for a named Phase 1 bounded scope policy: active investigation, resolved canonical subject, permitted sources, explicit relationship/source defaults, and a documented maximum hop count.
4. Update XML documentation, diagnostics, telemetry labels, and setup text so these components are not presented as general question understanding or dynamic retrieval planning.

Acceptance: all listed supported and reject/clarify cases have expected outcomes; no cross-investigation or guessed-subject behavior is introduced.

**Scope defaults for this closure:** retain the PLM service's currently supported maximum of three relationship hops; send `asOf=null`; keep relationship-type and source-system allow-lists empty, which means “do not add a narrower filter” rather than “authorize all data.” The protected PLM service still filters to the requested active investigation, the resolved subject's paths/chains, the authorized ticket, and provenance-bearing records. Any future narrow source/type restriction must be derived from an approved authorization decision or an explicitly supported product request—not guessed by the planner. The planner remains a bounded scope policy, not retrieval planning.

### Slice 5 — Strengthen mechanical support validation

1. Add parser and validator tests for empty explanations, duplicate references, unsupported warning text, cross-claim evidence, mismatched investigation/package/decision/request/trace, and omitted claims.
2. Extend structured impact outputs only where required to validate entity and relationship IDs against the exact referenced claim.
3. Reject or normalize duplicate references consistently; keep each answer impact bound to exactly one package claim and its evidence/source references.
4. Add an explicit `semanticSupportStatus` of `not-evaluated` (or equivalent response metadata) and document the result as schema- and reference-validated, not factually verified.

Acceptance: deterministic checks reject unsupported structured identifiers and unsupported free-text warning assertions; semantic entailment remains explicitly unclaimed.

### Slice 6 — Contractually accurate context budgeting

1. Rename budget fields/diagnostics to make the estimate explicit and test exact boundary behavior.
2. Include serialized context plus prompt bundle overhead, reserve configured output tokens, and apply a conservative safety margin using a deployment-specific configured input allowance.
3. Add tests for under/over budget, large policy, multibyte text, supported claims under pressure, explicit omissions, and no claim whose evidence was omitted.
4. Introduce a tokenizer only if these tests show the estimate cannot enforce the configured allowance safely; do not add one in advance.

Acceptance: no request is knowingly assembled above its configured input allowance after output reservation and margin; estimates are never labeled as exact token counts.

### Slice 7 — Telemetry privacy and non-semantic quality signals

1. Inventory all Activity tags/events, metric dimensions, and logs in the runtime path.
2. Add explicit options for investigation, entity, tenant, and context-package identifiers; default these linkable IDs off.
3. Add tests that capture activities, metrics, and `ILogger` output and prove payloads, tokens, ticket claims, deep links, and disabled identifiers are absent.
4. Emit bounded quality signals for available/selected/omitted claims and evidence, validation issues, parse failures, clarification/abstention, and unsupported-reference rejection. Do not label these correctness/faithfulness scores.
5. Estimate cost only if an approved model-price source/config exists; otherwise document it as not yet measured rather than inventing prices.

Acceptance: all sensitive payload exclusions are tested at exporter-facing boundaries, and enabled identifiers require explicit configuration.

### Slice 8 — Expand offline evaluation honestly

1. Add synthetic narrow-intent paraphrases, ambiguous/missing subject, unsupported question, authorization, malformed output, no-evidence/provenance, budget, direct, multi-hop, and supported inverse traversal cases.
2. Add separate machine-readable metrics for intent, subject, clarification, scope, disposition, relation/path/chain, evidence/source, reference rejection, authorization leakage, parse outcome, and omission behavior.
3. Mark `referenceIntegrityEvaluated=true`, `semanticSupportEvaluated=false`, and `liveModelQualityEvaluated=false` in reports and CLI output.
4. Test that failed expectations return a nonzero exit code and that the documentation explicitly states fixture success does not prove prose correctness.

Acceptance: targets in the user request are met, all metrics have explicit denominators/undefined handling, and no output calls fixture success semantic evaluation.

### Slice 9 — Prepare controlled product routing

1. Define and test the server-side feature flag and routing predicate; default disabled.
2. Preserve existing behavior for unsupported questions and disabled routing.
3. Add the narrow runtime-call adapter only if it can obtain the validated user bearer token and active investigation without accepting caller-supplied authorization grants or decisions.
4. Map answer, clarification, abstention, denial, and unavailable outcomes into the existing Copilot response shape without duplicate assistant messages.
5. Keep the route disabled and report the exact missing identity/provider configuration if safe token propagation or policy integration is unavailable.

Acceptance: no denial falls back to the legacy path; no runtime call happens without investigation ID, valid identity, approved provider readiness, and enabled flag. Existing dirty Copilot/PLM files are reconciled before any overlapping edit.

### Slice 10 — Approved live vertical slice

1. Run only after the external authorization provider, user identity, service identity, approved environment, and non-production seeded investigation are available.
2. Capture the requested seven cases with controlled artifacts; keep prompts, evidence, and answers out of general telemetry.
3. Record per-stage latency, tokens, interpretation, scope, authorization outcome, PLM IDs, context IDs/counts/omissions, prompt/model identifiers, validation, and final rendered answer.

Acceptance: authorized, denied, no-evidence, absent-subject, and paraphrase cases have auditable results; any authorization denial yields zero PLM evidence and model calls.

### Slice 11 — Controlled product impact comparison and closure report

1. Run existing and new paths on the same approved fixture/questions; measure required impact coverage, reference integrity, clarification/abstention, parse failures, latency, tokens, and validated-answer rate.
2. Obtain at least one human review of usefulness, inspectable sources, uncertainty, invented consequences, and critical omissions.
3. Write `docs/ai-runtime/phase-1-impact-comparison.md` with measured results; state “no demonstrated product benefit” if no material improvement is evidenced.
4. Write `docs/ai-runtime/phase-1-closure-report.md`, covering all 19 requested sections and the final A/B/C/D decision.

Acceptance: no positive product impact is claimed from architecture cleanliness, fake gateways, or unit tests alone. If live dependencies remain unavailable, report the exact blocker and choose B (code complete, rollout blocked), not A.

## External Gates and Stop Conditions

- A real resource authorization decision source, policy owner, claim/grant semantics, and failure contract are not present in the repository. The chosen work therefore implements Case B, not Case A.
- A production-ready user JWT propagation path from the Copilot frontend to the .NET endpoint has not been established by the current route trace.
- Live Azure model invocation and approved seeded PLM data require platform credentials, deployment values, network access, and data-processing approval. Do not attempt or simulate live validation without those prerequisites.
- Existing API test compile failures remain outside this closure unless the closure changes cause them.

If any change would weaken authorization, cross investigation boundaries, overwrite existing user edits, or require unapproved client data access, stop that subtask and continue only independent safe subtasks.

## Implementation Calls

- Use the repository’s existing health/readiness conventions if present; otherwise expose one minimal readiness result and avoid a new monitoring framework.
- For model input budgeting, require an explicit deployment-specific input allowance (or equivalent context-window setting) before claiming a hard bound; no model-specific allowance is inferred here.
- Structured entity/relationship output fields are added only if needed to enforce the user-requested deterministic ID checks; prose-only identifier extraction is not treated as semantic validation.
- `semanticSupportStatus` is metadata indicating that entailment has not been checked; it does not promise a future judge implementation.
- The seven requested live cases are the three accepted phrasings, no explicit subject, absent R-999, denied authorization, and no evidence, exactly as enumerated in Slice 10.
- Slice 8 evaluation targets are exactly the requested counts: 10 supported paraphrases; 5 missing/ambiguous subject cases; 3 unsupported questions; 3 no-evidence/provenance cases; 4 authorization cases; 3 malformed/unsupported outputs; 3 budget cases; plus direct, multi-hop, and inverse traversal when the current authoritative service supports it.
- The closure report includes the 19 sections in the user request in their given order.
