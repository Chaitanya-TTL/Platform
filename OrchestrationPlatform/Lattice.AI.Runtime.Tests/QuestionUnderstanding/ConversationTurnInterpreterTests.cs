using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.QuestionUnderstanding;

namespace Lattice.AI.Runtime.Tests.QuestionUnderstanding;

public sealed class ConversationTurnInterpreterTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-19T10:00:00Z");
    private readonly ConversationTurnInterpreter _interpreter = new(
        new FixedTimeProvider(Now));

    public static IEnumerable<object[]> TurnTypes =>
    [
        ["What impacts if R-123 changes?", ConversationTurnType.NewImpactQuestion],
        ["What about only SAP impacts?", ConversationTurnType.FollowUpFilter],
        ["Only operational impacts.", ConversationTurnType.FollowUpRestriction],
        ["Only critical impacts.", ConversationTurnType.FollowUpRestriction],
        ["Show more downstream impacts.", ConversationTurnType.FollowUpExpansion],
        ["Which teams own those materials?", ConversationTurnType.FollowUpOwnershipQuestion],
        ["Why are those materials affected?", ConversationTurnType.FollowUpExplanation],
        ["Compare those two parts.", ConversationTurnType.FollowUpComparison],
        ["I meant the first one.", ConversationTurnType.ClarificationResponse],
        ["Summarize this investigation.", ConversationTurnType.Unsupported]
    ];

    [Theory]
    [MemberData(nameof(TurnTypes))]
    public async Task InterpretAsync_ClassifiesSupportedTurnTypes(
        string question,
        ConversationTurnType expectedType)
    {
        var state = expectedType switch
        {
            ConversationTurnType.NewImpactQuestion or ConversationTurnType.Unsupported => null,
            ConversationTurnType.ClarificationResponse => PriorState(
                disposition: ConversationTurnDisposition.Clarify,
                unresolvedReference: new UnresolvedConversationReference(
                    "multiple-candidates",
                    ["part-17", "part-18"],
                    Now.AddMinutes(-1))),
            ConversationTurnType.FollowUpOwnershipQuestion => PriorState(
                subjects: ["part-17"],
                references:
                [
                    new ValidatedEntityReference("material-20", "Material", "Teamcenter"),
                    new ValidatedEntityReference("part-17", "Part", "Windchill")
                ]),
            ConversationTurnType.FollowUpExplanation => PriorState(
                subjects: ["material-20"],
                references:
                [
                    new ValidatedEntityReference("material-20", "Material", "Teamcenter")
                ]),
            ConversationTurnType.FollowUpComparison => PriorState(
                subjects: ["part-17"],
                references:
                [
                    new ValidatedEntityReference("part-17", "Part", "Windchill"),
                    new ValidatedEntityReference("part-18", "Part", "Teamcenter")
                ]),
            _ => PriorState()
        };

        var result = await Interpret(question, state);

        Assert.Equal(expectedType, result.Type);
    }

    [Theory]
    [InlineData("What about only SAP impacts?", "SAP")]
    [InlineData("What about only Windchill impacts?", "Windchill")]
    [InlineData("What about only Teamcenter application impacts?", "Teamcenter")]
    [InlineData("What about only \"3DEXPERIENCE\" impacts?", "3DEXPERIENCE")]
    [InlineData("What about only windchill impacts?", "windchill")]
    public async Task InterpretAsync_CapturesAnyRequestedApplicationWithoutAWhitelist(
        string question,
        string expectedApplication)
    {
        var result = await Interpret(question, PriorState());

        Assert.Equal(ConversationTurnType.FollowUpFilter, result.Type);
        Assert.Equal([expectedApplication], result.FilterDelta.RequestedTargetApplications);
        Assert.Equal(["part-17"], result.ReferenceCandidateIds);
        Assert.False(result.ClarificationRequired);
    }

    [Fact]
    public async Task InterpretAsync_UsesOnlyTheImmediatelyPriorValidatedSubjectReferences()
    {
        var result = await Interpret("Why is it impacted?", PriorState());

        Assert.Equal(["part-17"], result.ReferenceCandidateIds);
        Assert.Empty(result.ReasonCodes);
        Assert.False(result.ClarificationRequired);
    }

    [Fact]
    public async Task InterpretAsync_ClarifiesWhenPriorTurnHasMultipleSubjects()
    {
        var result = await Interpret("Why are those parts affected?", PriorState(
            subjects: ["part-17", "part-18"],
            references:
            [
                new ValidatedEntityReference("part-17", "Part", "Windchill"),
                new ValidatedEntityReference("part-18", "Part", "Teamcenter")
            ]));

        Assert.Equal(["part-17", "part-18"], result.ReferenceCandidateIds);
        Assert.Contains("multiple-validated-subjects", result.ReasonCodes);
        Assert.True(result.IsAmbiguous);
        Assert.True(result.ClarificationRequired);
    }

    [Theory]
    [InlineData(ConversationTurnDisposition.Abstain)]
    [InlineData(ConversationTurnDisposition.Deny)]
    [InlineData(ConversationTurnDisposition.Unavailable)]
    [InlineData(ConversationTurnDisposition.Failed)]
    public async Task InterpretAsync_DoesNotReuseReferencesFromPriorNonAnswer(
        ConversationTurnDisposition disposition)
    {
        var result = await Interpret("Why is it impacted?", PriorState(disposition: disposition));

        Assert.Empty(result.ReferenceCandidateIds);
        Assert.Contains("no-eligible-prior-answer-state", result.ReasonCodes);
        Assert.True(result.ClarificationRequired);
    }

    [Fact]
    public async Task InterpretAsync_DoesNotReuseExpiredOrCrossScopeState()
    {
        var expired = await Interpret("Why is it impacted?", PriorState(
            expiresAt: Now.AddSeconds(-1)));
        var mismatchedInvestigation = await Interpret("Why is it impacted?", PriorState(
            investigationId: "another-investigation"));
        var mismatchedConversation = await Interpret("Why is it impacted?", PriorState(
            conversationId: "another-conversation"));
        var mismatchedParentTurn = await Interpret(
            "Why is it impacted?",
            PriorState(),
            parentTurnId: "turn-older");

        Assert.Empty(expired.ReferenceCandidateIds);
        Assert.Empty(mismatchedInvestigation.ReferenceCandidateIds);
        Assert.Empty(mismatchedConversation.ReferenceCandidateIds);
        Assert.Empty(mismatchedParentTurn.ReferenceCandidateIds);
    }

    [Fact]
    public async Task InterpretAsync_PrefersExplicitIdentifiersOverCarriedReferences()
    {
        var result = await Interpret("What impacts if R-456 changes?", PriorState());

        Assert.Equal(ConversationTurnType.NewImpactQuestion, result.Type);
        Assert.Equal(["R-456"], result.ExplicitIdentifiers);
        Assert.Equal(["R-456"], result.ReferenceCandidateIds);
    }

    [Theory]
    [InlineData("I meant the first one.", "part-17")]
    [InlineData("I meant the second one.", "part-18")]
    public async Task InterpretAsync_UsesAnExplicitClarificationChoiceFromStructuredCandidates(
        string question,
        string selectedId)
    {
        var state = PriorState(
            disposition: ConversationTurnDisposition.Clarify,
            unresolvedReference: new UnresolvedConversationReference(
                "multiple-candidates",
                ["part-17", "part-18"],
                Now.AddMinutes(-1)));

        var result = await Interpret(question, state);

        Assert.Equal(ConversationTurnType.ClarificationResponse, result.Type);
        Assert.Equal([selectedId], result.ReferenceCandidateIds);
        Assert.False(result.IsAmbiguous);
        Assert.False(result.ClarificationRequired);
    }

    [Fact]
    public async Task InterpretAsync_LeavesUnrecognizedOntologyTermsUnmapped()
    {
        var result = await Interpret("Only operational impacts.", PriorState());

        Assert.Equal(ConversationTurnType.FollowUpRestriction, result.Type);
        Assert.Equal(["operational"], result.FilterDelta.RequestedRelationshipTerms);
        Assert.Contains("filter-term-requires-current-ontology-validation", result.ReasonCodes);
    }

    [Fact]
    public async Task InterpretAsync_DoesNotTreatCriticalityAsAnApplicationOrOntologyValue()
    {
        var result = await Interpret("Only critical impacts.", PriorState());

        Assert.Equal(ConversationTurnType.FollowUpRestriction, result.Type);
        Assert.Null(result.FilterDelta.RequestedTargetApplications);
        Assert.Null(result.FilterDelta.RequestedRelationshipTerms);
        Assert.Contains("criticality-requires-governed-definition", result.ReasonCodes);
        Assert.DoesNotContain("filter-term-requires-current-ontology-validation", result.ReasonCodes);
    }

    private Task<ConversationTurnInterpretation> Interpret(
        string question,
        ConversationState? state,
        string? parentTurnId = "turn-1") =>
        _interpreter.InterpretAsync(
            new ConversationTurnInput(
                question,
                "investigation-1",
                "conversation-1",
                "turn-2",
                parentTurnId,
                state),
            new RuntimeRequestContext("request-1", "trace-1", null, "conversation-1")
            {
                TurnId = "turn-2"
            },
            CancellationToken.None);

    private static ConversationState PriorState(
        IReadOnlyList<string>? subjects = null,
        IReadOnlyList<ValidatedEntityReference>? references = null,
        ConversationTurnDisposition disposition = ConversationTurnDisposition.Answer,
        DateTimeOffset? expiresAt = null,
        string investigationId = "investigation-1",
        string conversationId = "conversation-1",
        UnresolvedConversationReference? unresolvedReference = null) =>
        new(
            1,
            conversationId,
            investigationId,
            1,
            subjects ?? ["part-17"],
            references ?? [new ValidatedEntityReference("part-17", "Part", "Windchill")],
            new ConversationApplicationFilters([], []),
            [],
            new Lattice.AI.Runtime.Contracts.Scope.ImpactScope(
                new HashSet<string>(),
                3,
                new HashSet<string>(),
                null),
            ConversationOutputDimension.Impact,
            "turn-1",
            "context-1",
            1,
            "source-1",
            "ontology-1",
            "owner-fingerprint",
            unresolvedReference,
            disposition,
            Now.AddMinutes(-1),
            Now.AddMinutes(-1),
            expiresAt ?? Now.AddHours(1));

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
