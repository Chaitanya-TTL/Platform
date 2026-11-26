namespace Lattice.AI.Runtime.Contracts.Scope;

public sealed record ApplicationContextPlan(
    bool Requested,
    IReadOnlyList<string> LinkedEntityIds,
    IReadOnlyList<string> SourceApplications,
    string ReasonCode);
