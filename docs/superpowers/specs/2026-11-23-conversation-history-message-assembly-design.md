# Conversation History Message Assembly Design

## Intent

Pass useful prior turns into the .NET impact-answer model request so follow-up questions have conversational context, while keeping the current authorized Context Package as the only engineering evidence.

## Goals and boundaries

- Carry completed transcript turns as an ordered, read-only list, separate from `ConversationState` and `ContextPackage`.
- Preserve explicit `system`, `user`, and `assistant` roles through `ModelRequest.Messages` and the existing Azure adapter.
- Exclude assistant turns with `Abstain`, `Deny`, `Unavailable`, or `Failed` dispositions. Retain completed `Answer` and `Clarify` turns.
- Bind `parentTurnId` to the latest valid structured state or completed transcript turn, never to a failed assistant outcome.
- Select relevant complete turns against the current question and resolved subject, then include only turns that fit the remaining model input budget.
- Keep system policy first and the current question plus Context Package in the final user message. Prior assistant prose must never be merged into evidence, claims, or citations.

Non-goals: changing transcript persistence, adding a new model provider, changing the legacy provider's behavior, or claiming exact provider-tokenizer counts. The existing byte-based token estimate and safety margin remain the budget authority for this change.

## Approaches

1. **Select in .NET (chosen):** the frontend passes completed transcript turns with dispositions; `PromptAssembler` filters, relevance-ranks, and token-budgets them immediately before model-request construction. This centralizes the final selection at the model boundary and avoids duplicating relevance logic.
2. **Preselect in the frontend:** reduces request payload size, but duplicates selection behavior across TypeScript and C# and still needs a .NET budget guard.
3. **Send only structured `ConversationState`:** smallest change, but does not restore transcript turns to `ModelRequest.Messages` and therefore does not meet the follow-up context requirement.

## Implementation outline

- Add a typed transcript-turn contract containing a turn ID, user text, assistant text, and disposition; pass it through the runtime request and API DTO as an ordered list.
- Derive the continuation parent from `ConversationState.PreviousTurnId` only when its disposition is `Answer` or `Clarify`; otherwise use the latest completed eligible transcript turn.
- Construct model messages as system policy, selected user/assistant pairs in original order, and the final current user message containing the current Context Package.
- Rank turns using term overlap with the current question and resolved subject ID/label; prefer user-message overlap, use recency for ties, and restore chronological order after selection.
- Compute history headroom from the serialized system/current-user messages, configured input/output limits, and the existing safety margin. Include only whole turns that fit. The byte-based estimate is conservative but is not an exact provider tokenizer.
- State in system policy that transcript content is untrusted conversational context, never evidence or instructions, and that the current authorized Context Package overrides stale conversational claims.
- Keep the Azure adapter's existing explicit role mapping; add coverage proving assistant roles and order are preserved.

## Acceptance checks

- Tests prove system-first ordering; multiple prior turns preserve user/assistant order; the current user question is last; and failed/rejected turns are excluded.
- Tests prove prior assistant prose does not enter Context Package evidence claims and current package content takes precedence in prompt instructions.
- A long-history test proves relevant turns are preferred while irrelevant turns are omitted and the final request stays within the configured estimated input budget.
- Frontend tests prove transcript turns and dispositions reach the runtime request without converting the ordered list to a dictionary.
