namespace Lattice.AI.Runtime.ContextCompilation;

public sealed record ContextBudget(int MaxClaims, int MaxEvidenceItems, int MaxEstimatedContextTokens);
