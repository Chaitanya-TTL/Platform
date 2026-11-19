namespace Lattice.AI.Runtime.Contracts.Conversation;

public sealed record ConversationTurnInput(
    string Question,
    string InvestigationId,
    string ConversationId,
    string TurnId,
    string? ParentTurnId,
    ConversationState? PreviousState);
