namespace Lattice.AI.Runtime.Contracts.Requests;

public enum ImpactQuestionType
{
    EngineeringImpact,
    InvestigationQuestion,
    Unsupported
}

public sealed record QuestionInterpretation(
    ImpactQuestionType Type,
    string OriginalQuestion,
    string? CandidateEntityType,
    string? CandidateEntityId,
    string? ChangeScenario,
    IReadOnlyList<string> ClarificationReasons)
{
    public IReadOnlyList<string> RequestedFactFieldIds { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> RequestedSourceApplications { get; init; } = Array.Empty<string>();
    public bool ApplicationContextRequested { get; init; }
}
