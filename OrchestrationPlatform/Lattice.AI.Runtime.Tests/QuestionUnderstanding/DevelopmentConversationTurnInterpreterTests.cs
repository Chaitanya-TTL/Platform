using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Orchestration.API.AI.Adapters;

namespace Lattice.AI.Runtime.Tests.QuestionUnderstanding;

public sealed class DevelopmentConversationTurnInterpreterTests
{
    private readonly DevelopmentConversationTurnInterpreter _interpreter = new(
        new ConversationTurnInterpreter());

    [Theory]
    [InlineData("Why?")]
    [InlineData("Explain how Configit, Windchill, SAP, and Codebeamer relate to each other in this investigation.")]
    public async Task InterpretAsync_RoutesSubjectFreeExplanationsToInvestigationQuestions(
        string question)
    {
        var result = await _interpreter.InterpretAsync(
            new ConversationTurnInput(
                question,
                "investigation-1",
                "conversation-1",
                "turn-2",
                "turn-1",
                BroadPriorState()),
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(ConversationTurnType.Unsupported, result.Type);
        Assert.Empty(result.ReferenceCandidateIds);
        Assert.False(result.ClarificationRequired);
        Assert.Empty(result.ReasonCodes);
    }

    [Fact]
    public async Task InterpretAsync_PreservesExplanationFollowUpWithValidatedSubject()
    {
        var result = await _interpreter.InterpretAsync(
            new ConversationTurnInput(
                "Why is it impacted?",
                "investigation-1",
                "conversation-1",
                "turn-2",
                "turn-1",
                SubjectPriorState()),
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(ConversationTurnType.FollowUpExplanation, result.Type);
        Assert.Equal(["part-17"], result.ReferenceCandidateIds);
        Assert.False(result.ClarificationRequired);
    }

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "trace-1", null, "conversation-1")
        {
            TurnId = "turn-2"
        };

    private static ConversationState BroadPriorState() => CreatePriorState([], []);

    private static ConversationState SubjectPriorState() =>
        CreatePriorState(
            ["part-17"],
            [new ValidatedEntityReference("part-17", "Part", "Windchill")]);

    private static ConversationState CreatePriorState(
        IReadOnlyList<string> subjects,
        IReadOnlyList<ValidatedEntityReference> references)
    {
        var now = DateTimeOffset.UtcNow;
        return new ConversationState(
            1,
            "conversation-1",
            "investigation-1",
            1,
            subjects,
            references,
            new ConversationApplicationFilters([], []),
            [],
            new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
            ConversationOutputDimension.Explanation,
            "turn-1",
            "context-1",
            1,
            "source-1",
            "ontology-1",
            "owner-fingerprint",
            null,
            ConversationTurnDisposition.Answer,
            now.AddMinutes(-1),
            now,
            now.AddHours(1));
    }
}
