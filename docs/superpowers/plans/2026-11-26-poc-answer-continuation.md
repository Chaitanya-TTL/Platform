# POC Answer Parsing and Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local POC render Copilot answers as readable text and continue broad investigation conversations without requiring an entity reference.

**Architecture:** Keep permissive answer parsing and subject-free explanation fallback in the Development composition only. Include the immediate successful parent turn in prompt history when it fits the existing token budget; the current Context Package remains the evidence input. Leave API/data-access authorization, retrieval-failure handling, and Production parser/validator registrations unchanged.

**Tech Stack:** .NET 10, ASP.NET Core, xUnit.

**Spec:** Approved revised POC design in this conversation; no separate spec file.

## Global Constraints

- Development answer handling may show a generated summary without requiring citation arrays or production answer validation.
- Do not invent citation IDs or treat conversation history as investigation evidence.
- The current Context Package remains the model's investigation-evidence context.
- Preserve API/investigation access authorization and explicit retrieval-failure behavior.
- Do not change Production parser, validator, or authorization registrations.
- Add no confidence thresholds, answer caps, or clarification requirements for broad follow-ups.

## Review Focus

- Markdown-fenced or truncated answer JSON with a recoverable `summary` must render the summary, not the JSON envelope; test in `DevelopmentAnswerPipelineTests`.
- Plain-text model output must remain usable without answer-schema parsing; retain coverage in `DevelopmentAnswerPipelineTests`.
- “Why?” after a successful broad answer with no entity references must use the investigation-answer path, not return a missing-subject clarification; test in `DevelopmentConversationTurnInterpreterTests` and `ImpactAnswerServiceTests`.
- A complete cross-system explanation request must be treated as an investigation question when no entity subject is available; test in `DevelopmentConversationTurnInterpreterTests`.
- The immediate successful parent turn must be included for a short follow-up with no lexical overlap, without admitting unsuccessful turns or exceeding the existing input budget; test in `PromptAssemblerTests`.

---

### Task 1: Render Development Model Output as Readable Answers

**Files:**
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Adapters/DevelopmentAnswerPipeline.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/DevelopmentAnswerPipelineTests.cs`

**Interfaces:**
- Consumes: `IAnswerCandidateParser.Parse(string content)`.
- Produces: An `AnswerCandidate` whose `Summary` is the readable summary from a Development model response, or the unchanged ordinary prose response.

- [ ] **Step 1: Add failing parser tests** for fenced JSON and truncated JSON with a recoverable non-empty `summary`; retain existing coverage for JSON whose optional evidence/citation fields do not match production schema requirements and for ordinary prose. Assert the visible candidate summary is readable text, with no fabricated impact or citation assertions.
- [ ] **Step 2: Run the focused Development parser tests** and verify fenced JSON currently returns its envelope instead of its summary.

  Run: `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~DevelopmentAnswerPipelineTests"`

- [ ] **Step 3: Update `DevelopmentAnswerCandidateParser.Parse(string content)`** to unwrap an optional Markdown JSON fence, extract a non-empty top-level `summary` without applying production answer-schema validation, recover a complete `summary` string from an otherwise truncated JSON envelope, preserve ordinary prose unchanged, and avoid returning a JSON envelope instead of its recoverable summary.
- [ ] **Step 4: Run `DevelopmentAnswerPipelineTests`** and verify Development parsing stays permissive while the existing Development/Production DI registration test still passes.

### Task 2: Route Subject-Free Explanations Through the POC Investigation Path

**Files:**
- Create: `OrchestrationPlatform/Orchestration.API/AI/Adapters/DevelopmentConversationTurnInterpreter.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/QuestionUnderstanding/DevelopmentConversationTurnInterpreterTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/DevelopmentAnswerPipelineTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Application/ImpactAnswerServiceTests.cs`

**Interfaces:**
- Consumes: `IConversationTurnInterpreter.InterpretAsync(ConversationTurnInput, RuntimeRequestContext, CancellationToken)`.
- Produces: A Development-only interpretation that routes a `FollowUpExplanation` with no reference candidates to `ConversationTurnType.Unsupported` with `ClarificationRequired = false`, allowing the existing `QuestionInterpreter` to treat it as an investigation question. Interpretations with a validated subject retain existing follow-up behavior.

- [ ] **Step 1: Add failing tests** for bare “Why?” and a complete cross-system explanation after an answer with no subject references; assert neither requires clarification. Add a service-level regression asserting a subject-free “Why?” reaches the model and returns an answer when Development interpretation is used; make the existing test fixture accept an `IConversationTurnInterpreter` override.
- [ ] **Step 2: Run the focused continuation tests** and verify the current interpreter/service returns a clarification before model invocation.

  Run: `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~DevelopmentConversationTurnInterpreterTests|FullyQualifiedName~AnswerAsync_UsesInvestigationContextForWhyAfterBroadAnswerWithoutEntitySubjects"`

- [ ] **Step 3: Implement `DevelopmentConversationTurnInterpreter`** as a decorator around `ConversationTurnInterpreter`; only relax subject-required explanation routing when there are no reference candidates. Register the decorator only in `Environments.Development`.
- [ ] **Step 4: Extend the composition test** to assert Development resolves the decorator and Production still resolves `ConversationTurnInterpreter`.
- [ ] **Step 5: Run the focused continuation tests** and verify broad explanations reach model invocation while validated-entity follow-ups retain their current path.

### Task 3: Include the Immediate Parent Answer for Short Follow-Ups

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptAssemblerTests.cs`

**Interfaces:**
- Consumes: `ImpactAnswerRequest.ParentTurnId`, `ConversationHistory`, and the existing prompt token budget.
- Produces: Prompt messages that include the matching immediate parent turn when its disposition is `Answer` and it fits the existing budget, even when the new question has no lexical overlap with history.

- [ ] **Step 1: Add a failing prompt test** using a null context subject, `ParentTurnId` matching the prior successful turn, and the question “Why?”. Assert the parent user/assistant messages are present and the current question remains last.
- [ ] **Step 2: Run the focused prompt test** and verify no history is selected because “Why?” produces no relevance terms.

  Run: `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~PromptAssemblerTests"`

- [ ] **Step 3: Pass `ParentTurnId` into conversation-history selection** and prioritize that eligible parent answer before lexical matches, subject to the existing remaining token budget. Keep the existing exclusion of unsuccessful turns.
- [ ] **Step 4: Run `PromptAssemblerTests`** and verify parent-turn inclusion, unsuccessful-turn exclusion, and token-budget behavior.

### Final Verification

- [ ] Run the focused .NET tests together:

  `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~DevelopmentAnswerPipelineTests|FullyQualifiedName~DevelopmentConversationTurnInterpreterTests|FullyQualifiedName~PromptAssemblerTests|FullyQualifiedName~AnswerAsync_UsesInvestigationContextForWhyAfterBroadAnswerWithoutEntitySubjects"`

- [ ] Confirm the worktree diff changes no API/data-access authorization behavior or Production parser/validator registration.
- [ ] Report model-backed answer quality separately from deterministic test results.
