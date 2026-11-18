using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Tests.QuestionUnderstanding;

public sealed class QuestionPlanningTests
{
    private readonly QuestionInterpreter _interpreter = new();

    [Fact]
    public void Interpret_ExtractsOnlyAnExplicitEntityIdentifier()
    {
        var result = _interpreter.Interpret(
            new ImpactAnswerRequest("investigation-1", "What changes if ABC-123 is revised?"),
            RequestContext());

        Assert.Equal(ImpactQuestionType.EngineeringImpact, result.Type);
        Assert.Equal("ABC-123", result.CandidateEntityId);
        Assert.Empty(result.ClarificationReasons);
    }

    [Fact]
    public void Interpret_RequiresActiveInvestigationAndExplicitIdentifier()
    {
        var result = _interpreter.Interpret(
            new ImpactAnswerRequest(" ", "What is affected?"),
            RequestContext());

        Assert.Null(result.CandidateEntityId);
        Assert.Contains(result.ClarificationReasons, reason => reason.Contains("active investigation"));
        Assert.Contains(result.ClarificationReasons, reason => reason.Contains("explicit requirement"));
    }

    [Fact]
    public void Interpret_ClarifiesWhenQuestionContainsMultiplePossibleSubjects()
    {
        var result = _interpreter.Interpret(
            new ImpactAnswerRequest("investigation-1", "Does ABC-123 affect XYZ-987?"),
            RequestContext());

        Assert.Null(result.CandidateEntityId);
        Assert.Contains(result.ClarificationReasons, reason => reason.Contains("multiple possible"));
    }

    [Fact]
    public void Plan_UsesBoundedImpactScopeOnlyAfterExplicitResolution()
    {
        var scope = new ScopePlanner().Plan(
            new QuestionInterpretation(
                ImpactQuestionType.EngineeringImpact,
                "What changes if ABC-123 is revised?",
                null,
                "ABC-123",
                null,
                Array.Empty<string>()),
            new ResolvedEntity("windchill", "Part", "part-123", "Part"),
            new AuthorizationScope("tenant-1", "subject-1", "policy-1", "decision-1",
                new HashSet<string> { "investigation:read-impact-evidence" },
                DateTimeOffset.UtcNow.AddMinutes(1)),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Ready, scope.Disposition);
        Assert.Equal(3, scope.Scope?.MaxHops);
    }

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "4bf92f3577b34da6a3ce929d0e0e4736", null, null);
}
