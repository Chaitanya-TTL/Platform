namespace Lattice.AI.Runtime.Contracts.Requests;

public sealed record ImpactAnswerRequest(string Question, string? ConversationId = null);
