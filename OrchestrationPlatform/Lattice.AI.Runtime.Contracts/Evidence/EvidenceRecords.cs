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
    string AuthorizationDecisionId,
    string? CitationId = null,
    string? Authority = null,
    string? Provider = null,
    DateTimeOffset? ObservedAt = null);

public sealed record RelationshipEvidence(
    string RelationshipId,
    string SourceEntityId,
    string TargetEntityId,
    string RelationshipType,
    string? Explanation,
    IReadOnlyList<string> EvidenceIds,
    string? ForwardMeaning = null,
    string? InverseMeaning = null,
    string? Status = null,
    string? Strength = null,
    IReadOnlyList<string>? CitationIds = null);

public sealed record ImpactPathEvidence(
    string PathId,
    IReadOnlyList<string> EntityIds,
    IReadOnlyList<string> RelationshipIds,
    IReadOnlyList<ImpactPathStep>? Steps = null,
    IReadOnlyList<string>? Meanings = null,
    string? Status = null,
    string? Strength = null,
    bool? ImpactEligible = null,
    IReadOnlyList<string>? CitationIds = null);

public sealed record ImpactPathStep(
    string RelationshipId,
    string FromEntityId,
    string ToEntityId,
    string Traversal,
    string Type,
    string Meaning);

public sealed record ImpactChainEvidence(
    string ChainId,
    string SourceEntityId,
    string ImpactedEntityId,
    IReadOnlyList<string> RelationshipIds,
    IReadOnlyList<ImpactPathStep> RelationshipSequence,
    IReadOnlyList<string> SupportingEvidenceIds,
    IReadOnlyList<string> CitationIds,
    string EngineeringExplanation,
    double Confidence,
    string ImpactRationale,
    string Status,
    string Strength);

public sealed record EvidenceRetrievalResult(
    string InvestigationId,
    IReadOnlyList<RelationshipEvidence> Relationships,
    IReadOnlyList<ImpactPathEvidence> Paths,
    IReadOnlyList<ImpactChainEvidence> Chains,
    IReadOnlyList<EvidenceSourceReference> Sources,
    string SourceVersion,
    string OntologyVersion,
    string AuthorizationDecisionId,
    string RequestId,
    string TraceId);
