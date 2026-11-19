using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Conversation;

public sealed record ConversationState(
    int SchemaVersion,
    string ConversationId,
    string InvestigationId,
    int StateVersion,
    IReadOnlyList<string> CurrentSubjectIds,
    IReadOnlyList<ValidatedEntityReference> CurrentValidatedEntityRefs,
    ConversationApplicationFilters ApplicationFilters,
    IReadOnlyList<string> RelationshipFilters,
    ImpactScope ImpactScope,
    ConversationOutputDimension OutputDimension,
    string? PreviousTurnId,
    string? PreviousContextPackageId,
    int? SnapshotRevision,
    string? SourceVersion,
    string? OntologyVersion,
    string? OwnerFingerprint,
    UnresolvedConversationReference? UnresolvedReference,
    ConversationTurnDisposition? LastTurnDisposition,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset ExpiresAt);

public sealed record ValidatedEntityReference(
    string CanonicalId,
    string EntityKind,
    string Application);

public sealed record ConversationApplicationFilters(
    IReadOnlyList<string> SourceApplications,
    IReadOnlyList<string> TargetApplications);

public sealed record UnresolvedConversationReference(
    string ReasonCode,
    IReadOnlyList<string> CandidateCanonicalIds,
    DateTimeOffset CreatedAt);

public enum ConversationOutputDimension
{
    Impact,
    Ownership,
    Explanation,
    Comparison
}

public enum ConversationTurnDisposition
{
    Answer,
    Clarify,
    Abstain,
    Deny,
    Unavailable,
    Failed
}

public enum ConversationTurnType
{
    NewImpactQuestion,
    FollowUpFilter,
    FollowUpRestriction,
    FollowUpExpansion,
    FollowUpOwnershipQuestion,
    FollowUpExplanation,
    FollowUpComparison,
    ClarificationResponse,
    Unsupported
}

public sealed record ConversationFilterDelta(
    IReadOnlyList<string>? RequestedSourceApplications,
    IReadOnlyList<string>? RequestedTargetApplications,
    IReadOnlyList<string>? RequestedRelationshipTerms,
    int? MaxHops,
    DateTimeOffset? AsOf);

public sealed record ConversationClarification(
    string ReasonCode,
    string Question,
    IReadOnlyList<ValidatedEntityReference> CandidateReferences,
    int StateVersion,
    string ExpectedNextTurnAction);
