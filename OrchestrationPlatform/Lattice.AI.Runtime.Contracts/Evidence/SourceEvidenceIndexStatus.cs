using System.Text.Json.Serialization;

namespace Lattice.AI.Runtime.Contracts.Evidence;

[JsonConverter(typeof(JsonStringEnumConverter<SourceEvidenceIndexState>))]
public enum SourceEvidenceIndexState
{
    /// <summary>The revision is accepted for indexing but processing has not started.</summary>
    [JsonStringEnumMemberName("queued")]
    Queued,

    /// <summary>The revision is currently being indexed.</summary>
    [JsonStringEnumMemberName("processing")]
    Processing,

    /// <summary>All eligible evidence for this revision has been indexed.</summary>
    [JsonStringEnumMemberName("complete")]
    Complete,

    /// <summary>Some eligible evidence was indexed, but the revision is not complete.</summary>
    [JsonStringEnumMemberName("partial")]
    Partial,

    /// <summary>An older indexed revision remains available while a newer snapshot is current.</summary>
    [JsonStringEnumMemberName("stale")]
    Stale,

    /// <summary>Indexing this revision failed; this does not imply earlier revisions were removed.</summary>
    [JsonStringEnumMemberName("failed")]
    Failed,

    /// <summary>Indexed evidence for this revision has been removed.</summary>
    [JsonStringEnumMemberName("deleted")]
    Deleted
}

public sealed record SourceEvidenceIndexStatus(
    string SchemaVersion,
    string InvestigationId,
    int SnapshotRevision,
    SourceEvidenceIndexState Status,
    DateTimeOffset UpdatedAt)
{
    public const string CurrentSchemaVersion = "1.0";
}
