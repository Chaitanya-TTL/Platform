using Lattice.AI.Runtime.Contracts.Answers;

namespace Lattice.AI.Runtime.Validation;

public sealed record ValidationResult(
    ValidationDisposition Disposition,
    IReadOnlyList<ValidationIssue> Issues);
