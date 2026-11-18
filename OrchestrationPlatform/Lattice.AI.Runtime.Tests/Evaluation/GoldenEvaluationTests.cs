using System.Text;
using System.Text.Json.Nodes;
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
            report.Cases.Where(result => !result.Passed).Select(result => $"{result.CaseId}: {result.FailureReason}")));
        Assert.Equal(12, report.CaseCount);
        Assert.Equal(report.CaseCount, report.PassedCaseCount);
        Assert.Equal(0, report.FailedCaseCount);
        Assert.Equal(0, report.Metrics.UnsupportedClaimCount);
        Assert.Equal(0, report.Metrics.UnsupportedClaimRate);
        Assert.Equal(3, report.Metrics.ExpectedLinkCount);
        Assert.Equal(3, report.Metrics.CoveredLinkCount);
        Assert.Equal(1, report.Metrics.PathCoverage);
        Assert.Equal(1, report.Metrics.LinkCoverage);
        Assert.Equal(2, report.Metrics.DispositionCounts["Answer"]);

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
        Assert.Equal(1, report.Metrics.UnsupportedClaimCount);
        Assert.Equal(2, report.Metrics.EvaluatedModelClaimCount);
        Assert.Equal(0.5, report.Metrics.UnsupportedClaimRate);
        var direct = Assert.Single(report.Cases.Where(result => result.CaseId == "direct-impact"));
        Assert.False(direct.Passed);
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
