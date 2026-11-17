namespace Lattice.AI.Runtime.Contracts.Scope;

public enum ScopePlanningDisposition
{
    Ready,
    Clarify,
    Unsupported,
    Denied
}

public sealed record ScopePlanningResult(
    ScopePlanningDisposition Disposition,
    ImpactScope? Scope,
    IReadOnlyList<string> Diagnostics);
