namespace Lattice.AI.Runtime.Contracts.Scope;

public enum EntityResolutionDisposition
{
    Resolved,
    Ambiguous,
    Unresolved,
    Denied
}

public sealed record EntityResolutionResult(
    EntityResolutionDisposition Disposition,
    ResolvedEntity? Entity,
    IReadOnlyList<string> CandidateIds,
    IReadOnlyList<string> Diagnostics);

public sealed record ResolvedEntity(
    string System,
    string EntityType,
    string CanonicalId,
    string DisplayName);
