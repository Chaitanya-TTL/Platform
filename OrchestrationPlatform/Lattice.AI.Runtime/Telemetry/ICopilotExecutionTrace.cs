namespace Lattice.AI.Runtime.Telemetry;

public interface ICopilotExecutionTrace
{
    void Write(CopilotExecutionTraceEvent traceEvent);
}
