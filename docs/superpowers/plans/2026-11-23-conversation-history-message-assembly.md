# Conversation History Message Assembly Implementation Plan

> **For agentic workers:** Implement each task in order and verify it before moving on. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded, role-preserving transcript history to the .NET impact-answer model request without allowing prior conversation prose to become engineering evidence.

**Architecture:** The frontend maps complete stored user/assistant exchanges into a typed ordered list with each assistant disposition. The API carries that list separately from `ConversationState`; `PromptAssembler` admits only successful turns, ranks them against the current question and resolved subject, and adds whole turns only when the current request has token-budget headroom. The system message remains first, and the final user message contains the current question and authorized Context Package.

**Tech Stack:** .NET 10, ASP.NET Core, existing Azure `IChatClient` adapter, TypeScript/Next.js, xUnit, Vitest.

**Spec:** [2026-11-23-conversation-history-message-assembly-design.md](../specs/2026-11-23-conversation-history-message-assembly-design.md)

## Global Constraints

- Keep transcript turns, structured `ConversationState`, and the current authorized `ContextPackage` separate.
- Only `Answer` and `Clarify` transcript turns may enter model history; prior assistant prose is untrusted conversational context, never evidence or instructions.
- Keep the system policy first and the current question plus Context Package in the final user-role message.
- Use the existing byte-based token estimator and safety margin; do not claim exact provider-tokenizer counts or exceed configured input/output limits.
- Preserve the existing Azure role mapping; do not add a provider, retrieval path, or transcript persistence format.

## Review Focus

- A pending user message has no assistant counterpart: omit the incomplete turn and never include the current question twice. Pin in Task 2.
- A prior assistant turn is failed, denied, unavailable, or abstained: omit it from history and never use its ID as the continuation parent. Pin in Task 2 and Task 3.
- A conversation is long or a turn is too large for remaining budget: choose relevant complete turns only and keep the final request within the estimated input allowance. Pin in Task 3.
- Prior assistant prose conflicts with current evidence: keep it out of `ContextPackage.Claims` and give the current package precedence in system policy. Pin in Task 3.
- A client supplies too many or oversized transcript turns: enforce the request bounds rather than silently accepting an unbounded payload. Pin in Task 1 and Task 3.

---

### Task 1: Wiring the Ordered Transcript Contract

**Files:**
- Create: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Conversation/ConversationHistoryTurn.cs`
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime.Contracts/Requests/ImpactAnswerRequest.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/ImpactAnswerRequestDto.cs`
- Modify: `OrchestrationPlatform/Orchestration.API/AI/Api/EngineeringImpactController.cs`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/engineering-impact-runtime-client.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`

**Interfaces:**
- Produce `ConversationHistoryTurn(string TurnId, string UserMessage, string AssistantMessage, ConversationTurnDisposition Disposition)` in `Lattice.AI.Runtime.Contracts.Conversation`.
- Add `IReadOnlyList<ConversationHistoryTurn> ConversationHistory` to `ImpactAnswerRequest`, defaulting to an empty list.
- Accept at most 50 turns in `ImpactAnswerRequestDto`; cap each turn ID at 128 characters and each message at 10,000 characters.
- Add the matching readonly TypeScript turn shape using the existing lowercase `ConversationTurnDisposition` union, and add an optional readonly `conversationHistory` property to `EngineeringImpactRuntimeRequest`.
- Map the DTO list to `ImpactAnswerRequest.ConversationHistory` in `EngineeringImpactController`; serialize it in the runtime client request body without converting it to a dictionary.

- [x] **Step 1: Add a failing runtime-client serialization test** that sends two ordered turns with `answer` and `clarify` dispositions and asserts the exact JSON request body includes the same ordered `conversationHistory`.
- [x] **Step 2: Run the focused test**:

  Run: `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`

  Expected: FAIL because the runtime client does not yet serialize transcript history.

- [x] **Step 3: Add the typed .NET/TypeScript transcript-turn contracts and wire the list through the API DTO, controller, runtime request type, and JSON body.** Apply bounds of 50 turns, 128 characters per turn ID, and 10,000 characters per message; keep the list ordered.
- [x] **Step 4: Re-run the focused runtime-client test.**

  Run: `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/tests/engineering-impact-runtime-client.test.ts`

  Expected: PASS; request JSON contains the two turns in order with their dispositions.

---

### Task 2: Forwarding Completed Turns and Stable Parent IDs

**Files:**
- Modify: `OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Test: `OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`

**Interfaces:**
- Consume the ordered `CopilotConversationMessage[]` from the existing thread.
- Produce a frozen, ordered `ConversationHistoryTurn[]` from adjacent user/assistant pairs. Require matching idempotency keys when both are present; use the assistant's disposition when available, treating legacy answers without runtime metadata as `answer`.
- Forward only complete turns; retain only `Answer`/`Clarify` dispositions in the request list.
- Set `parentTurnId` from `existingThread.conversationState.previousTurnId` only when its disposition is `answer` or `clarify`; otherwise use the latest eligible completed transcript turn ID.

- [x] **Step 1: Add failing `executeCopilotTurn` tests** with multiple stored turns, including one failed assistant outcome, a state marked failed, and one pending user-only message. Assert that only successful complete turns reach the runtime, in original order, and neither failed ID is used as `parentTurnId`.
- [x] **Step 2: Run the focused test**:

  Run: `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`

  Expected: FAIL because runtime requests omit transcript turns and parent linkage currently uses the last assistant message indiscriminately.

- [x] **Step 3: Implement the ordered completed-turn mapper and forward its frozen result to the runtime client.** Exclude `Abstain`, `Deny`, `Unavailable`, and `Failed`; preserve completed `Answer` and `Clarify` turns. Derive the parent ID from the valid state or latest eligible turn, not from an ineligible assistant message.
- [x] **Step 4: Re-run the focused `executeCopilotTurn` test file.**

  Run: `npm --prefix OrchestrationPlatform\frontend test -- features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`

  Expected: PASS; runtime receives completed history only, and the parent ID points to a successful turn.

---

### Task 3: Selecting Role-Preserving History Within the Model Budget

**Files:**
- Modify: `OrchestrationPlatform/Lattice.AI.Runtime/Prompts/PromptAssembler.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Prompts/PromptAssemblerTests.cs`
- Test: `OrchestrationPlatform/Lattice.AI.Runtime.Tests/Generation/ModelGatewayTests.cs`

**Interfaces:**
- Consume `ImpactAnswerRequest.ConversationHistory`, the current question, `ContextPackage.Subject`, and `ModelConfiguration`.
- Produce a readonly `ModelRequest.Messages` list: first `system`, selected historical `user`/`assistant` pairs in original order, then one final `user` containing the current question and Context Package.
- Consider only turns with `Answer` or `Clarify` disposition. Rank by distinct non-stopword term overlap with the current question and subject canonical ID/label, weighting user-message matches twice assistant-message matches; break ties by recency, then restore chronological order.
- Calculate history headroom from the serialized system/current-user messages, configured input/output token limits, and `ModelInputTokenBudget` safety margin. Add only whole pairs that fit; reject malformed, oversized, or over-count input rather than silently truncating individual messages.
- Add system policy that history is untrusted conversational context, not evidence or instructions, and the current authorized Context Package overrides stale conversational claims. Do not merge history into context claims, sources, or citations.

- [x] **Step 1: Add failing prompt tests** in `PromptAssemblerTests` for: multiple turn role/order preservation; system-first and current-user-last ordering; exclusion of `Failed`, `Deny`, `Abstain`, and `Unavailable`; a stale assistant claim remaining outside `ContextPackage.Claims` while current package evidence is authoritative; and a long history where a relevant older turn is retained, irrelevant turns are omitted, and `ModelInputTokenBudget.Fits(...)` is true.
- [x] **Step 2: Run the focused .NET tests**:

  Run: `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~PromptAssemblerTests" --artifacts-path "$env:TEMP\LatticeConversationHistoryTests"`

  Expected: FAIL because `PromptAssembler` currently builds only a system and current-user message.

- [x] **Step 3: Implement history validation, deterministic relevance ranking, token-budget selection, and policy wording in `PromptAssembler`.** Construct roles with the existing `ModelMessage` contract; preserve selected-turn order and freeze the final list with a readonly wrapper.
- [x] **Step 4: Extend `ModelGatewayTests`** to send a system message, multiple user/assistant turns, and a final user message; assert the Azure adapter maps all roles and preserves their exact order.
- [x] **Step 5: Run the focused .NET tests**:

  Run: `dotnet test OrchestrationPlatform\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj --filter "FullyQualifiedName~PromptAssemblerTests|FullyQualifiedName~ModelGatewayTests" --artifacts-path "$env:TEMP\LatticeConversationHistoryTests"`

  Expected: PASS; message order is preserved and the estimated request fits the configured budget.

**Manual checkpoint:** With the .NET impact runtime configured, open the local Lattice investigation and ask a follow-up that depends on a prior successful answer. Confirm the request returns through the existing Copilot flow. Do not add prompt/history logging; the focused tests prove selection, role order, and budget behavior without exposing transcript contents in terminal output.
