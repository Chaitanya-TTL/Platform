using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Evaluation.PromptExperiments;

public sealed class FewShotPromptEvaluationRunner
{
    private const string ReportSchemaVersion = "few-shot-prompt-evaluation-report/v1";
    private const string EvaluationScope =
        "Offline prompt rendering and estimated input-token comparison only. Model quality, semantic support, human usefulness, latency, and cost are not evaluated.";
    private static readonly ModelConfiguration OfflineModelConfiguration = new(
        "few-shot-offline",
        "offline",
        "synthetic",
        "offline",
        512,
        4096);

    public Task<FewShotPromptEvaluationReport> RunAsync(
        string datasetPath,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(datasetPath);
        cancellationToken.ThrowIfCancellationRequested();

        var dataset = new FewShotPromptEvaluationDatasetReader().Read(datasetPath);
        var prompt = new SourceControlledPromptCatalog().GetRequired("engineering-impact", "v2");
        var exampleSet = new FewShotPromptCatalog().GetRequired("engineering-impact-few-shot", "v1");
        if (!string.Equals(exampleSet.BasePromptId, prompt.Id, StringComparison.Ordinal) ||
            !string.Equals(exampleSet.BasePromptVersion, prompt.Version, StringComparison.Ordinal))
        {
            throw new InvalidDataException("The few-shot example set is not pinned to the loaded zero-shot baseline.");
        }

        var assembler = new PromptAssembler();
        var renderer = new PromptExperimentRenderer();
        var caseReports = new List<FewShotPromptEvaluationCaseReport>(dataset.Cases.Count);
        long baselineTokenTotal = 0;
        long fewShotTokenTotal = 0;

        foreach (var evaluationCase in dataset.Cases)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var selectedExamples = exampleSet.SelectFor(evaluationCase.Intent);
            if (!evaluationCase.ModelCallExpected)
            {
                if (selectedExamples.Count > 0)
                {
                    throw new InvalidDataException(
                        $"Control case '{evaluationCase.CaseId}' unexpectedly selected generation examples.");
                }

                caseReports.Add(new FewShotPromptEvaluationCaseReport(
                    evaluationCase.CaseId,
                    evaluationCase.Intent,
                    evaluationCase.ScenarioTags,
                    false,
                    evaluationCase.ExpectedDisposition,
                    true,
                    Array.Empty<string>(),
                    null,
                    null,
                    null));
                continue;
            }

            if (selectedExamples.Count == 0)
            {
                throw new InvalidDataException(
                    $"Generation case '{evaluationCase.CaseId}' has no example for its typed intent.");
            }

            var zeroShotRequest = assembler.Assemble(
                evaluationCase.Request,
                evaluationCase.Context,
                prompt,
                OfflineModelConfiguration);
            var fewShotRequest = renderer.RenderFewShot(zeroShotRequest, selectedExamples);
            var exampleMessage = fewShotRequest.Messages[1];
            var currentUserMessage = fewShotRequest.Messages[^1];
            var transcriptMessagesPreserved = zeroShotRequest.Messages.Skip(1)
                .SequenceEqual(fewShotRequest.Messages.Skip(2));
            var structureValid =
                string.Equals(zeroShotRequest.Messages[0].Role, "system", StringComparison.Ordinal) &&
                string.Equals(fewShotRequest.Messages[0].Role, "system", StringComparison.Ordinal) &&
                string.Equals(exampleMessage.Role, "user", StringComparison.Ordinal) &&
                exampleMessage.Content.Contains("SYNTHETIC FEW-SHOT EXAMPLES", StringComparison.Ordinal) &&
                exampleMessage.Content.Contains("not transcript", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(currentUserMessage.Role, "user", StringComparison.Ordinal) &&
                string.Equals(currentUserMessage.Content, zeroShotRequest.Messages[^1].Content, StringComparison.Ordinal) &&
                transcriptMessagesPreserved &&
                fewShotRequest.EstimatedInputTokens > zeroShotRequest.EstimatedInputTokens;

            baselineTokenTotal += zeroShotRequest.EstimatedInputTokens;
            fewShotTokenTotal += fewShotRequest.EstimatedInputTokens;
            caseReports.Add(new FewShotPromptEvaluationCaseReport(
                evaluationCase.CaseId,
                evaluationCase.Intent,
                evaluationCase.ScenarioTags,
                true,
                evaluationCase.ExpectedDisposition,
                structureValid,
                Array.AsReadOnly(selectedExamples.Select(example => example.Id).ToArray()),
                zeroShotRequest.EstimatedInputTokens,
                fewShotRequest.EstimatedInputTokens,
                fewShotRequest.EstimatedInputTokens - zeroShotRequest.EstimatedInputTokens));
        }

        var coveredTags = dataset.Cases.SelectMany(evaluationCase => evaluationCase.ScenarioTags)
            .Distinct(StringComparer.Ordinal)
            .Order(StringComparer.Ordinal)
            .ToArray();
        var reportCases = Array.AsReadOnly(caseReports.ToArray());
        var report = new FewShotPromptEvaluationReport(
            ReportSchemaVersion,
            dataset.Id,
            dataset.Version,
            EvaluationScope,
            reportCases.All(evaluationCase => evaluationCase.StructuralChecksPassed),
            dataset.Cases.Count,
            dataset.Cases.Count(evaluationCase => evaluationCase.ModelCallExpected),
            dataset.Cases.Count(evaluationCase => !evaluationCase.ModelCallExpected),
            0,
            baselineTokenTotal,
            fewShotTokenTotal,
            fewShotTokenTotal - baselineTokenTotal,
            dataset.RequiredScenarioTags,
            Array.AsReadOnly(coveredTags),
            false,
            false,
            false,
            false,
            false,
            reportCases);

        return Task.FromResult(report);
    }
}
