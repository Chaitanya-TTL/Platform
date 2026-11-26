using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.QuestionUnderstanding;

namespace Lattice.AI.Runtime.Tests.QuestionUnderstanding;

public sealed class QuestionInterpreterTests
{
    private readonly QuestionInterpreter _interpreter = new();

    [Theory]
    [InlineData("What is impacted if Requirement R-123 changes?")]
    [InlineData("If R-123 changes, what could be affected?")]
    [InlineData("Show the downstream impact of R-123.")]
    [InlineData("Which engineering items depend on R-123?")]
    [InlineData("Assess the impact of changing requirement R-123.")]
    public void Interpret_AcceptsExplicitEngineeringImpactQuestions(string question)
    {
        var result = Interpret(question);

        Assert.Equal(ImpactQuestionType.EngineeringImpact, result.Type);
        Assert.Equal("R-123", result.CandidateEntityId);
        Assert.Equal(question, result.OriginalQuestion);
        Assert.Empty(result.ClarificationReasons);
    }

    [Fact]
    public void Interpret_AcceptsAnExplicitReqIdentifier()
    {
        const string question = "What is impacted if Requirement REQ-123 changes?";

        var result = Interpret(question);

        Assert.Equal(ImpactQuestionType.EngineeringImpact, result.Type);
        Assert.Equal("REQ-123", result.CandidateEntityId);
        Assert.Equal(question, result.OriginalQuestion);
        Assert.Empty(result.ClarificationReasons);
    }

    [Fact]
    public void Interpret_ResolvesARegisteredFieldNeedAlongsideImpactIntent()
    {
        var result = Interpret("What is the weight of Requirement R-123 and what is impacted?");

        Assert.Equal(ImpactQuestionType.EngineeringImpact, result.Type);
        Assert.Equal(["windchill.part.weight"], result.RequestedFactFieldIds);
        Assert.Empty(result.RequestedSourceApplications);
        Assert.False(result.ApplicationContextRequested);
    }

    [Fact]
    public void Interpret_RequestsApplicationContextForExplicitSourceSystemIntent()
    {
        var result = Interpret("What impacts of R-123 are represented in SAP?");

        Assert.Equal(ImpactQuestionType.EngineeringImpact, result.Type);
        Assert.Equal(["sap"], result.RequestedSourceApplications);
        Assert.True(result.ApplicationContextRequested);
    }

    [Theory]
    [InlineData("Which systems contributed data?")]
    [InlineData("What applications are connected?")]
    [InlineData("Summarize everything captured in this investigation.")]
    public void Interpret_RequestsApplicationContextForBroadInvestigationCoverage(string question)
    {
        var result = Interpret(question);

        Assert.Equal(ImpactQuestionType.InvestigationQuestion, result.Type);
        Assert.True(result.ApplicationContextRequested);
    }

    [Theory]
    [InlineData("What changes?", ImpactQuestionType.InvestigationQuestion, null)]
    [InlineData("What is impacted?", ImpactQuestionType.EngineeringImpact, null)]
    [InlineData("Tell me about R-123.", ImpactQuestionType.InvestigationQuestion, null)]
    [InlineData("Summarize this investigation.", ImpactQuestionType.InvestigationQuestion, null)]
    [InlineData("What applications are connected?", ImpactQuestionType.InvestigationQuestion, null)]
    [InlineData("Impact R-123 or R-456.", ImpactQuestionType.EngineeringImpact, "multiple possible")]
    [InlineData("What happens if the steering requirement changes?", ImpactQuestionType.EngineeringImpact, null)]
    public void Interpret_AcceptsInvestigationQuestionsWithoutAnExplicitImpactSubject(
        string question,
        ImpactQuestionType expectedType,
        string? expectedReason)
    {
        var result = Interpret(question);

        Assert.Equal(expectedType, result.Type);
        Assert.Equal(question, result.OriginalQuestion);
        if (expectedReason is not null)
        {
            Assert.Contains(
                result.ClarificationReasons,
                reason => reason.Contains(expectedReason, StringComparison.OrdinalIgnoreCase));
        }

        if (question is "What is impacted?" or "What happens if the steering requirement changes?")
        {
            Assert.Null(result.CandidateEntityId);
        }
    }

    [Fact]
    public void Interpret_RequiresAnInvestigationId()
    {
        const string question = "What is impacted if Requirement R-123 changes?";

        var result = _interpreter.Interpret(
            new ImpactAnswerRequest(" ", question),
            RequestContext());

        Assert.Equal(ImpactQuestionType.EngineeringImpact, result.Type);
        Assert.Equal(question, result.OriginalQuestion);
        Assert.Contains(
            result.ClarificationReasons,
            reason => reason.Contains("active investigation", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Interpret_DoesNotRequireAnIdentifierForInvestigationWideImpact()
    {
        const string question = "What happens if the steering requirement changes?";

        var result = Interpret(question);

        Assert.Null(result.CandidateEntityId);
        Assert.Empty(result.ClarificationReasons);
    }

    private QuestionInterpretation Interpret(string question) =>
        _interpreter.Interpret(
            new ImpactAnswerRequest("investigation-1", question),
            RequestContext());

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "4bf92f3577b34da6a3ce929d0e0e4736", null, null);
}
