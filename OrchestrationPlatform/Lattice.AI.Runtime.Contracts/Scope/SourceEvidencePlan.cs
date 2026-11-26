namespace Lattice.AI.Runtime.Contracts.Scope;

public sealed record SourceEvidencePlan(
    bool Requested,
    IReadOnlyList<string> LinkedEntityIds,
    IReadOnlyList<string> SourceApplications,
    IReadOnlyList<string> ExactIdentifiers,
    string ReasonCode);
