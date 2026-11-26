# Local Copilot Runtime Debugging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local Copilot questions reach the runtime, fail explicitly when requested evidence retrieval fails, and log the full investigation-to-answer path in Development.

**Architecture:** Use the existing Development-only runtime authentication composition and synthetic PLM service identity, but let the Development API establish its local principal without requiring a caller credential. Stop processing before context compilation/model invocation when a planned evidence retriever fails. Reuse existing execution traces and enable full payload detail only in Development.

**Tech Stack:** .NET 10, ASP.NET Core, xUnit, TypeScript, Vitest.

**Spec:** [2026-11-26-local-copilot-runtime-debugging-design.md](../specs/2026-11-26-local-copilot-runtime-debugging-design.md)

## Global Constraints

- Production JWT authentication, authorization registrations, and trace payload policy remain unchanged.
- Only Development may establish the synthetic local identity or emit full prompt/evidence payloads.
- Retrieval exceptions are operational failures, never evidence; do not invoke the model after a requested retrieval failure.
- A successful empty retrieval is not a failure.
- Preserve the existing legacy route and approved evidence/compiler behavior.
- Do not add ranking, result, entity, character, or fact caps.

## Review Focus

- Requests without bearer credentials must reach the runtime only in Development; Production remains JWT-protected.
- Source, fact, or application retrieval errors must return a retrieval failure before ContextCompiler/model invocation.
- Empty successful retrievals must preserve existing behavior and must not be mislabeled as infrastructure failures.
- Full prompts, evidence, and model responses must be visible in Development diagnostics without credential values.
- A 401/503 before the runtime controller must remain a structured non-answer and never be represented as model-generated content.

---

### Task 1: Unblock Development Runtime Ingress

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Adapters/LocalDevelopmentRuntimeAuthorization.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-routing.ts`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Authorization/LocalDevelopmentAuthorizationTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/runtime-access-token-provider.test.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`

**Interfaces:**
- Consumes: `AuthorizationContextProvider.CreateAsync(ClaimsPrincipal, string, RuntimeRequestContext, CancellationToken)`.
- Produces: In Development, an authenticated synthetic principal and local decision without requiring a caller JWT; in Production, current bearer validation and decision-provider behavior.

- [ ] **Step 1: Add failing API tests** proving a no-credential Development request reaches the injected answer service and Production still rejects an unauthenticated request.
- [ ] **Step 2: Run the focused API tests** and verify the Development no-credential test fails before the implementation.
- [ ] **Step 3: Update the Development authentication handler** to create the synthetic principal without requiring a bearer token; leave JWT registration and Production behavior unchanged.
- [ ] **Step 4: Add a frontend test** proving a broad investigation question selects the local runtime when Development endpoint configuration is available.
- [ ] **Step 5: Run focused .NET and frontend tests** and verify local ingress, production authentication, and broad-question routing pass.

### Task 2: Stop After Requested Retrieval Failures

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Application/ImpactAnswerService.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`

**Interfaces:**
- Consumes: Existing source-evidence, fact-evidence, and application-context plans and retrieval exceptions.
- Produces: `ImpactAnswerResult` with `AnswerDisposition.Failed` and a retrieval-specific `ValidationIssue`, with no context compilation or model request after a planned retrieval fails.

- [ ] **Step 1: Add failing tests** for requested source-evidence, fact-evidence, and application-context provider failures; assert no ContextCompiler continuation/model invocation and a retrieval-specific failure issue.
- [ ] **Step 2: Add a successful-empty-result regression test** for each applicable path; assert empty data remains distinguishable from provider failure.
- [ ] **Step 3: Run the focused `ImpactAnswerServiceTests`** and verify failure-path tests fail because processing currently continues.
- [ ] **Step 4: Return explicit failure results from the existing unavailable, timeout, and retrieval-exception branches** when their corresponding plans requested retrieval; do not include exception text in evidence or model input.
- [ ] **Step 5: Run focused application tests** and verify all requested-retrieval failures stop before model invocation while successful empty results preserve current behavior.

### Task 3: Enable Development Full-Payload Pipeline Tracing

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/appsettings.Development.json`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/copilot-execution-trace.ts`
- Modify: `OrchestrationPlatform/docs/ai-runtime/phase-1-local-setup.md`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/copilot-execution-trace.test.ts`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Api/ImpactAnswerAuthorizationTests.cs`

**Interfaces:**
- Consumes: Existing `CopilotExecutionTrace` events and `FullPayloadTraceEnabled` Development guard.
- Produces: Development logs containing question, retrieval results, compiled context, exact model messages, model response, validation, and final answer; Production payload tracing remains prohibited.

- [ ] **Step 1: Add failing trace tests** proving Development full-payload configuration captures full event payloads while redacting bearer credentials, and Production does not enable full payloads.
- [ ] **Step 2: Run focused trace tests** and verify full-payload capture is not active by default.
- [ ] **Step 3: Enable full-payload diagnostics in Development configuration and have Development Copilot traces request full detail** using the existing trace events.
- [ ] **Step 4: Update local setup documentation** describing where to read stage logs and that they contain investigation content only in Development.
- [ ] **Step 5: Run focused frontend trace and API tests** and verify prompt/context visibility, credential sanitization, and Production behavior.

### Final Verification

- [ ] Run frontend tests from `OrchestrationPlatform/frontend`:

  `npm test -- features/lattice-next/copilot/tests/copilot-execution-trace.test.ts features/lattice-next/copilot/tests/runtime-access-token-provider.test.ts features/lattice-next/copilot/tests/engineering-impact-runtime-routing.test.ts`

- [ ] Run .NET tests from the repository root:

  `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj`

- [ ] Confirm a Development request trace reaches retrieval, context compilation, prompt assembly, model invocation, validation, and persistence when required local providers are configured.
- [ ] Confirm requested retrieval failures stop before model invocation and are reported as explicit failures.
- [ ] Report live-model verification separately; deterministic tests do not establish answer quality against a live provider.
