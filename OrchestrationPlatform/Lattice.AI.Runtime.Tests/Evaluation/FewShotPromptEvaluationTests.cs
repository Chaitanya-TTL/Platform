using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Evaluation.PromptExperiments;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Tests.Evaluation;

public sealed class FewShotPromptEvaluationTests
{
    [Fact]
    public void RenderFewShot_KeepsSystemFirstAndCurrentUserLast()
    {
        var evaluationCase = ReadDataset().Cases[0];
        var baseline = AssembleBaseline(evaluationCase);
        var exampleSet = new FewShotPromptCatalog().GetRequired("engineering-impact-few-shot", "v1");
        var selectedExamples = exampleSet.SelectFor(evaluationCase.Intent);

        var variant = new PromptExperimentRenderer().RenderFewShot(baseline, selectedExamples);

        Assert.Equal("system", variant.Messages[0].Role);
        Assert.Equal("user", variant.Messages[^1].Role);
        Assert.Equal(baseline.Messages[^1], variant.Messages[^1]);
        Assert.True(variant.EstimatedInputTokens > baseline.EstimatedInputTokens);
        Assert.Equal(baseline.PromptBundleId, variant.PromptBundleId);
        Assert.Equal(baseline.PromptBundleVersion, variant.PromptBundleVersion);
    }

    [Fact]
    public void RenderFewShot_SeparatesExamplesFromTranscriptAndContextPackage()
    {
        var evaluationCase = ReadDataset().Cases[1];
        var baseline = AssembleBaseline(evaluationCase);
        var examples = new FewShotPromptCatalog()
            .GetRequired("engineering-impact-few-shot", "v1")
            .SelectFor(evaluationCase.Intent);

        var variant = new PromptExperimentRenderer().RenderFewShot(baseline, examples);

        Assert.Equal("user", variant.Messages[1].Role);
        Assert.Contains("synthetic few-shot examples", variant.Messages[1].Content, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("not transcript", variant.Messages[1].Content, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("SYNTH-COMP-MOTOR", variant.Messages[3].Content, StringComparison.Ordinal);
        Assert.Contains("SYNTH-COMP-BETA", variant.Messages[^1].Content, StringComparison.Ordinal);
        Assert.DoesNotContain("SYNTH-EXAMPLE-002", variant.Messages[^1].Content, StringComparison.Ordinal);
        Assert.Equal(baseline.Messages.Skip(1), variant.Messages.Skip(2));
    }

    [Fact]
    public async Task RunAsync_UsesTypedExamplesAndSkipsPreGenerationControlCases()
    {
        var report = await new FewShotPromptEvaluationRunner()
            .RunAsync(GetDatasetDirectory(), CancellationToken.None);

        Assert.True(report.StructuralChecksPassed);
        Assert.Equal(5, report.CaseCount);
        Assert.Equal(3, report.GenerationCaseCount);
        Assert.Equal(2, report.ControlCaseCount);
        Assert.Equal(0, report.ModelCallCount);
        Assert.True(report.Cases.Where(evaluationCase => evaluationCase.ModelCallExpected)
            .All(evaluationCase => evaluationCase.SelectedExampleIds.Count == 1));
        Assert.All(report.Cases.Where(evaluationCase => !evaluationCase.ModelCallExpected), evaluationCase =>
        {
            Assert.Empty(evaluationCase.SelectedExampleIds);
            Assert.Null(evaluationCase.BaselineEstimatedInputTokens);
            Assert.Null(evaluationCase.FewShotEstimatedInputTokens);
        });
        Assert.Equal(
            "SYNTH-EXAMPLE-001",
            Assert.Single(report.Cases, evaluationCase => evaluationCase.CaseId == "SYNTH-CASE-001")
                .SelectedExampleIds.Single());
    }

    [Fact]
    public async Task RunAsync_ReportsEstimatedTokenDeltaAndExplicitlyPendingQualityMetrics()
    {
        var report = await new FewShotPromptEvaluationRunner()
            .RunAsync(GetDatasetDirectory(), CancellationToken.None);

        Assert.True(report.EstimatedInputTokenIncrease > 0);
        Assert.Contains("estimated", report.EvaluationScope, StringComparison.OrdinalIgnoreCase);
        Assert.False(report.SemanticSupportEvaluated);
        Assert.False(report.LiveModelQualityEvaluated);
        Assert.False(report.HumanUsefulnessEvaluated);
        Assert.False(report.LatencyMeasured);
        Assert.False(report.CostMeasured);
    }

    private static FewShotPromptEvaluationDataset ReadDataset() =>
        new FewShotPromptEvaluationDatasetReader().Read(GetDatasetDirectory());

    private static ModelRequest AssembleBaseline(FewShotPromptEvaluationCase evaluationCase)
    {
        var prompt = new SourceControlledPromptCatalog().GetRequired("engineering-impact", "v2");
        var configuration = new ModelConfiguration(
            "few-shot-offline",
            "offline",
            "synthetic",
            "offline",
            512,
            4096);
        return new PromptAssembler().Assemble(evaluationCase.Request, evaluationCase.Context, prompt, configuration);
    }

    private static string GetDatasetDirectory()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory);
             directory is not null;
             directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "evals", "prompt-evaluation", "few-shot", "v1");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new DirectoryNotFoundException("Could not locate the few-shot prompt evaluation dataset.");
    }
}
