using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Evaluation;

namespace Lattice.AI.Runtime.Tests.Evaluation;

public sealed class GoldenEvaluationTests
{
    [Fact]
    public async Task RunAsync_PassesAllRequiredOfflineGoldenCasesAndReportsCoverage()
    {
        var report = await new EngineeringImpactEvaluationRunner()
            .RunAsync(GetDatasetDirectory(), CancellationToken.None);

        Assert.True(report.Passed, string.Join(
            Environment.NewLine,
            report.Cases.Where(result => !result.Passed).Select(result => $"{result.CaseId}: {result.FailureReason}")
                .Concat(report.ConversationSequences.Cases
                    .Where(result => !result.Passed)
                    .Select(result => $"{result.SequenceId}: {result.FailureReason}"))));
        Assert.Equal(34, report.CaseCount);
        Assert.Equal(report.CaseCount, report.PassedCaseCount);
        Assert.Equal(0, report.FailedCaseCount);
        Assert.Equal(
            report.Cases.Sum(result => result.UnsupportedClaimCount),
            report.Metrics.UnsupportedClaimCount);
        Assert.Equal(
            report.Cases.Sum(result => result.EvaluatedModelClaimCount),
            report.Metrics.EvaluatedModelClaimCount);
        Assert.Equal(
            (double)report.Metrics.UnsupportedClaimCount / report.Metrics.EvaluatedModelClaimCount,
            report.Metrics.UnsupportedClaimRate.Rate);
        Assert.True(report.ReferenceIntegrityEvaluated);
        Assert.False(report.SemanticSupportEvaluated);
        Assert.False(report.LiveModelQualityEvaluated);
        Assert.Equal(14, report.Metrics.ExpectedLinkCount);
        Assert.Equal(14, report.Metrics.CoveredLinkCount);
        Assert.Equal(1, report.Metrics.PathCoverage.Rate);
        Assert.Equal(1, report.Metrics.LinkCoverage.Rate);
        Assert.Equal(1, report.Metrics.IntentDetectionAccuracy.Rate);
        Assert.Equal(1, report.Metrics.SubjectExtractionAccuracy.Rate);
        Assert.Equal(1, report.Metrics.ClarificationAccuracy.Rate);
        Assert.Equal(1, report.Metrics.ScopePolicyAccuracy.Rate);
        Assert.Equal(1, report.Metrics.DispositionAccuracy.Rate);
        Assert.Equal(1, report.Metrics.RelationshipCoverage.Rate);
        Assert.Null(report.Metrics.ChainCoverage.Rate);
        Assert.Equal(1, report.Metrics.EvidenceCoverage.Rate);
        Assert.Equal(1, report.Metrics.SourceCoverage.Rate);
        Assert.Equal(0, report.Metrics.AuthorizationLeakageCount);
        Assert.Equal(11, report.Metrics.ModelJsonParseSuccessCount);
        Assert.Equal(3, report.Metrics.ModelJsonParseFailureCount);
        Assert.Equal(1, report.Metrics.UnsupportedReferenceRejectionRate.Rate);
        Assert.Equal(1, report.Metrics.OmissionBehaviorAccuracy.Rate);
        Assert.Equal(10, report.Metrics.DispositionCounts["Answer"]);
        Assert.Equal(13, report.ConversationSequences.SequenceCount);
        Assert.Equal(13, report.ConversationSequences.PassedSequenceCount);
        Assert.Equal(0, report.ConversationSequences.FailedSequenceCount);
        Assert.Equal(27, report.ConversationSequences.TurnCount);
        Assert.Equal(14, report.ConversationSequences.FollowUpTurnCount);
        Assert.Equal(3, report.ConversationSequences.FollowUpRetrievalCount);
        Assert.Equal(11, report.ConversationSequences.ClarificationCount);
        Assert.Equal(5, report.ConversationSequences.StateInvalidationCount);
        Assert.Equal(9, report.ConversationSequences.ParentTurnCorrelationCount);

        var multiHop = Assert.Single(report.Cases.Where(result => result.CaseId == "multi-hop-impact"));
        Assert.Equal(["REL-HOP-001", "REL-HOP-002"], multiHop.ActualRelationshipIds);
        Assert.Equal(["PATH-HOP-001"], multiHop.CoveredPathIds);

        foreach (var caseId in new[]
                 {
                     "authorization-denied",
                     "missing-investigation",
                     "mismatched-investigation",
                     "expired-authorization",
                     "revoked-authorization"
                 })
        {
            var denied = Assert.Single(report.Cases.Where(result => result.CaseId == caseId));
            Assert.Equal(0, denied.EvidenceRetrievalCalls);
            Assert.Empty(denied.ActualEvidenceIds);
            Assert.Empty(denied.ActualSourceRefIds);
        }

        var mismatchedEvidence = Assert.Single(
            report.Cases.Where(result => result.CaseId == "mismatched-evidence-investigation"));
        Assert.Equal("investigation-mismatch", mismatchedEvidence.ActualAuthorizationScenario);
        Assert.Equal(1, mismatchedEvidence.EvidenceRetrievalCalls);
        Assert.Empty(mismatchedEvidence.ActualEvidenceIds);
        Assert.Empty(mismatchedEvidence.ActualLinkIds);
    }

    [Fact]
    public async Task RunAsync_FailsWhenRequiredRelationshipIsMissing()
    {
        using var dataset = CopyDataset();
        var casesPath = Path.Combine(dataset.Path, "cases.jsonl");
        var cases = File.ReadAllLines(casesPath).Select(line => JsonNode.Parse(line)).ToArray();
        cases[0]!["expect"]!["requiredRelationshipIds"]!.AsArray().Add("REL-MISSING-REQUIRED");
        File.WriteAllLines(casesPath, cases.Select(item => item!.ToJsonString()), new UTF8Encoding(false));

        var report = await new EngineeringImpactEvaluationRunner().RunAsync(dataset.Path, CancellationToken.None);

        Assert.False(report.Passed);
        var direct = Assert.Single(report.Cases.Where(result => result.CaseId == "direct-impact"));
        Assert.False(direct.Passed);
        Assert.Contains("REL-MISSING-REQUIRED", direct.FailureReason, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RunAsync_FailsWhenModelCitesMissingEvidenceAndCountsUnsupportedClaim()
    {
        using var dataset = CopyDataset();
        var fixturePath = Path.Combine(dataset.Path, "fixtures", "requirement-r123.json");
        var fixture = JsonNode.Parse(File.ReadAllText(fixturePath))!;
        var response = JsonNode.Parse(fixture["modelResponses"]!["direct"]!.GetValue<string>())!;
        response["impacts"]![0]!["evidenceIds"] = new JsonArray("EVIDENCE-NOT-IN-CONTEXT");
        fixture["modelResponses"]!["direct"] = response.ToJsonString();
        File.WriteAllText(fixturePath, fixture.ToJsonString(), new UTF8Encoding(false));

        var report = await new EngineeringImpactEvaluationRunner().RunAsync(dataset.Path, CancellationToken.None);

        Assert.False(report.Passed);
        Assert.Equal(
            report.Cases.Sum(result => result.UnsupportedClaimCount),
            report.Metrics.UnsupportedClaimCount);
        Assert.Equal(
            report.Cases.Sum(result => result.EvaluatedModelClaimCount),
            report.Metrics.EvaluatedModelClaimCount);
        Assert.Equal(
            (double)report.Metrics.UnsupportedClaimCount / report.Metrics.EvaluatedModelClaimCount,
            report.Metrics.UnsupportedClaimRate.Rate);
        var direct = Assert.Single(report.Cases.Where(result => result.CaseId == "direct-impact"));
        Assert.False(direct.Passed);
        Assert.Equal(1, direct.UnsupportedClaimCount);
        Assert.Contains("unknown-evidence", direct.Issues);
    }

    [Fact]
    public async Task RunAsync_RejectsUnknownJsonlFields()
    {
        using var dataset = CopyDataset();
        var casesPath = Path.Combine(dataset.Path, "cases.jsonl");
        var cases = File.ReadAllLines(casesPath);
        cases[0] = cases[0][..^1] + ",\"unexpectedField\":true}";
        File.WriteAllLines(casesPath, cases, new UTF8Encoding(false));

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            new EngineeringImpactEvaluationRunner().RunAsync(dataset.Path, CancellationToken.None));
    }

    [Fact]
    public async Task RunAsync_RejectsDuplicateJsonlProperties()
    {
        using var dataset = CopyDataset();
        var casesPath = Path.Combine(dataset.Path, "cases.jsonl");
        var cases = File.ReadAllLines(casesPath);
        cases[0] = cases[0].Replace(
            "\"caseId\":\"direct-impact\"",
            "\"caseId\":\"direct-impact\",\"caseId\":\"duplicate\"",
            StringComparison.Ordinal);
        File.WriteAllLines(casesPath, cases, new UTF8Encoding(false));

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            new EngineeringImpactEvaluationRunner().RunAsync(dataset.Path, CancellationToken.None));
    }

    [Fact]
    public async Task RunAsync_ReportsEvaluationLimitsAndMetricDenominators()
    {
        var report = await new EngineeringImpactEvaluationRunner()
            .RunAsync(GetDatasetDirectory(), CancellationToken.None);
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.Never
        });
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var metrics = root.GetProperty("metrics");

        Assert.True(root.GetProperty("referenceIntegrityEvaluated").GetBoolean());
        Assert.False(root.GetProperty("semanticSupportEvaluated").GetBoolean());
        Assert.False(root.GetProperty("liveModelQualityEvaluated").GetBoolean());
        foreach (var metric in new[]
                 {
                     "intentDetectionAccuracy", "subjectExtractionAccuracy", "clarificationAccuracy",
                     "scopePolicyAccuracy", "dispositionAccuracy", "relationshipCoverage", "pathCoverage",
                     "chainCoverage", "evidenceCoverage", "sourceCoverage", "unsupportedReferenceRejectionRate",
                     "omissionBehaviorAccuracy"
                 })
        {
            Assert.True(metrics.GetProperty(metric).TryGetProperty("numerator", out _), metric);
            Assert.True(metrics.GetProperty(metric).TryGetProperty("denominator", out _), metric);
            Assert.True(metrics.GetProperty(metric).TryGetProperty("rate", out _), metric);
        }

        Assert.True(metrics.GetProperty("chainCoverage").GetProperty("rate").ValueKind == JsonValueKind.Null);
        Assert.Contains("deterministic", root.GetProperty("evaluationScope").GetString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RunAsync_RejectsCasesMissingRequiredEvaluationAnnotations()
    {
        using var dataset = CopyDataset();
        var casesPath = Path.Combine(dataset.Path, "cases.jsonl");
        var cases = File.ReadAllLines(casesPath).Select(line => JsonNode.Parse(line)).ToArray();
        cases[0]!["expect"]!.AsObject().Remove("questionIntent");
        File.WriteAllLines(casesPath, cases.Select(item => item!.ToJsonString()), new UTF8Encoding(false));

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            new EngineeringImpactEvaluationRunner().RunAsync(dataset.Path, CancellationToken.None));
    }

    [Fact]
    public async Task RunAsync_RejectsAnyExpectationThatAllowsAuthorizationLeakage()
    {
        using var dataset = CopyDataset();
        var casesPath = Path.Combine(dataset.Path, "cases.jsonl");
        var cases = File.ReadAllLines(casesPath).Select(line => JsonNode.Parse(line)).ToArray();
        cases[0]!["expect"]!["authorizationLeakageAllowed"] = true;
        File.WriteAllLines(casesPath, cases.Select(item => item!.ToJsonString()), new UTF8Encoding(false));

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            new EngineeringImpactEvaluationRunner().RunAsync(dataset.Path, CancellationToken.None));
    }

    [Fact]
    public async Task RunAsync_RejectsManifestPathsOutsideTheDataset()
    {
        using var dataset = CopyDataset();
        var manifestPath = Path.Combine(dataset.Path, "manifest.json");
        var manifest = JsonNode.Parse(File.ReadAllText(manifestPath))!;
        manifest["casesFile"] = "../cases.jsonl";
        File.WriteAllText(manifestPath, manifest.ToJsonString(), new UTF8Encoding(false));

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            new EngineeringImpactEvaluationRunner().RunAsync(dataset.Path, CancellationToken.None));
    }

    [Fact]
    public void Dataset_CoversTheNarrowIntentAndFailureCategories()
    {
        using var manifest = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(GetDatasetDirectory(), "manifest.json")));
        var caseLines = File.ReadAllLines(Path.Combine(GetDatasetDirectory(), "cases.jsonl"));
        var cases = caseLines
            .Select(line => JsonDocument.Parse(line))
            .ToArray();

        try
        {
            Assert.Equal(caseLines.Length, manifest.RootElement.GetProperty("caseCount").GetInt32());
            Assert.True(CountTagged(cases, "supported-paraphrase") >= 10);
            Assert.True(CountTagged(cases, "missing-or-ambiguous-subject") >= 5);
            Assert.True(CountTagged(cases, "unsupported-question") >= 3);
            Assert.True(CountTagged(cases, "no-evidence-or-missing-provenance") >= 3);
            Assert.True(CountTagged(cases, "authorization") >= 4);
            Assert.True(CountTagged(cases, "malformed-or-unsupported-model-output") >= 3);
            Assert.True(CountTagged(cases, "budget-pressure") >= 3);

            var supportedQuestions = cases
                .Where(item => HasCategory(item.RootElement, "supported-paraphrase"))
                .Select(item => item.RootElement.GetProperty("question").GetString())
                .Distinct(StringComparer.Ordinal)
                .Count();
            Assert.True(supportedQuestions >= 10);

            var baselineQuestions = cases
                .Select(item => item.RootElement)
                .Select(item => item.GetProperty("question").GetString())
                .ToHashSet(StringComparer.Ordinal);
            Assert.Contains("What is impacted if Requirement R-123 changes?", baselineQuestions);
            Assert.Contains("If R-123 changes, what could be affected?", baselineQuestions);
            Assert.Contains("Show the downstream engineering impact of R-123.", baselineQuestions);
            Assert.Contains("What is impacted?", baselineQuestions);
            Assert.Contains("What is impacted if R-999 changes?", baselineQuestions);
            Assert.Contains(cases.Select(item => item.RootElement)
                .Select(item => item.GetProperty("authorizationScenario").GetString()), scenario => scenario == "denied");
            Assert.Contains(cases.Select(item => item.RootElement)
                .Select(item => item.GetProperty("caseId").GetString()), caseId => caseId == "no-evidence");

            foreach (var item in cases.Select(item => item.RootElement))
            {
                var expectation = item.GetProperty("expect");
                Assert.False(expectation.GetProperty("authorizationLeakageAllowed").GetBoolean());
                Assert.Contains(expectation.GetProperty("questionIntent").GetString(),
                    new[] { "engineering-impact", "unsupported" });
                Assert.True(expectation.TryGetProperty("extractedSubjectId", out _));
                Assert.True(expectation.TryGetProperty("subjectId", out _));
                Assert.True(expectation.TryGetProperty("requiredChainIds", out _));
                Assert.True(expectation.TryGetProperty("expectedOmittedClaimIds", out _));
                Assert.Empty(expectation.GetProperty("scopeRelationshipTypes").EnumerateArray());
                Assert.Empty(expectation.GetProperty("scopeSourceSystems").EnumerateArray());
                Assert.True(expectation.GetProperty("clarificationRequired").ValueKind is JsonValueKind.True or JsonValueKind.False);
                var maxHops = expectation.GetProperty("scopeMaxHops");
                var subjectId = expectation.GetProperty("subjectId");
                Assert.Equal(
                    subjectId.ValueKind == JsonValueKind.String ? 3 : (int?)null,
                    maxHops.ValueKind == JsonValueKind.Number ? maxHops.GetInt32() : null);
                Assert.True(expectation.GetProperty("omissionBehaviorCorrect").GetBoolean());
                Assert.Contains(expectation.GetProperty("parseSucceeded").ValueKind,
                    new[] { JsonValueKind.Null, JsonValueKind.True, JsonValueKind.False });
                Assert.Contains(expectation.GetProperty("unsupportedReferenceRejected").ValueKind,
                    new[] { JsonValueKind.Null, JsonValueKind.True, JsonValueKind.False });
            }

            var fixturePath = Path.Combine(GetDatasetDirectory(), "fixtures", "requirement-r123.json");
            using var fixture = JsonDocument.Parse(File.ReadAllText(fixturePath));
            Assert.Equal("synthetic-plm-fixture-v1", fixture.RootElement.GetProperty("sourceVersion").GetString());
            Assert.All(cases.Select(item => item.RootElement), item =>
                Assert.Equal("INV-EVAL-001", item.GetProperty("investigationId").GetString()));
            foreach (var source in fixture.RootElement.GetProperty("sources").EnumerateArray())
            {
                Assert.StartsWith(
                    "https://plm.example.test/",
                    source.GetProperty("deepLink").GetString(),
                    StringComparison.Ordinal);
            }
        }
        finally
        {
            foreach (var item in cases)
            {
                item.Dispose();
            }
        }
    }

    private static int CountTagged(IEnumerable<JsonDocument> cases, string category) =>
        cases.Count(item => HasCategory(item.RootElement, category));

    private static bool HasCategory(JsonElement item, string category) =>
        item.GetProperty("categories")
            .EnumerateArray()
            .Any(value => string.Equals(value.GetString(), category, StringComparison.Ordinal));

    private static string GetDatasetDirectory()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory);
             directory is not null;
             directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "evals", "engineering-impact", "v1");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new DirectoryNotFoundException("Could not locate evals/engineering-impact/v1 from the test output path.");
    }

    private static DatasetCopy CopyDataset()
    {
        var target = Path.Combine(AppContext.BaseDirectory, $"evaluation-dataset-{Guid.NewGuid():N}");
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
