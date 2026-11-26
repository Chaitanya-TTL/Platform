using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Evidence;

public sealed record SourceEvidencePassage(
    string PassageId,
    string ParentRecordId,
    string InvestigationId,
    int SnapshotRevision,
    string SourceApplication,
    string SourceRecordId,
    IReadOnlyList<string> CanonicalEntityIds,
    string? SourceRevision,
    string Location,
    string Text,
    IReadOnlyList<string> EvidenceIds,
    string ProvenanceId,
    string AuthorizationDecisionId,
    string Freshness,
    string RetrievalMethod,
    double RetrievalScore,
    string? IndexSchemaVersion,
    string? EmbeddingModelVersion)
{
    public string? DeepLink { get; init; }
    public string? SourceFieldName { get; init; }
    public IReadOnlyList<string> CitationIds { get; init; } = Array.Empty<string>();
    public string? SourceTimestamp { get; init; }
    public string? CapturedAt { get; init; }
    public string? EffectiveAt { get; init; }
    public string? ValidFrom { get; init; }
    public string? ValidTo { get; init; }
    public string? SnapshotLifecycle { get; init; }
    public string? SnapshotCompleteness { get; init; }
    public IReadOnlyList<string> SourceExtractionStatuses { get; init; } = Array.Empty<string>();
    public IReadOnlyList<SourceEvidenceOperationStatus> SourceOperations { get; init; } =
        Array.Empty<SourceEvidenceOperationStatus>();
    public int? SegmentIndex { get; init; }
    public int? SegmentCount { get; init; }
}

public sealed record SourceEvidenceQuery(
    string InvestigationId,
    ResolvedEntity? Subject,
    IReadOnlyList<string> RelevantEntityIds,
    IReadOnlyList<string> SourceApplications,
    IReadOnlyList<string> ExactIdentifiers,
    AuthorizationContext Authorization,
    RuntimeRequestContext RequestContext);

public sealed record SourceEvidenceRetrievalResult(
    string InvestigationId,
    int SnapshotRevision,
    string SourceVersion,
    string AuthorizationDecisionId,
    string RequestId,
    string TraceId,
    IReadOnlyList<SourceEvidencePassage> Passages)
{
    public SourceEvidenceRetrievalDiagnostics? Diagnostics { get; init; }
}

public sealed record SourceEvidenceRetrievalDiagnostics(
    string SnapshotLifecycle,
    string SnapshotCompleteness,
    SourceEvidenceProjectionDiagnostics Projection);

public sealed record SourceEvidenceOperationStatus(
    string Operation,
    string Status,
    string? Freshness,
    string? CapturedAt);

public sealed record SourceEvidenceRecord(
    string SchemaVersion,
    string RecordId,
    string? TenantId,
    string InvestigationId,
    int SnapshotRevision,
    string SourceApplication,
    string SourceRecordId,
    IReadOnlyList<string> CanonicalEntityIds,
    string RecordType,
    string Title,
    string SearchableText,
    string Location,
    string? SourceRevision,
    string? SourceTimestamp,
    string? CapturedAt,
    string Freshness,
    string SnapshotLifecycle,
    string SnapshotCompleteness,
    IReadOnlyList<string> SourceExtractionStatuses,
    IReadOnlyList<SourceEvidenceOperationStatus> SourceOperations,
    string ContentHash,
    IReadOnlyList<string> EvidenceIds,
    string ProvenanceId,
    string Authority,
    string? DeepLink)
{
    public string? SourceFieldName { get; init; }
    public IReadOnlyList<string> CitationIds { get; init; } = Array.Empty<string>();
    public string? EffectiveAt { get; init; }
    public string? ValidFrom { get; init; }
    public string? ValidTo { get; init; }
}

public sealed record SourceEvidenceProjectionDiagnostics(
    int CanonicalEntityCount,
    int ProjectedRecordCount,
    IReadOnlyDictionary<string, int> ProjectedRecordsBySource,
    IReadOnlyDictionary<string, int> ExcludedByReason,
    IReadOnlyDictionary<string, int> SourceOperationStatusCounts);

public sealed record SourceEvidenceProjectionBatch(
    string SchemaVersion,
    string InvestigationId,
    int SnapshotRevision,
    string SnapshotLifecycle,
    string SnapshotCompleteness,
    IReadOnlyList<SourceEvidenceRecord> Records,
    SourceEvidenceProjectionDiagnostics Diagnostics);
