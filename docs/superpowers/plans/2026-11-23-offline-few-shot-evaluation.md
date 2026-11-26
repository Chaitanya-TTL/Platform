# Offline Few-Shot Prompt Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a source-controlled, intent-specific few-shot prompt set and an offline evaluation harness, without changing production prompt behavior or calling a model.

**Architecture:** Keep `engineering-impact/v1` as the zero-shot production baseline. Add a strict, versioned example catalog in `Lattice.AI.Runtime`; add typed synthetic benchmark cases, a renderer, and an offline-only report/CLI in `Lattice.AI.Runtime.Evaluation`. The renderer operates on existing `ModelRequest` messages and is not wired into `ImpactAnswerService` or `IModelGateway`.

**Tech Stack:** .NET 10, C#, embedded JSON prompt assets, JSONL evaluation cases, xUnit.

**Spec:** `docs/superpowers/specs/2026-11-23-offline-few-shot-evaluation-design.md`

## Global Constraints

- The existing `engineering-impact/v1` resources remain the zero-shot baseline and are not edited.
- Examples and benchmark data use synthetic IDs, evidence, entities, and source locations only.
- Azure is not referenced or invoked by the offline evaluation runner.
- The runtime system policy remains the first message in both rendered variants.
- Example material is clearly marked as synthetic demonstration, not transcript, instruction, or evidence.
- Clarification and insufficient-evidence cases select no examples because current orchestration handles them before generation.
- Approximate prompt tokens use the existing runtime estimator and are labeled estimates, not provider token usage.

## Review Focus

- Malformed, duplicate, or unsupported prompt-set metadata must fail closed; pin it in `FewShotPromptCatalogTests`.
- Unknown intents and pre-generation control intents must never select examples; pin them in `FewShotPromptCatalogTests` and dataset validation tests.
- Stale assistant claims and instruction-like retrieved text must remain distinct from selected examples and the current Context Package; pin ordering and message-boundary checks in `FewShotPromptEvaluationTests`.
- Clarification and insufficient-evidence benchmark cases must expect zero model-generation prompts; pin in `FewShotPromptEvaluationTests`.
- Few-shot input growth is only an estimator result, not provider usage; pin positive estimated deltas and explicit report labeling in `FewShotPromptEvaluationTests`.

---

### Task 1: Adding versioned few-shot assets and typed selection

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/FewShotPromptIntent.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/FewShotPromptExample.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/FewShotPromptSet.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/FewShotPromptCatalog.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/engineering-impact/few-shot/v1/manifest.json`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/engineering-impact/few-shot/v1/examples.json`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Lattice.AI.Runtime.csproj`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/FewShotPromptCatalogTests.cs`

**Interfaces:**
- `FewShotPromptIntent`: closed enum with `DirectImpact`, `FollowUpExplanation`, `SourceEvidenceExplanation`, `Clarification`, and `InsufficientEvidence`.
- `FewShotPromptExample`: immutable record containing `Id`, `Intent`, `Question`, `Context`, `ExpectedAnswer`, and `BehaviorTags`.
- `FewShotPromptSet`: immutable record containing set identity/version, pinned base-prompt identity/version, and a read-only ordered example list.
- `FewShotPromptSet.SelectFor(FewShotPromptIntent intent) -> IReadOnlyList<FewShotPromptExample>` returns exact-intent matches only; control intents return an empty list.
- `FewShotPromptCatalog.GetRequired(string id, string version) -> FewShotPromptSet` loads only the pinned embedded set and validates its manifest and examples.

- [ ] **Step 1: Write catalog and selector tests**

Add tests named:
- `GetRequired_LoadsVersionedSyntheticExamplesPinnedToEngineeringImpactV1`
- `GetRequired_RejectsUnknownSetVersionAndInvalidManifest`
- `GetRequired_RejectsDuplicateExampleIdsAndUnsupportedIntents`
- `SelectFor_ReturnsOnlyExactIntentExamplesAndNoControlExamples`

Assert the set has exactly three examples, pinned to `engineering-impact/v1`, classified synthetic-only, and tagged respectively `DirectImpact`, `FollowUpExplanation`, and `SourceEvidenceExplanation`. Assert that `Clarification` and `InsufficientEvidence` select none.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:
`dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~FewShotPromptCatalogTests"`

Expected: FAIL because the catalog, set, selector, and assets do not exist yet.

- [ ] **Step 3: Implement the versioned prompt-set contract**

Add the enum and immutable records, then implement the catalog with strict field/duplicate/version/intent validation. Embed the manifest and three compact examples under logical resource names scoped to `engineering-impact.few-shot.v1`. Do not modify the existing prompt manifest, prompt bundle, or production assembler.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:
`dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~FewShotPromptCatalogTests"`

Expected: PASS, including fail-closed invalid-resource cases and exact typed selection.

---

### Task 2: Defining the synthetic prompt benchmark

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/PromptExperiments/FewShotPromptEvaluationDataset.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/PromptExperiments/FewShotPromptEvaluationDatasetReader.cs`
- Create: `OrchestrationPlatform/evals/prompt-evaluation/few-shot/v1/manifest.json`
- Create: `OrchestrationPlatform/evals/prompt-evaluation/few-shot/v1/cases.jsonl`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/FewShotPromptEvaluationDatasetTests.cs`

**Interfaces:**
- `FewShotPromptEvaluationCase`: immutable record containing `CaseId`, `Intent`, `ScenarioTags`, an `ImpactAnswerRequest`, a synthetic `ContextPackage`, `ModelCallExpected`, `ExpectedDisposition`, and expected claim/evidence/source ID lists for future live scoring.
- `FewShotPromptEvaluationDatasetReader.Read(string datasetPath) -> FewShotPromptEvaluationDataset` validates the versioned manifest, bounded JSONL input, unique case IDs, closed intent values, and required scenario coverage.
- Dataset scenarios cover direct impact, “Why?” follow-up, source-evidence explanation, abstention, clarification, valid references, uncertainty, stale assistant claims, and prompt injection. Cases may cover more than one scenario tag.

- [ ] **Step 1: Write dataset validation tests**

Add tests named:
- `Read_ValidatesSyntheticDatasetAndRequiredScenarioCoverage`
- `Read_RejectsUnknownOrDuplicateCaseFieldsAndCaseIds`
- `Read_RejectsInvalidIntentAndMissingScenarioCoverage`
- `Read_RequiresClarificationAndAbstentionCasesToExpectNoGeneration`

Assert the dataset contains only synthetic data and every required scenario tag appears at least once. Ensure the stale-claim case carries an ordered synthetic transcript, the injection case marks its retrieved text as untrusted data, and expected reference IDs are present for future scoring.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:
`dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~FewShotPromptEvaluationDatasetTests"`

Expected: FAIL because the dataset reader and versioned cases do not exist yet.

- [ ] **Step 3: Add the strict reader and synthetic cases**

Implement the reader using bounded file/line sizes and strict JSON field validation, following the existing engineering-impact evaluation runner’s fail-closed dataset patterns. Add only synthetic case inputs and annotations; do not add canned model outputs or claims that the cases evaluate model quality. Copy the dataset into test output through the test project file.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:
`dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~FewShotPromptEvaluationDatasetTests"`

Expected: PASS, including the complete scenario coverage and control-case checks.

---

### Task 3: Rendering and reporting the offline A/B prompt variants

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/PromptExperiments/PromptExperimentRenderer.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/PromptExperiments/FewShotPromptEvaluationRunner.cs`
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/PromptExperiments/FewShotPromptEvaluationReport.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Evaluation/Program.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Evaluation/FewShotPromptEvaluationTests.cs`

**Interfaces:**
- `PromptExperimentRenderer.RenderFewShot(ModelRequest zeroShotRequest, IReadOnlyList<FewShotPromptExample> examples) -> ModelRequest` inserts a distinct labeled example message after the system message, preserves transcript and current Context Package messages, keeps the current user message last, and recalculates estimated input tokens.
- `FewShotPromptEvaluationRunner.RunAsync(string datasetPath, CancellationToken cancellationToken) -> Task<FewShotPromptEvaluationReport>` loads the dataset and example set, renders baseline and few-shot variants for generation-eligible cases, and never invokes an `IModelGateway`.
- `FewShotPromptEvaluationReport` reports structural results, case/intent coverage, selected example IDs, baseline/few-shot estimated input tokens, and estimated delta. Live model quality, semantic support, human usefulness, latency, and monetary cost are explicitly marked not evaluated.
- CLI invocation: `dotnet run --project OrchestrationPlatform\Lattice.AI.Runtime.Evaluation\Lattice.AI.Runtime.Evaluation.csproj -- --prompt-evaluation OrchestrationPlatform\evals\prompt-evaluation\few-shot\v1`

- [ ] **Step 1: Write rendering and runner tests**

Add tests named:
- `RenderFewShot_KeepsSystemFirstAndCurrentUserLast`
- `RenderFewShot_SeparatesExamplesFromTranscriptAndContextPackage`
- `RunAsync_UsesTypedExamplesAndSkipsPreGenerationControlCases`
- `RunAsync_ReportsEstimatedTokenDeltaAndExplicitlyPendingQualityMetrics`

Assert the few-shot message is not an assistant transcript turn or part of the Context Package, examples are selected only by the dataset enum, and no model gateway/provider is constructed or called. Assert quality, human review, latency, and cost are reported as not evaluated rather than zero or successful.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:
`dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~FewShotPromptEvaluationTests"`

Expected: FAIL because the variant renderer, report, and offline runner do not exist yet.

- [ ] **Step 3: Implement the evaluation-only renderer, runner, report, and CLI**

Use the existing `IPromptAssembler`/`PromptAssembler` output as the baseline with a fixed synthetic offline `ModelConfiguration` (`4096` max input tokens, `512` max output tokens). Add one clearly delimited user-role message for selected synthetic demonstrations immediately after the system message; do not change production `PromptAssembler` or `ImpactAnswerService`. For control cases, render no model prompt. Use `ModelInputTokenBudget.EstimateInputTokens` for both variants and report the estimated delta without truncation or provider-usage claims. Extend the evaluation CLI with a separate prompt-evaluation mode while preserving the existing engineering-impact evaluation command.

- [x] **Step 4: Run focused tests and the offline CLI**

Run:
`dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~FewShotPromptCatalogTests|FullyQualifiedName~FewShotPromptEvaluationDatasetTests|FullyQualifiedName~FewShotPromptEvaluationTests"`

Then run:
`dotnet run --project OrchestrationPlatform\Lattice.AI.Runtime.Evaluation\Lattice.AI.Runtime.Evaluation.csproj -- --prompt-evaluation OrchestrationPlatform\evals\prompt-evaluation\few-shot\v1`

Expected: focused tests PASS; CLI emits a machine-readable structural report with all scenario categories, estimated token delta, and live-quality/human/latency/cost metrics marked pending/not evaluated. No network or provider call occurs.

- [x] **Step 5: Check the final diff**

Run:
`git diff --check`

Expected: no whitespace errors; production `engineering-impact/v1` prompt files and `PromptAssembler` remain unchanged.

## Validation Results

- The combined few-shot catalog, dataset, and renderer/runner test group passed: 15 tests.
- `Lattice.AI.Runtime.Evaluation` built successfully.
- The offline CLI passed structural checks for all five synthetic cases: three generation cases and two pre-generation controls.
- The report recorded zero provider calls and an estimated increase of 852 input tokens (3,515 baseline; 4,367 few-shot). This is an estimator-only delta, not measured provider usage.
- Semantic support, live-model quality, human usefulness, latency, and cost remain unevaluated. No Azure or other model calls were made, so this run does not establish that examples improve answer quality.
- `git diff --check` passed.

---

## Dependencies

- Task 1 has no prerequisite.
- Task 2 depends on Task 1 for the typed intent contract.
- Task 3 depends on Tasks 1 and 2 for examples, selector, and validated benchmark cases.

## Execution Handoff

The tasks are tightly coupled through the prompt-set and typed-intent contracts. Native implementation is recommended: it minimizes interface churn and allows the renderer, reader, and tests to be validated together without introducing provider or production behavior changes.
