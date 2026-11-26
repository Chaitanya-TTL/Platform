using Lattice.AI.Runtime.Contracts.Answers;

namespace Lattice.AI.Runtime.Validation;

public sealed record ValidationResult(
    ValidationDisposition Disposition,
    IReadOnlyList<ValidationIssue> Issues)
{
    public IReadOnlyList<ValidationAssertionOutcome> AssertionOutcomes { get; init; } =
        Array.Empty<ValidationAssertionOutcome>();
}

public sealed record ValidationAssertionOutcome(
    string AssertionType,
    string AssertionId,
    bool Supported,
    IReadOnlyList<string> EvidenceIds,
    IReadOnlyList<string> CitationIds,
    IReadOnlyList<string> IssueCodes);
