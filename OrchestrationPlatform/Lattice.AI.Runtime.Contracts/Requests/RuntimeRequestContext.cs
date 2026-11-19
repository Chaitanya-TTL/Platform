namespace Lattice.AI.Runtime.Contracts.Requests;

public sealed record RuntimeRequestContext(
    string RequestId,
    string TraceId,
    string? ParentRequestId,
    string? ConversationId);
