namespace Lattice.AI.Runtime.Contracts.Context;

public sealed record ApprovedContextPlan(
    ContextPackage Ledger,
    IReadOnlyList<ContextStage> Stages,
    IReadOnlyList<string> OversizedCandidateIds);
