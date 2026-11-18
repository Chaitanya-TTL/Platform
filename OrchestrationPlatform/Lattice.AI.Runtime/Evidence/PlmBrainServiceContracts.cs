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

public sealed record PlmBrainImpactEvidenceResponse(
    string ContractVersion,
    EvidenceRetrievalResult Evidence);
