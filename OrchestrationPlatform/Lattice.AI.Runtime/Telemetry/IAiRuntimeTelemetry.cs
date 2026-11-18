using System.Diagnostics;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Telemetry;

public interface IAiRuntimeTelemetry
{
    IRuntimeTelemetryStage StartStage(
        string stage,
        RuntimeRequestContext requestContext,
        string? investigationId = null);

    void RecordRequestOutcome(string disposition);

    void RecordValidationDisposition(string disposition);

    void RecordModelUsage(
        string provider,
        string modelConfigurationId,
        int? inputTokens,
        int? outputTokens);
}

public interface IRuntimeTelemetryStage : IDisposable
{
    void SetDisposition(string disposition);

    void SetFailure(string category);

    void SetTag(string name, object? value);
}

public sealed class NullAiRuntimeTelemetry : IAiRuntimeTelemetry
{
    public static NullAiRuntimeTelemetry Instance { get; } = new();

    private NullAiRuntimeTelemetry()
    {
    }

    public IRuntimeTelemetryStage StartStage(
        string stage,
        RuntimeRequestContext requestContext,
        string? investigationId = null) =>
        NullStage.Instance;

    public void RecordRequestOutcome(string disposition)
    {
    }

    public void RecordValidationDisposition(string disposition)
    {
    }

    public void RecordModelUsage(
        string provider,
        string modelConfigurationId,
        int? inputTokens,
        int? outputTokens)
    {
    }

    private sealed class NullStage : IRuntimeTelemetryStage
    {
        public static NullStage Instance { get; } = new();

        public void SetDisposition(string disposition)
        {
        }

        public void SetFailure(string category)
        {
        }

        public void SetTag(string name, object? value)
        {
        }

        public void Dispose()
        {
        }
    }
}
