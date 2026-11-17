namespace Lattice.AI.Runtime.Contracts.Evidence;

public sealed record EvidenceSourceReference(
    string EvidenceId,
    string SourceType,
    string SourceSystem,
    string RecordId,
    string? Revision,
    string? Location,
    string? DeepLink,
    string ProvenanceId,
    string AuthorizationDecisionId);

public sealed record RelationshipEvidence(
    string RelationshipId,
    string SourceEntityId,
    string TargetEntityId,
    string RelationshipType,
    string? Explanation,
    IReadOnlyList<string> EvidenceIds);

public sealed record ImpactPathEvidence(
    string PathId,
    IReadOnlyList<string> EntityIds,
    IReadOnlyList<string> RelationshipIds);

public sealed record EvidenceRetrievalResult(
    IReadOnlyList<RelationshipEvidence> Relationships,
    IReadOnlyList<ImpactPathEvidence> Paths,
    IReadOnlyList<EvidenceSourceReference> Sources,
    string SourceVersion);
