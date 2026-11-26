namespace Lattice.AI.Runtime.Contracts.Requests;

public sealed record RuntimeRequestContext(
    string RequestId,
    string TraceId,
    string? ParentRequestId,
    string? ConversationId)
{
    public string? TurnId { get; init; }
    public string RouteSource { get; init; } = "Unknown";
    public int? SnapshotRevision { get; init; }
    public bool FullPayloadTraceEnabled { get; init; }
}
