namespace Orchestration.API.Engineering.Contracts;

public enum SelectionState { AwaitingSelection, Selected, PartialSelection, Rejected, NotRequired }
public enum CandidateSelectionDecision { Selected, Rejected, Skipped }

public sealed record SourceCandidateSelection(
    EngineeringSource Source,
    CandidateSelectionDecision Decision,
    string? CandidateId,
    string? Reason);

public sealed record FederatedCandidateSelectionRequest(
    string SchemaVersion,
    string ParentJobId,
    IReadOnlyList<SourceCandidateSelection> Selections,
    string? SelectedBy = null);

public sealed record FederatedCandidateSelectionResult(
    string SchemaVersion,
    string ParentJobId,
    SelectionState State,
    IReadOnlyList<SourceCandidateSelection> Selections,
    IReadOnlyList<StructuredError> Errors,
    DateTimeOffset RecordedAt);
