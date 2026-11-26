using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Evidence;

public enum EngineeringFactValueType
{
    Scalar,
    Text,
    Boolean,
    Date,
    Status,
    Identifier,
    Quantity,
    Money,
    List,
    Structured
}

public enum EngineeringFactRole
{
    EntityIdentity,
    EntityAttribute,
    Metric,
    Transaction,
    TransactionDelta,
    SnapshotBalance,
    DerivedValue
}

public enum EngineeringFactFreshness
{
    Current,
    Stale,
    Unknown,
    NotApplicable
}

public enum EngineeringFactCompleteness
{
    Complete,
    Partial,
    Unknown,
    NotApplicable
}

public enum EngineeringFactDerivationStatus
{
    Raw,
    Normalized,
    Fallback,
    Derived
}

public enum EngineeringFactAuthority
{
    SourceAuthoritative,
    BackendDerived,
    FrontendDerived,
    PocSynthetic,
    Hardcoded,
    Mocked,
    Unavailable
}

public enum SourceCoverageStatus
{
    Available,
    Partial,
    Unavailable,
    Failed,
    Cancelled,
    TimedOut,
    CapabilityLimited,
    NotObserved
}

public enum SourceOperationStatus
{
    Requested,
    Running,
    Succeeded,
    Partial,
    Empty,
    Failed,
    TimedOut,
    Cancelled,
    Unavailable,
    NotObserved
}

public sealed record EngineeringFactDimension(
    string DimensionId,
    string Label,
    JsonElement ExactValue,
    EngineeringFactValueType ValueType,
    string? Unit);

public sealed record EngineeringFactTransformation(
    string RuleId,
    string RuleVersion,
    string Operation,
    string? InputType,
    string? OutputType,
    bool Reversible);

public sealed record EngineeringFactProvenance(
    string? Source,
    string Provider,
    string? NativeId,
    string? NativeRevision,
    string? SourceExecutionId,
    string? ArtifactReference,
    string? Checksum,
    DateTimeOffset ObservedAt,
    EngineeringFactAuthority Authority);

public sealed record EngineeringFactEvidence(
    string ContractVersion,
    string FactId,
    string InvestigationId,
    int SnapshotRevision,
    string SourceApplication,
    string SourceEntityId,
    string CanonicalEntityKind,
    string FieldId,
    string SourceFieldName,
    string DisplayLabel,
    EngineeringFactRole FactRole,
    JsonElement ExactSourceValue,
    EngineeringFactValueType SourceValueType,
    EngineeringFactValueType ValueType,
    JsonElement? NormalizedValue,
    EngineeringFactValueType? NormalizedValueType,
    string? Unit,
    string? Currency,
    int? Precision,
    IReadOnlyList<EngineeringFactDimension> Dimensions,
    DateTimeOffset? ObservedAt,
    DateTimeOffset? ExtractedAt,
    DateTimeOffset? CapturedAt,
    DateTimeOffset? EffectiveAt,
    DateTimeOffset? ValidFrom,
    DateTimeOffset? ValidTo,
    EngineeringFactFreshness Freshness,
    EngineeringFactCompleteness Completeness,
    EngineeringFactDerivationStatus DerivationStatus,
    string? DerivationRuleId,
    IReadOnlyList<EngineeringFactTransformation> TransformationTrace,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> CitationIds,
    bool CitationEligible,
    EngineeringFactAuthority SourceAuthority,
    EngineeringFactProvenance Provenance,
    string AuthorizationDecisionId)
{
    public int? InvestigationRevision { get; init; }
    public string? SubjectId { get; init; }
    public string? SourceNativeId { get; init; }
    public string? NativeRecordKind { get; init; }
}

public sealed record FactEvidenceQuery(
    string InvestigationId,
    ResolvedEntity? Subject,
    FactEvidencePlan Plan,
    string SourceVersion,
    string OntologyVersion,
    AuthorizationContext Authorization,
    RuntimeRequestContext RequestContext);

public sealed record FactEvidenceRetrievalResult(
    string InvestigationId,
    int SnapshotRevision,
    string SourceVersion,
    string OntologyVersion,
    string AuthorizationDecisionId,
    string RequestId,
    string TraceId,
    IReadOnlyList<EngineeringFactEvidence> Facts)
{
    public IReadOnlyList<string> AuthoritativeEntityIds { get; init; } = Array.Empty<string>();
}
