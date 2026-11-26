using System.Text.Json;

namespace Lattice.AI.Runtime.Telemetry;

public sealed record CopilotExecutionTraceEvent(
    string SchemaVersion,
    string Event,
    string Stage,
    string RouteSource,
    string PayloadDetail,
    DateTimeOffset TimestampUtc,
    string RequestId,
    string TraceId,
    string? InvestigationId,
    int? SnapshotRevision,
    long? DurationMs,
    string? Outcome,
    JsonElement? Input,
    JsonElement? Output,
    IReadOnlyList<JsonElement> Transformations,
    IReadOnlyList<string> ItemsAdded,
    IReadOnlyList<string> ItemsRemoved,
    IReadOnlyList<string> RejectionReasons,
    string? PayloadRef,
    JsonElement? FullPayload,
    JsonElement? Diagnostics);
