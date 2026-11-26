using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Evaluation.SourceEvidence;
using Xunit.Abstractions;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class SourceEvidenceBenchmarkRunnerTests(ITestOutputHelper output)
{
    [Fact]
    public async Task RunAsync_ComparesOfflineCandidatesAndReportsAggregateBenchmarkInputs()
    {
        var fixtureDirectory = GetFixtureDirectory();
        var records = ReadRecords(Path.Combine(fixtureDirectory, "source-evidence", "records.json"));
        var queries = ReadQueries(Path.Combine(fixtureDirectory, "source-evidence", "labels.json"));
        var dataset = new SourceEvidenceBenchmarkDataset(
            "synthetic-source-evidence-labels-v1",
            "synthetic-fixture-only",
            records,
            queries);
        var embeddingProvider = new DeterministicFakeEmbeddingProvider();

        var report = await new SourceEvidenceBenchmarkRunner().RunAsync(
            dataset,
            embeddingProvider,
            CancellationToken.None);

        Assert.Equal(dataset.DatasetId, report.DatasetId);
        Assert.Equal("synthetic-fixture-only", report.CorpusClassification);
        Assert.Equal(records.Count, report.RecordCount);
        Assert.Equal(queries.Count, report.QueryCount);
        Assert.Equal(1, report.EmbeddingCallCount);
        Assert.Equal(embeddingProvider.CallCount, report.EmbeddingCallCount);
        Assert.Equal(8, report.EmbeddingCostInputs.EmbeddingDimensions);
        Assert.Equal("deterministic-fake", report.EmbeddingCostInputs.Model);
        Assert.Equal("v1", report.EmbeddingCostInputs.ModelVersion);
        Assert.Equal(28, report.EmbeddingCostInputs.InputTextCount);
        Assert.True(report.EmbeddingCostInputs.InputCharacterCount > 0);
        Assert.Equal(12, report.Results.Count);
        Assert.Equal(
            ["text-embedding-3-small", "text-embedding-3-large"],
            SourceEvidenceBenchmarkRunner.ProvisionalEmbeddingCandidates.Select(candidate => candidate.Model));
        Assert.Contains(report.Results, result =>
            result.SegmentationStrategy == SegmentationStrategy.WholeRecord
            && result.RetrievalStrategy == RetrievalStrategy.ExactMetadata);
        Assert.Contains(report.Results, result =>
            result.SegmentationStrategy == SegmentationStrategy.StructuralFieldGroups
            && result.RetrievalStrategy == RetrievalStrategy.Lexical);
        Assert.Contains(report.Results, result =>
            result.SegmentationStrategy == SegmentationStrategy.StructuralSemantic
            && result.RetrievalStrategy == RetrievalStrategy.Vector);
        Assert.All(report.Results, result =>
        {
            Assert.Equal(queries.Count, result.QueryCount);
            Assert.InRange(result.RelevantEvidenceCoverage ?? 0, 0, 1);
            Assert.InRange(result.CitationLocationAccuracy ?? 0, 0, 1);
            Assert.True(result.ElapsedMilliseconds >= 0);
            Assert.Equal(result.SegmentCount, result.SegmentLengths.Distribution.Values.Sum());
            Assert.Equal(queries.Count, result.RetrievalMetrics.QueryCount);
            Assert.Equal(3, result.RetrievalMetrics.K);
            Assert.InRange(result.RetrievalMetrics.PrecisionAtK ?? 0, 0, 1);
            Assert.InRange(result.RetrievalMetrics.RecallAtK ?? 0, 0, 1);
            Assert.InRange(result.RetrievalMetrics.MeanReciprocalRank ?? 0, 0, 1);
            Assert.InRange(result.RetrievalMetrics.NormalizedDiscountedCumulativeGainAtK ?? 0, 0, 1);
            Assert.InRange(result.RetrievalMetrics.CitationLocationAccuracy ?? 0, 0, 1);
        });
        var exactMetadata = Assert.Single(report.Results, result =>
            result.SegmentationStrategy == SegmentationStrategy.WholeRecord
            && result.RetrievalStrategy == RetrievalStrategy.ExactMetadata);
        Assert.Equal(15, exactMetadata.ExpectedEvidenceCount);
        Assert.Equal(1, exactMetadata.RetrievalMetrics.ExactIdSuccessCount);
        Assert.Equal(1, exactMetadata.RetrievalMetrics.ExactIdQueryCount);
        var fieldGroups = Assert.Single(report.Results, result =>
            result.SegmentationStrategy == SegmentationStrategy.StructuralFieldGroups
            && result.RetrievalStrategy == RetrievalStrategy.ExactMetadata);
        Assert.Equal(6, fieldGroups.SegmentCount);

        var reportJson = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true,
            Converters = { new JsonStringEnumConverter() },
        });
        Assert.DoesNotContain(
            "A synthetic requirement says the demo pump must sustain 18 bar at 72 °C.",
            reportJson,
            StringComparison.Ordinal);
        Assert.DoesNotContain(queries[0].Question, reportJson, StringComparison.Ordinal);
        output.WriteLine(reportJson);
    }

    [Fact]
    public async Task DeterministicFakeEmbeddingProvider_ReturnsStableVectors()
    {
        var provider = new DeterministicFakeEmbeddingProvider();
        var texts = new[] { "Synthetic requirement at 18 bar.", "Synthetic clearance of 2.0 mm." };

        var first = await provider.EmbedAsync(texts, CancellationToken.None);
        var second = await provider.EmbedAsync(texts, CancellationToken.None);

        Assert.Equal(first.Count, second.Count);
        for (var index = 0; index < first.Count; index++)
        {
            Assert.Equal(first[index].Model, second[index].Model);
            Assert.Equal(first[index].Version, second[index].Version);
            Assert.Equal(first[index].Values.ToArray(), second[index].Values.ToArray());
        }
        Assert.Equal(2, provider.CallCount);
        Assert.All(first, vector => Assert.Equal(8, vector.Values.Count));
    }

    [Fact]
    public async Task RunAsync_ReportsDuplicateSegmentsAndValidCitationOffsets()
    {
        const string text = "Synthetic pressure requirement is 18 bar. Synthetic temperature requirement is 72 °C.";
        var record = CreateRecord("SYNTH-MULTI-001", text);
        var dataset = new SourceEvidenceBenchmarkDataset(
            "synthetic-multi-sentence",
            "synthetic-fixture-only",
            [record],
            [new SourceEvidenceBenchmarkQuery(
                "synthetic-query",
                "Synthetic pressure and temperature requirement",
                [record.RecordId])]);

        var report = await new SourceEvidenceBenchmarkRunner().RunAsync(
            dataset,
            new DeterministicFakeEmbeddingProvider(),
            CancellationToken.None);
        var candidate = Assert.Single(report.Results, result =>
            result.SegmentationStrategy == SegmentationStrategy.StructuralSemantic
            && result.RetrievalStrategy == RetrievalStrategy.Lexical);

        Assert.Equal(2, candidate.SegmentCount);
        Assert.Equal(1, candidate.RetrievedExpectedEvidenceCount);
        Assert.Equal(1, candidate.DuplicateRetrievalCount);
        Assert.Equal(2, candidate.CitationLocationCount);
        Assert.Equal(2, candidate.CitationLocationCorrectCount);
        Assert.Equal(1d, candidate.CitationLocationAccuracy);
    }

    [Fact]
    public async Task RunAsync_RejectsUnclassifiedDataBeforeCallingEmbeddingProvider()
    {
        var record = CreateRecord("SYNTH-001", "Synthetic statement.");
        var dataset = new SourceEvidenceBenchmarkDataset(
            "unclassified",
            "live",
            [record],
            [new SourceEvidenceBenchmarkQuery("query-1", "Synthetic statement?", [record.RecordId])]);
        var provider = new DeterministicFakeEmbeddingProvider();

        await Assert.ThrowsAsync<ArgumentException>(() =>
            new SourceEvidenceBenchmarkRunner().RunAsync(dataset, provider, CancellationToken.None));

        Assert.Equal(0, provider.CallCount);
    }

    private static IReadOnlyList<SourceEvidenceRecord> ReadRecords(string path)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.GetProperty("records")
            .EnumerateArray()
            .Select(record =>
            {
                var text = GetOptionalString(record, "searchableText") ?? "";
                var revision = GetOptionalString(record, "sourceRevision");
                var location = GetOptionalString(record, "location");
                var provenanceId = GetOptionalString(record, "provenanceId");
                var sourceApplication = record.GetProperty("sourceApplication").GetString()!;
                var recordId = record.GetProperty("recordId").GetString()!;
                return new SourceEvidenceRecord(
                    "1.0",
                    recordId,
                    null,
                    "synthetic-investigation",
                    1,
                    sourceApplication,
                    recordId,
                    [],
                    record.GetProperty("recordType").GetString()!,
                    recordId,
                    text,
                    location ?? "",
                    revision,
                    null,
                    null,
                    GetOptionalString(record, "freshness") ?? "unknown",
                    "ready",
                    "complete",
                    ["available"],
                    [],
                    $"sha256:{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant()}",
                    [],
                    provenanceId ?? "synthetic-provenance",
                    "source-authoritative",
                    null);
            })
            .ToArray();
    }

    private static IReadOnlyList<SourceEvidenceBenchmarkQuery> ReadQueries(string path)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var labelsByQuery = document.RootElement.GetProperty("labeledEvidence")
            .EnumerateArray()
            .GroupBy(label => label.GetProperty("queryId").GetString()!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        return document.RootElement.GetProperty("queries")
            .EnumerateArray()
            .Select(query =>
            {
                var queryId = query.GetProperty("queryId").GetString()!;
                var queryLabels = labelsByQuery.GetValueOrDefault(queryId) ?? [];
                return new SourceEvidenceBenchmarkQuery(
                    queryId,
                    query.GetProperty("question").GetString()!,
                    queryLabels.Select(label => label.GetProperty("recordId").GetString()!).ToArray())
                {
                    K = query.GetProperty("k").GetInt32(),
                    Scenario = Enum.Parse<SourceEvidenceEvaluationScenario>(
                        query.GetProperty("scenario").GetString()!,
                        ignoreCase: true),
                    ExactRecordId = GetOptionalString(query, "exactRecordId"),
                    ExpectedLocations = queryLabels.ToDictionary(
                        label => label.GetProperty("recordId").GetString()!,
                        label => GetOptionalString(label, "expectedLocation"),
                        StringComparer.Ordinal)
                };
            })
            .ToArray();
    }

    private static string? GetOptionalString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property)
        && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static SourceEvidenceRecord CreateRecord(string recordId, string text) => new(
        "1.0",
        recordId,
        null,
        "synthetic-investigation",
        1,
        "SyntheticPLM",
        recordId,
        [],
        "requirement",
        "Synthetic requirement",
        text,
        $"synthetic://requirements/{recordId}/description",
        "R1",
        null,
        null,
        "current",
        "ready",
        "complete",
        ["available"],
        [],
        $"sha256:{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant()}",
        [],
        "synthetic-provenance",
        "source-authoritative",
        null);

    private static string GetFixtureDirectory()
    {
        foreach (var root in new[] { AppContext.BaseDirectory, Environment.CurrentDirectory })
        {
            for (var directory = new DirectoryInfo(root);
                 directory is not null;
                 directory = directory.Parent)
            {
                var candidate = Path.Combine(directory.FullName, "evals", "engineering-impact", "v1", "fixtures");
                if (Directory.Exists(candidate))
                {
                    return candidate;
                }
            }
        }

        throw new DirectoryNotFoundException("Could not locate the engineering-impact fixture directory.");
    }

    private sealed class DeterministicFakeEmbeddingProvider : ISourceEvidenceEmbeddingProvider
    {
        public int CallCount { get; private set; }

        public Task<IReadOnlyList<SourceEvidenceVector>> EmbedAsync(
            IReadOnlyList<string> texts,
            CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            CallCount++;
            IReadOnlyList<SourceEvidenceVector> vectors = texts
                .Select(text => new SourceEvidenceVector(
                    "deterministic-fake",
                    "v1",
                    Embed(text)))
                .ToArray();
            return Task.FromResult(vectors);
        }

        private static IReadOnlyList<float> Embed(string text)
        {
            var values = new float[8];
            foreach (var value in SHA256.HashData(Encoding.UTF8.GetBytes(text)))
            {
                var bucket = value % values.Length;
                values[bucket] += value / 255f;
            }
            return values;
        }
    }
}
