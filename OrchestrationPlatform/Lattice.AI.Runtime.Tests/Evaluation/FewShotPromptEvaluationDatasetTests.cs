using System.Text;
using System.Text.Json.Nodes;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Evaluation.PromptExperiments;

namespace Lattice.AI.Runtime.Tests.Evaluation;

public sealed class FewShotPromptEvaluationDatasetTests
{
    [Fact]
    public void Read_ValidatesSyntheticDatasetAndRequiredScenarioCoverage()
    {
        var dataset = new FewShotPromptEvaluationDatasetReader().Read(GetDatasetDirectory());

        Assert.Equal("lattice-few-shot-prompt-synthetic-v1", dataset.Id);
        Assert.Equal("v1", dataset.Version);
        Assert.Equal("synthetic-fixture-only", dataset.Classification);
        Assert.Equal(5, dataset.Cases.Count);

        var allTags = dataset.Cases.SelectMany(evaluationCase => evaluationCase.ScenarioTags)
            .ToHashSet(StringComparer.Ordinal);
        Assert.Contains("direct-impact", allTags);
        Assert.Contains("why-follow-up", allTags);
        Assert.Contains("source-evidence-explanation", allTags);
        Assert.Contains("abstention", allTags);
        Assert.Contains("clarification", allTags);
        Assert.Contains("valid-reference", allTags);
        Assert.Contains("uncertainty", allTags);
        Assert.Contains("stale-assistant-claim", allTags);
        Assert.Contains("prompt-injection", allTags);

        var staleClaimCase = Assert.Single(dataset.Cases, evaluationCase =>
            evaluationCase.ScenarioTags.Contains("stale-assistant-claim", StringComparer.Ordinal));
        Assert.Equal("SYNTH-TURN-002", staleClaimCase.Request.ConversationHistory.Single().TurnId);
        var injectionCase = Assert.Single(dataset.Cases, evaluationCase =>
            evaluationCase.ScenarioTags.Contains("prompt-injection", StringComparer.Ordinal));
        Assert.Contains("untrusted", injectionCase.Context.Claims.Single().Statement, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Read_RejectsUnknownOrDuplicateCaseFieldsAndCaseIds()
    {
        using var unknownFieldDataset = CopyDataset();
        var unknownFieldPath = Path.Combine(unknownFieldDataset.Path, "cases.jsonl");
        var unknownFieldLines = File.ReadAllLines(unknownFieldPath);
        unknownFieldLines[0] = unknownFieldLines[0][..^1] + ",\"unexpected\":true}";
        File.WriteAllLines(unknownFieldPath, unknownFieldLines, new UTF8Encoding(false));

        Assert.Throws<InvalidDataException>(() =>
            new FewShotPromptEvaluationDatasetReader().Read(unknownFieldDataset.Path));

        using var duplicateIdDataset = CopyDataset();
        var duplicateIdPath = Path.Combine(duplicateIdDataset.Path, "cases.jsonl");
        var duplicateIdLines = File.ReadAllLines(duplicateIdPath);
        var firstCaseId = JsonNode.Parse(duplicateIdLines[0])!["caseId"]!.GetValue<string>();
        var secondCase = JsonNode.Parse(duplicateIdLines[1])!;
        secondCase["caseId"] = firstCaseId;
        duplicateIdLines[1] = secondCase.ToJsonString();
        File.WriteAllLines(duplicateIdPath, duplicateIdLines, new UTF8Encoding(false));

        Assert.Throws<InvalidDataException>(() =>
            new FewShotPromptEvaluationDatasetReader().Read(duplicateIdDataset.Path));
    }

    [Fact]
    public void Read_RejectsInvalidIntentAndMissingScenarioCoverage()
    {
        using var invalidIntentDataset = CopyDataset();
        var invalidIntentPath = Path.Combine(invalidIntentDataset.Path, "cases.jsonl");
        var invalidIntentLines = File.ReadAllLines(invalidIntentPath);
        var invalidIntentCase = JsonNode.Parse(invalidIntentLines[0])!;
        invalidIntentCase["intent"] = "ModelChooses";
        invalidIntentLines[0] = invalidIntentCase.ToJsonString();
        File.WriteAllLines(invalidIntentPath, invalidIntentLines, new UTF8Encoding(false));

        Assert.Throws<InvalidDataException>(() =>
            new FewShotPromptEvaluationDatasetReader().Read(invalidIntentDataset.Path));

        using var missingCoverageDataset = CopyDataset();
        var missingCoveragePath = Path.Combine(missingCoverageDataset.Path, "cases.jsonl");
        var missingCoverageLines = File.ReadAllLines(missingCoveragePath);
        var directCase = JsonNode.Parse(missingCoverageLines[0])!;
        var directTags = directCase["scenarioTags"]!.AsArray();
        for (var index = directTags.Count - 1; index >= 0; index--)
        {
            if (string.Equals(directTags[index]!.GetValue<string>(), "direct-impact", StringComparison.Ordinal))
            {
                directTags.RemoveAt(index);
            }
        }
        missingCoverageLines[0] = directCase.ToJsonString();
        File.WriteAllLines(missingCoveragePath, missingCoverageLines, new UTF8Encoding(false));

        Assert.Throws<InvalidDataException>(() =>
            new FewShotPromptEvaluationDatasetReader().Read(missingCoverageDataset.Path));
    }

    [Fact]
    public void Read_RequiresClarificationAndAbstentionCasesToExpectNoGeneration()
    {
        var dataset = new FewShotPromptEvaluationDatasetReader().Read(GetDatasetDirectory());
        var clarificationCase = Assert.Single(dataset.Cases, evaluationCase =>
            evaluationCase.ScenarioTags.Contains("clarification", StringComparer.Ordinal));
        var abstentionCase = Assert.Single(dataset.Cases, evaluationCase =>
            evaluationCase.ScenarioTags.Contains("abstention", StringComparer.Ordinal));

        Assert.False(clarificationCase.ModelCallExpected);
        Assert.Equal(AnswerDisposition.Clarify, clarificationCase.ExpectedDisposition);
        Assert.False(abstentionCase.ModelCallExpected);
        Assert.Equal(AnswerDisposition.Abstain, abstentionCase.ExpectedDisposition);
    }

    [Fact]
    public void Read_RejectsExpectedReferencesMissingFromCurrentContextPackage()
    {
        using var dataset = CopyDataset();
        var casesPath = Path.Combine(dataset.Path, "cases.jsonl");
        var cases = File.ReadAllLines(casesPath);
        var directCase = JsonNode.Parse(cases[0])!;
        directCase["expectedEvidenceIds"] = new JsonArray("SYNTH-EVIDENCE-999");
        cases[0] = directCase.ToJsonString();
        File.WriteAllLines(casesPath, cases, new UTF8Encoding(false));

        Assert.Throws<InvalidDataException>(() =>
            new FewShotPromptEvaluationDatasetReader().Read(dataset.Path));
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

    private static DatasetCopy CopyDataset()
    {
        var target = Path.Combine(AppContext.BaseDirectory, $"few-shot-evaluation-dataset-{Guid.NewGuid():N}");
        Directory.CreateDirectory(target);
        foreach (var sourcePath in Directory.GetFiles(GetDatasetDirectory(), "*", SearchOption.AllDirectories))
        {
            var relativePath = Path.GetRelativePath(GetDatasetDirectory(), sourcePath);
            var targetPath = Path.Combine(target, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);
            File.Copy(sourcePath, targetPath);
        }

        return new DatasetCopy(target);
    }

    private sealed class DatasetCopy(string path) : IDisposable
    {
        public string Path { get; } = path;

        public void Dispose()
        {
            if (Directory.Exists(Path))
            {
                Directory.Delete(Path, recursive: true);
            }
        }
    }
}
