using Lattice.AI.Runtime.Contracts.Conversation;

namespace Lattice.AI.Runtime.Contracts.Requests;

public sealed record ImpactAnswerRequest(
    string InvestigationId,
    string Question,
    string? ConversationId = null)
{
    public ConversationState? PreviousConversationState { get; init; }
    public string? ParentTurnId { get; init; }
    public IReadOnlyList<ConversationHistoryTurn> ConversationHistory { get; init; } =
        Array.Empty<ConversationHistoryTurn>();
}
