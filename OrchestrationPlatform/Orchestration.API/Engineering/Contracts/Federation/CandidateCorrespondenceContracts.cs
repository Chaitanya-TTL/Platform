namespace Orchestration.API.Engineering.Contracts;

public enum CorrespondenceReviewState { Unreviewed, SystemVerified, Accepted, Rejected, Ambiguous }

public sealed record CorrespondenceEvidence(string Kind, string Detail, EngineeringSource? Source = null);

public sealed record CandidateCorrespondence(
    string CorrespondenceId,
    IReadOnlyList<string> SourceCandidateIds,
    MatchCategory Category,
    string Reason,
    IReadOnlyList<CorrespondenceEvidence> Evidence,
    ConfidenceClass ConfidenceClass,
    CorrespondenceReviewState ReviewState,
    IReadOnlyList<string> Conflicts,
    DateTimeOffset CreatedAt);
