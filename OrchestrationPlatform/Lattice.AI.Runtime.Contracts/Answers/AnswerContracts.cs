using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Contracts.Answers;

public sealed record AnswerCandidate(
    string Summary,
    IReadOnlyList<AnswerImpact> Impacts,
    IReadOnlyList<string> Warnings);

public sealed record AnswerImpact(
    string ClaimId,
    string Explanation,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> SourceIds);

public sealed record ValidationIssue(string Code, string Message, string? ClaimId = null);

public enum AnswerDisposition
{
    Answer,
    Clarify,
    Abstain,
    Deny,
    Failed
}

public enum ValidationDisposition
{
    Accept,
    Clarify,
    Abstain,
    Reject
}

public sealed record ImpactAnswerResult(
    RuntimeRequestContext RequestContext,
    AnswerDisposition Disposition,
    string? Summary,
    IReadOnlyList<AnswerImpact> Impacts,
    IReadOnlyList<EvidenceSourceReference> Sources,
    IReadOnlyList<ValidationIssue> Issues,
    string? ContextPackageId);
