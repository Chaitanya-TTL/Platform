using Lattice.AI.Runtime.Telemetry;

namespace Orchestration.API.AI.Telemetry;

public sealed class CopilotExecutionTraceNoOp : ICopilotExecutionTrace
{
    public static CopilotExecutionTraceNoOp Instance { get; } = new();

    private CopilotExecutionTraceNoOp()
    {
    }

    public void Write(CopilotExecutionTraceEvent traceEvent)
    {
    }
}
