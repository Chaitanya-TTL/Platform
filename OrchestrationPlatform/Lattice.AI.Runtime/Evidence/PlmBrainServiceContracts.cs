using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Evidence;

public static class PlmBrainServiceContract
{
    public const string Version = "1.0";
    public const string EntityResolutionGrant = "investigation:resolve-entity";
    public const string ImpactEvidenceGrant = "investigation:read-impact-evidence";
}

public sealed record PlmBrainResolveEntityRequest(string CandidateEntityId);

public sealed record PlmBrainEntityResolutionResponse(
    string ContractVersion,
    string InvestigationId,
    string RequestId,
    string TraceId,
    EntityResolutionDisposition Disposition,
    ResolvedEntity? Entity,
    IReadOnlyList<string> CandidateIds,
    IReadOnlyList<string> Diagnostics);

public sealed record PlmBrainImpactEvidenceRequest(
    string SubjectEntityId,
    ImpactScope Scope);

public sealed record PlmBrainInvestigationEvidenceRequest;

public sealed record PlmBrainImpactEvidenceResponse(
    string ContractVersion,
    EvidenceRetrievalResult Evidence);

public sealed record PlmBrainFactEvidenceRequest(
    FactEvidencePlan Plan,
    string SourceVersion,
    string OntologyVersion);

public sealed record PlmBrainFactEvidenceResponse(
    string ContractVersion,
    FactEvidenceRetrievalResult Evidence);

public sealed record PlmBrainApplicationContextRequest(
    ApplicationContextPlan Plan,
    string SourceVersion,
    string OntologyVersion);

public sealed record PlmBrainApplicationContextResponse(
    string ContractVersion,
    ApplicationContextRetrievalResult Evidence);

public sealed record PlmBrainSourceEvidenceRequest(
    IReadOnlyList<string> SourceApplications,
    IReadOnlyList<string> RelevantEntityIds,
    IReadOnlyList<string> ExactIdentifiers);

public sealed record PlmBrainSourceEvidenceResponse(
    string ContractVersion,
    string InvestigationId,
    int SnapshotRevision,
    string SourceVersion,
    string AuthorizationDecisionId,
    string RequestId,
    string TraceId,
    IReadOnlyList<SourceEvidenceRecord> Records,
    SourceEvidenceProjectionDiagnostics Diagnostics)
{
    public string? SnapshotLifecycle { get; init; }
    public string? SnapshotCompleteness { get; init; }
}
