namespace Orchestration.API.Engineering.Contracts;

public sealed record NormalizedQueryField(
    string? OriginalValue,
    string? NormalizedValue,
    IReadOnlyList<string> Transformations);

public sealed record NormalizedEngineeringQuery(
    string? OriginalInput,
    NormalizedQueryField ProductId,
    NormalizedQueryField ProductName,
    IdentifierType IdentifierType,
    string? Revision,
    string? Version,
    IReadOnlyList<StructuredWarning> Warnings);

public sealed record FederatedEngineeringDiscoveryRequest(
    string SchemaVersion,
    string? RequestId,
    string? CorrelationId,
    IReadOnlyList<EngineeringSource>? RequestedSources,
    EngineeringQuery Query,
    int ResultLimitPerSource = 10,
    TimeoutPolicy? TimeoutPolicy = null);

public sealed record FederatedSourceDiscoveryOutcome(
    string SchemaVersion,
    string RequestId,
    string ParentJobId,
    string SourceExecutionId,
    int Attempt,
    EngineeringSource Source,
    StandardStatus Status,
    SourceReadiness Readiness,
    SourceCapability Capabilities,
    EngineeringQuery Query,
    NormalizedEngineeringQuery NormalizedQuery,
    IReadOnlyList<SourceCandidate> Candidates,
    IReadOnlyList<StructuredWarning> Warnings,
    IReadOnlyList<StructuredError> Errors,
    ResultProvenance Provenance,
    DateTimeOffset StartedAt,
    DateTimeOffset CompletedAt,
    long DurationMs,
    bool Retryable);

public sealed record FederatedEngineeringDiscoveryResult(
    string SchemaVersion,
    string RequestId,
    string CorrelationId,
    string ParentJobId,
    StandardStatus Status,
    EngineeringQuery Query,
    NormalizedEngineeringQuery NormalizedQuery,
    IReadOnlyList<FederatedSourceDiscoveryOutcome> Sources,
    IReadOnlyList<CandidateCorrespondence> Correspondences,
    SelectionState SelectionState,
    DateTimeOffset StartedAt,
    DateTimeOffset? CompletedAt);

public sealed record FederatedDiscoveryAccepted(
    string SchemaVersion,
    string RequestId,
    string CorrelationId,
    string ParentJobId,
    FederatedJobState State,
    DateTimeOffset AcceptedAt);
