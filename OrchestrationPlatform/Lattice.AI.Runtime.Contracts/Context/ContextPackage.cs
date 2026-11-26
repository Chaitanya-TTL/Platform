using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Context;

public sealed record ContextPackage(
    RuntimeRequestContext RequestContext,
    string InvestigationId,
    string PackageId,
    string SchemaVersion,
    string CompilerVersion,
    string AuthorizationDecisionId,
    ResolvedEntity? Subject,
    ImpactScope Scope,
    IReadOnlyList<ImpactClaim> Claims,
    IReadOnlyList<EvidenceSourceReference> Sources,
    IReadOnlyList<ContextOmission> Omissions)
{
    public IReadOnlyList<SourceEvidencePassage> SourceEvidencePassages { get; init; } =
        Array.Empty<SourceEvidencePassage>();
    public IReadOnlyList<EngineeringFactEvidence> EngineeringFacts { get; init; } =
        Array.Empty<EngineeringFactEvidence>();
    public IReadOnlyList<ApplicationParticipationEvidence> ApplicationParticipation { get; init; } =
        Array.Empty<ApplicationParticipationEvidence>();
    public SourceEvidenceRetrievalDiagnostics? SourceEvidenceDiagnostics { get; init; }
}

public enum ContextOmissionKind
{
    Claim,
    SourceEvidencePassage,
    EngineeringFact,
    ApplicationParticipation
}

public sealed record ContextOmission(string ClaimId, string Reason)
{
    public ContextOmissionKind Kind { get; init; } = ContextOmissionKind.Claim;
}

public enum CompilationDisposition
{
    Ready,
    Empty,
    InsufficientEvidence,
    Denied,
    ContextWindowExceeded
}

public sealed record ContextCompilationResult(
    ContextPackage? Package,
    CompilationDisposition Disposition,
    IReadOnlyList<string> Diagnostics)
{
    public ApprovedContextPlan? ApprovedPlan { get; init; }
    public IReadOnlyList<ContextCandidateDecision> CandidateDecisions { get; init; } =
        Array.Empty<ContextCandidateDecision>();
}

public sealed record ContextCandidateDecision(
    string CandidateType,
    string CandidateId,
    string? SourceApplication,
    string? Authority,
    string? Freshness,
    IReadOnlyList<string> CitationIds,
    IReadOnlyList<string> EvidenceIds,
    string? Provenance,
    bool Approved,
    string? ReasonCode,
    string? Reason);

public sealed record ImpactClaim(
    string ClaimId,
    string Statement,
    IReadOnlyList<string> EntityIds,
    IReadOnlyList<string> RelationshipIds,
    IReadOnlyList<string> EvidenceIds,
    string? Rationale,
    double? Confidence = null);
