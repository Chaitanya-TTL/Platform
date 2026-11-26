using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Telemetry;

public static class CopilotExecutionTraceEventFactory
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static CopilotExecutionTraceEvent Create(
        RuntimeRequestContext requestContext,
        string eventName,
        string stage,
        string? investigationId,
        int? snapshotRevision,
        string? outcome = null,
        long? durationMs = null,
        object? input = null,
        object? output = null,
        object? fullPayload = null,
        object? diagnostics = null,
        string? payloadRef = null,
        IReadOnlyList<JsonElement>? transformations = null,
        IReadOnlyList<string>? itemsAdded = null,
        IReadOnlyList<string>? itemsRemoved = null,
        IReadOnlyList<string>? rejectionReasons = null)
    {
        ArgumentNullException.ThrowIfNull(requestContext);

        return new CopilotExecutionTraceEvent(
            "1",
            eventName,
            stage,
            requestContext.RouteSource,
            requestContext.FullPayloadTraceEnabled ? "full" : "summary",
            DateTimeOffset.UtcNow,
            requestContext.RequestId,
            requestContext.TraceId,
            investigationId,
            snapshotRevision ?? requestContext.SnapshotRevision,
            durationMs,
            outcome,
            Serialize(input),
            Serialize(output),
            transformations ?? [],
            itemsAdded ?? [],
            itemsRemoved ?? [],
            rejectionReasons ?? [],
            payloadRef,
            requestContext.FullPayloadTraceEnabled ? Serialize(fullPayload) : null,
            Serialize(diagnostics));
    }

    private static JsonElement? Serialize(object? value) =>
        value is null ? null : JsonSerializer.SerializeToElement(value, JsonOptions);
}
