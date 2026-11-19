namespace Lattice.AI.Runtime.Contracts.Requests;

public enum ImpactQuestionType
{
    EngineeringImpact,
    Unsupported
}

public sealed record QuestionInterpretation(
    ImpactQuestionType Type,
    string OriginalQuestion,
    string? CandidateEntityType,
    string? CandidateEntityId,
    string? ChangeScenario,
    IReadOnlyList<string> ClarificationReasons);
