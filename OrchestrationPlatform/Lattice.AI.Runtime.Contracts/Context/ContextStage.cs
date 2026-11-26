namespace Lattice.AI.Runtime.Contracts.Context;

public sealed record ContextStage(
    int Sequence,
    IReadOnlyList<string> CandidateIds,
    ContextPackage Package,
    int EstimatedContextTokens);
