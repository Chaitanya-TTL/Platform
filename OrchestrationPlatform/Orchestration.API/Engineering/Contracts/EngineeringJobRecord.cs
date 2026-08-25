namespace Orchestration.API.Engineering.Contracts;
public sealed record SafeDiagnosticSummary(string LastEvent, string? WarningCode, string? ErrorCode, DateTimeOffset UpdatedAt);
public sealed record EngineeringJobRecord(string JobId, string RequestId, string CorrelationId, EngineeringSource Source, JobState State, EngineeringStage CurrentStage, int ProgressPercent, DateTimeOffset CreatedAt, DateTimeOffset? StartedAt, DateTimeOffset? CompletedAt, DateTimeOffset? CancellationRequestedAt, DateTimeOffset TimeoutAt, IReadOnlyList<StructuredWarning> Warnings, IReadOnlyList<StructuredError> Errors, bool ResultAvailable, StandardExtractionResult? Result, SafeDiagnosticSummary Diagnostic);
public sealed record CancellationOutcome(string JobId, string Code, string Message, bool Accepted);
public sealed record ValidationOutcome(bool IsValid, IReadOnlyList<StructuredError> Errors);
