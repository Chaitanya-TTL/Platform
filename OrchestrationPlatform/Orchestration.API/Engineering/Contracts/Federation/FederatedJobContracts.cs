namespace Orchestration.API.Engineering.Contracts;

public enum FederatedJobState
{
    Accepted,
    Discovering,
    AwaitingSelection,
    Success,
    PartialSuccess,
    Empty,
    Unavailable,
    CancellationRequested,
    Cancelled,
    Failed
}

public sealed record FederatedSourceJobSnapshot(
    string SourceExecutionId,
    EngineeringSource Source,
    int Attempt,
    StandardStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt,
    bool Active,
    bool Retryable,
    FederatedSourceDiscoveryOutcome? Outcome);

public sealed record FederatedDiscoveryJobSnapshot(
    string ParentJobId,
    string RequestId,
    string CorrelationId,
    FederatedJobState State,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt,
    IReadOnlyList<FederatedSourceJobSnapshot> Sources,
    FederatedEngineeringDiscoveryResult? Result);
