using Lattice.AI.Runtime.Contracts.Authorization;
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
