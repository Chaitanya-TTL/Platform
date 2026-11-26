using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Contracts.Answers;

public sealed record AnswerCandidate(
    string Summary,
    IReadOnlyList<AnswerImpact> Impacts,
    IReadOnlyList<string> Warnings)
{
    public IReadOnlyList<AnswerFactAssertion> Facts { get; init; } =
        Array.Empty<AnswerFactAssertion>();
    public IReadOnlyList<AnswerApplicationContextAssertion> ApplicationContexts { get; init; } =
        Array.Empty<AnswerApplicationContextAssertion>();
    public IReadOnlyList<AnswerSourceEvidenceAssertion> SourceEvidence { get; init; } =
        Array.Empty<AnswerSourceEvidenceAssertion>();
}

public sealed record AnswerImpact(
    string ClaimId,
    string Explanation,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> SourceIds);

public sealed record AnswerFactAssertion(
    string FactId,
    JsonElement ExactValue,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> SourceIds)
{
    public string ExactValueJson => ExactValue.GetRawText();
}

public sealed record AnswerApplicationContextAssertion(
    string CandidateId,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> SourceIds);

public sealed record AnswerSourceEvidenceAssertion(
    string PassageId,
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
    string InvestigationId,
    RuntimeRequestContext RequestContext,
    AnswerDisposition Disposition,
    string? Summary,
    IReadOnlyList<AnswerImpact> Impacts,
    IReadOnlyList<EvidenceSourceReference> Sources,
    IReadOnlyList<ValidationIssue> Issues,
    string? ContextPackageId)
{
    public string SemanticSupportStatus { get; init; } = "not-evaluated";
    public ConversationState? ContinuationState { get; init; }
    public ConversationClarification? Clarification { get; init; }
    public IReadOnlyList<AnswerFactAssertion> Facts { get; init; } =
        Array.Empty<AnswerFactAssertion>();
    public IReadOnlyList<AnswerApplicationContextAssertion> ApplicationContexts { get; init; } =
        Array.Empty<AnswerApplicationContextAssertion>();
    public IReadOnlyList<AnswerSourceEvidenceAssertion> SourceEvidence { get; init; } =
        Array.Empty<AnswerSourceEvidenceAssertion>();
}
