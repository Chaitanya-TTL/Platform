namespace Lattice.AI.Runtime.Contracts.Requests;

public sealed record ImpactAnswerRequest(
    string InvestigationId,
    string Question,
    string? ConversationId = null);
