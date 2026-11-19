using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.ScopePlanning;

namespace Lattice.AI.Runtime.Tests.ScopePlanning;

public sealed class ScopePlannerTests
{
    [Fact]
    public void Plan_ReadyUsesBoundedUnfilteredPhaseOneDefaults()
    {
        var result = new ScopePlanner().Plan(
            EngineeringImpactInterpretation(),
            Subject(),
            Authorization(),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Ready, result.Disposition);
        Assert.NotNull(result.Scope);
        Assert.Equal(3, result.Scope.MaxHops);
        Assert.Empty(result.Scope.RelationshipTypes);
        Assert.Empty(result.Scope.SourceSystems);
        Assert.Null(result.Scope.AsOf);

        var diagnostics = string.Join(" ", result.Diagnostics);
        Assert.Contains("3", diagnostics, StringComparison.Ordinal);
        Assert.Contains("hop", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("empty", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("no additional narrowing", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("investigation", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("canonical subject", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("authorization", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("provenance", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("do not authorize access across investigations", diagnostics, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("does not infer", diagnostics, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Plan_ClarifiesUnsupportedInterpretationAndPreservesDiagnostics()
    {
        var diagnostics = new[] { "The question does not describe an engineering-impact request." };
        var interpretation = new QuestionInterpretation(
            ImpactQuestionType.Unsupported,
            "Describe requirement REQ-123.",
            null,
            null,
            null,
            diagnostics);

        var result = new ScopePlanner().Plan(
            interpretation,
            Subject(),
            Authorization(),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Clarify, result.Disposition);
        Assert.Null(result.Scope);
        Assert.Equal(diagnostics, result.Diagnostics);
    }

    [Fact]
    public void Plan_ClarifiesAmbiguousInterpretationAndPreservesDiagnostics()
    {
        var diagnostics = new[] { "The question contains multiple possible subject identifiers." };
        var interpretation = new QuestionInterpretation(
            ImpactQuestionType.EngineeringImpact,
            "What impacts if REQ-123 or REQ-456 changes?",
            null,
            null,
            null,
            diagnostics);

        var result = new ScopePlanner().Plan(
            interpretation,
            Subject(),
            Authorization(),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Clarify, result.Disposition);
        Assert.Null(result.Scope);
        Assert.Equal(diagnostics, result.Diagnostics);
    }

    [Fact]
    public void Plan_ReresolvesOneInheritedReferenceIntoTheExistingBoundedImpactScope()
    {
        var state = ConversationState();
        var turn = ConversationTurn(
            ConversationTurnType.FollowUpExplanation,
            ["part-17"]);

        var result = new ScopePlanner().Plan(
            turn,
            state,
            new ResolvedEntity("windchill", "Part", "part-17", "Housing"),
            new AuthorizationContext(Authorization(), "signed-ticket", DateTimeOffset.UtcNow.AddMinutes(1)),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Ready, result.Disposition);
        Assert.Equal(3, result.Scope?.MaxHops);
        Assert.Empty(result.Scope!.RelationshipTypes);
        Assert.Empty(result.Scope.SourceSystems);
    }

    [Fact]
    public void Plan_AllowsAnExplicitlyResolvedIdentifierInAClarificationResponseWithoutPriorState()
    {
        var turn = new ConversationTurnInterpretation(
            ConversationTurnType.ClarificationResponse,
            ["R-123"],
            ["R-123"],
            new ConversationFilterDelta(null, null, null, null, null),
            ConversationOutputDimension.Impact,
            false,
            [],
            false);

        var result = new ScopePlanner().Plan(
            turn,
            null,
            Subject(),
            new AuthorizationContext(Authorization(), "signed-ticket", DateTimeOffset.UtcNow.AddMinutes(1)),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Ready, result.Disposition);
        Assert.Equal(3, result.Scope?.MaxHops);
    }

    [Fact]
    public void Plan_DoesNotTreatARequestedApplicationAsASourceSystemFilter()
    {
        var turn = ConversationTurn(
            ConversationTurnType.FollowUpFilter,
            ["part-17"],
            targetApplications: ["Teamcenter"]);

        var result = new ScopePlanner().Plan(
            turn,
            ConversationState(),
            new ResolvedEntity("windchill", "Part", "part-17", "Housing"),
            new AuthorizationContext(Authorization(), "signed-ticket", DateTimeOffset.UtcNow.AddMinutes(1)),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Unsupported, result.Disposition);
        Assert.Null(result.Scope);
        Assert.Contains(result.Diagnostics, diagnostic =>
            diagnostic.Contains("PLM evidence contract", StringComparison.Ordinal));
    }

    [Fact]
    public void Plan_RejectsAnInheritedSubjectNotPresentInStructuredState()
    {
        var turn = ConversationTurn(
            ConversationTurnType.FollowUpExplanation,
            ["part-99"]);

        var result = new ScopePlanner().Plan(
            turn,
            ConversationState(),
            new ResolvedEntity("windchill", "Part", "part-99", "Unvalidated part"),
            new AuthorizationContext(Authorization(), "signed-ticket", DateTimeOffset.UtcNow.AddMinutes(1)),
            RequestContext());

        Assert.Equal(ScopePlanningDisposition.Clarify, result.Disposition);
        Assert.Null(result.Scope);
    }

    private static ConversationState ConversationState() =>
        new(
            1,
            "conversation-1",
            "investigation-1",
            1,
            ["part-17"],
            [new ValidatedEntityReference("part-17", "Part", "Windchill")],
            new ConversationApplicationFilters([], []),
            [],
            new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
            ConversationOutputDimension.Impact,
            "turn-1",
            "context-1",
            1,
            "source-1",
            "ontology-1",
            "owner-fingerprint",
            null,
            ConversationTurnDisposition.Answer,
            DateTimeOffset.UtcNow.AddMinutes(-2),
            DateTimeOffset.UtcNow.AddMinutes(-1),
            DateTimeOffset.UtcNow.AddHours(1));

    private static ConversationTurnInterpretation ConversationTurn(
        ConversationTurnType type,
        IReadOnlyList<string> references,
        IReadOnlyList<string>? targetApplications = null) =>
        new(
            type,
            [],
            references,
            new ConversationFilterDelta(null, targetApplications, null, null, null),
            ConversationOutputDimension.Impact,
            false,
            [],
            false);

    private static QuestionInterpretation EngineeringImpactInterpretation() =>
        new(
            ImpactQuestionType.EngineeringImpact,
            "What impacts if REQ-123 changes?",
            null,
            "REQ-123",
            null,
            []);

    private static ResolvedEntity Subject() =>
        new("plm", "Requirement", "REQ-123", "Requirement REQ-123");

    private static AuthorizationScope Authorization() =>
        new(
            "tenant-1",
            "subject-1",
            "policy-v1",
            "decision-1",
            new HashSet<string>(StringComparer.Ordinal),
            DateTimeOffset.UtcNow.AddMinutes(1));

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "trace-1", null, "conversation-1");
}
