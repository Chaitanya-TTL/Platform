namespace Lattice.AI.Runtime.Contracts.Scope;

public sealed record FactEvidencePlan(
    bool Requested,
    IReadOnlyList<string> LinkedEntityIds,
    IReadOnlyList<string> SourceApplications,
    IReadOnlyList<string> FieldIds,
    IReadOnlyList<string> ExactIdentifiers,
    string ReasonCode);
