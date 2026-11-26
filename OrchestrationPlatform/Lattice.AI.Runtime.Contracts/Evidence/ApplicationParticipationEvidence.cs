using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Evidence;

public sealed record ApplicationParticipationEvidence(
    string ContractVersion,
    string CandidateId,
    string InvestigationId,
    int SnapshotRevision,
    string SourceApplication,
    IReadOnlyList<string> CanonicalEntityIds,
    string SourceOperation,
    SourceOperationStatus SourceOperationStatus,
    EngineeringFactCompleteness Completeness,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> CitationIds,
    EngineeringFactAuthority SourceAuthority,
    EngineeringFactProvenance Provenance,
    string AuthorizationDecisionId)
{
    public DateTimeOffset? CapturedAt { get; init; }
}

public sealed record ApplicationContextQuery(
    string InvestigationId,
    ResolvedEntity? Subject,
    ApplicationContextPlan Plan,
    string SourceVersion,
    string OntologyVersion,
    AuthorizationContext Authorization,
    RuntimeRequestContext RequestContext);

public sealed record ApplicationContextRetrievalResult(
    string InvestigationId,
    int SnapshotRevision,
    string SourceVersion,
    string OntologyVersion,
    string AuthorizationDecisionId,
    string RequestId,
    string TraceId,
    IReadOnlyList<ApplicationParticipationEvidence> Participations)
{
    public IReadOnlyList<string> AuthoritativeEntityIds { get; init; } = Array.Empty<string>();
}
