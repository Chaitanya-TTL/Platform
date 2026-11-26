using System.Text.Json;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Evaluation.SourceEvidence;
using Xunit.Abstractions;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class SourceEvidenceRetrievalEvaluatorTests(ITestOutputHelper output)
{
    [Fact]
    public void Evaluate_ComputesMetricsFromHandLabeledRankings()
    {
        var queries = new[]
        {
            new SourceEvidenceEvaluationQuery(
                "query-exact",
                "Synthetic query containing identifier A.",
                SourceEvidenceEvaluationScenario.ExactIdentifier,
                3,
                "A"),
            new SourceEvidenceEvaluationQuery(
                "query-semantic",
                "Synthetic paraphrase question.",
                SourceEvidenceEvaluationScenario.Paraphrase,
                3,
                null),
            new SourceEvidenceEvaluationQuery(
                "query-unanswerable",
                "Synthetic question with no matching evidence.",
                SourceEvidenceEvaluationScenario.MissingText,
                3,
                null)
        };
        var labels = new[]
        {
            new SourceEvidenceLabeledEvidence("query-exact", "A", "synthetic://A"),
            new SourceEvidenceLabeledEvidence("query-exact", "B", "synthetic://B"),
            new SourceEvidenceLabeledEvidence("query-semantic", "C", "synthetic://C")
        };
        var ranked = new[]
        {
            new SourceEvidenceRetrievedEvidence("query-exact", RetrievalStrategy.ExactMetadata,
                [new("A", "synthetic://A"), new("A", "synthetic://A"), new("X", null)]),
            new SourceEvidenceRetrievedEvidence("query-semantic", RetrievalStrategy.ExactMetadata,
                [new("X", null), new("C", "wrong://C")]),
            new SourceEvidenceRetrievedEvidence("query-unanswerable", RetrievalStrategy.ExactMetadata, []),

            new SourceEvidenceRetrievedEvidence("query-exact", RetrievalStrategy.Lexical,
                [new("X", null), new("A", "synthetic://A"), new("B", "wrong://B")]),
            new SourceEvidenceRetrievedEvidence("query-semantic", RetrievalStrategy.Lexical,
                [new("C", "synthetic://C"), new("X", null)]),
            new SourceEvidenceRetrievedEvidence("query-unanswerable", RetrievalStrategy.Lexical, []),

            new SourceEvidenceRetrievedEvidence("query-exact", RetrievalStrategy.Vector,
                [new("B", "synthetic://B"), new("X", null), new("A", "wrong://A")]),
            new SourceEvidenceRetrievedEvidence("query-semantic", RetrievalStrategy.Vector,
                [new("X", null), new("C", "wrong://C")]),
            new SourceEvidenceRetrievedEvidence("query-unanswerable", RetrievalStrategy.Vector,
                [new("D", "synthetic://D")]),

            new SourceEvidenceRetrievedEvidence("query-exact", RetrievalStrategy.HybridReciprocalRankFusion,
                [new("A", "synthetic://A"), new("B", "synthetic://B"), new("X", null)]),
            new SourceEvidenceRetrievedEvidence("query-semantic", RetrievalStrategy.HybridReciprocalRankFusion,
                [new("C", "synthetic://C")]),
            new SourceEvidenceRetrievedEvidence("query-unanswerable", RetrievalStrategy.HybridReciprocalRankFusion, [])
        };

        var report = new SourceEvidenceRetrievalEvaluator().Evaluate(queries, labels, ranked);

        var exact = Assert.Single(report.Strategies, result =>
            result.Strategy == RetrievalStrategy.ExactMetadata);
        Assert.Equal(3, exact.QueryCount);
        Assert.Equal(3, exact.K);
        Assert.Equal(1, exact.ExactIdSuccessCount);
        Assert.Equal(1, exact.ExactIdQueryCount);
        Assert.Equal(1d, exact.ExactIdSuccessRate);
        Assert.Equal(0.75, exact.RecallAtK);
        Assert.Equal(2d / 9d, exact.PrecisionAtK!.Value, 10);
        Assert.Equal(0.5, exact.MeanReciprocalRank);
        Assert.Equal(
            (1d / (1d + 1d / Math.Log2(3d))) / 2d
                + (1d / Math.Log2(3d)) / 2d,
            exact.NormalizedDiscountedCumulativeGainAtK!.Value,
            6);
        Assert.Equal(1, exact.DuplicateRetrievalCount);
        Assert.Equal(1, exact.CitationLocationCorrectCount);
        Assert.Equal(2, exact.CitationLocationCount);
        Assert.Equal(0.5, exact.CitationLocationAccuracy);

        var hybrid = Assert.Single(report.Strategies, result =>
            result.Strategy == RetrievalStrategy.HybridReciprocalRankFusion);
        Assert.Equal(1, hybrid.ExactIdSuccessCount);
        Assert.Equal(1d, hybrid.RecallAtK);
        Assert.Equal(1d / 3d, hybrid.PrecisionAtK!.Value, 10);
        Assert.Equal(2d / 3d, hybrid.MeanReciprocalRank!.Value, 10);
        Assert.Equal(1d, hybrid.NormalizedDiscountedCumulativeGainAtK);
        Assert.Equal(1d, hybrid.CitationLocationAccuracy);
    }

    [Fact]
    public void Evaluate_UsesSyntheticLabelsAcrossAllRetrievalStrategies()
    {
        var fixture = ReadLabels();
        Assert.Equal("synthetic-fixture-only", fixture.CorpusClassification);
        Assert.Equal(
            Enum.GetValues<SourceEvidenceEvaluationScenario>().Order(),
            fixture.Queries.Select(query => query.Scenario).Distinct().Order());

        var report = new SourceEvidenceRetrievalEvaluator().Evaluate(
            fixture.Queries,
            fixture.LabeledEvidence,
            CreateScenarioRankings(fixture));

        Assert.Equal(fixture.Queries.Count, report.QueryCount);
        Assert.Equal(3, report.K);
        Assert.Equal(4, report.Strategies.Count);
        Assert.All(report.Strategies, strategy =>
        {
            Assert.Equal(fixture.Queries.Count, strategy.QueryCount);
            Assert.InRange(strategy.PrecisionAtK ?? 0, 0, 1);
            Assert.InRange(strategy.RecallAtK ?? 0, 0, 1);
            Assert.InRange(strategy.MeanReciprocalRank ?? 0, 0, 1);
            Assert.InRange(strategy.NormalizedDiscountedCumulativeGainAtK ?? 0, 0, 1);
            Assert.InRange(strategy.CitationLocationAccuracy ?? 0, 0, 1);
        });

        var reportJson = JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true,
            Converters = { new JsonStringEnumConverter() }
        });
        Assert.DoesNotContain(fixture.Queries[0].Question, reportJson, StringComparison.Ordinal);
        output.WriteLine(
            $"Dataset: {fixture.DatasetId} ({fixture.CorpusClassification}); rankings are deterministic synthetic evaluator inputs, not search-engine results.");
        output.WriteLine(reportJson);
    }

    [Fact]
    public void Evaluate_RejectsIncompleteQueryAndStrategyMatrix()
    {
        var query = new SourceEvidenceEvaluationQuery(
            "query-1",
            "Synthetic query.",
            SourceEvidenceEvaluationScenario.Paraphrase,
            3,
            null);
        var incompleteResults = Enum.GetValues<RetrievalStrategy>()
            .Where(strategy => strategy != RetrievalStrategy.Vector)
            .Select(strategy => new SourceEvidenceRetrievedEvidence("query-1", strategy, []))
            .ToArray();

        Assert.Throws<ArgumentException>(() =>
            new SourceEvidenceRetrievalEvaluator().Evaluate([query], [], incompleteResults));
    }

    [Fact]
    public void Evaluate_LeavesUndefinedRatesNullForAnUnanswerableSet()
    {
        var query = new SourceEvidenceEvaluationQuery(
            "query-1",
            "Synthetic query without matching evidence.",
            SourceEvidenceEvaluationScenario.MissingText,
            3,
            null);
        var ranked = Enum.GetValues<RetrievalStrategy>()
            .Select(strategy => new SourceEvidenceRetrievedEvidence("query-1", strategy, []))
            .ToArray();

        var report = new SourceEvidenceRetrievalEvaluator().Evaluate([query], [], ranked);

        Assert.All(report.Strategies, strategy =>
        {
            Assert.Null(strategy.ExactIdSuccessRate);
            Assert.Null(strategy.RecallAtK);
            Assert.Equal(0d, strategy.PrecisionAtK);
            Assert.Equal(0d, strategy.MeanReciprocalRank);
            Assert.Null(strategy.NormalizedDiscountedCumulativeGainAtK);
            Assert.Null(strategy.CitationLocationAccuracy);
        });
    }

    private static IReadOnlyList<SourceEvidenceRetrievedEvidence> CreateScenarioRankings(
        RetrievalLabelsFixture fixture)
    {
        var results = new List<SourceEvidenceRetrievedEvidence>();
        foreach (var query in fixture.Queries)
        {
            var labels = fixture.LabeledEvidence
                .Where(evidence => evidence.QueryId == query.QueryId)
                .ToArray();
            var relevant = labels
                .Select(evidence => new SourceEvidenceRetrievedItem(evidence.RecordId, evidence.ExpectedLocation))
                .ToArray();
            var distractorId = query.Scenario == SourceEvidenceEvaluationScenario.ConflictingRevision
                ? "SYNTH-REQ-001-DESC-OLD-REV"
                : "SYNTH-DISTRACTOR-001";
            var distractor = new SourceEvidenceRetrievedItem(distractorId, "synthetic://distractor");

            results.Add(new SourceEvidenceRetrievedEvidence(
                query.QueryId,
                RetrievalStrategy.ExactMetadata,
                query.ExactRecordId is null
                    ? []
                    : [new SourceEvidenceRetrievedItem(query.ExactRecordId, labels.Single(label => label.RecordId == query.ExactRecordId).ExpectedLocation)]));
            results.Add(new SourceEvidenceRetrievedEvidence(
                query.QueryId,
                RetrievalStrategy.Lexical,
                relevant.Length == 0 ? [] : [distractor, .. relevant]));
            results.Add(new SourceEvidenceRetrievedEvidence(
                query.QueryId,
                RetrievalStrategy.Vector,
                relevant.Length == 0 ? [] : [.. relevant.Reverse(), distractor]));
            results.Add(new SourceEvidenceRetrievedEvidence(
                query.QueryId,
                RetrievalStrategy.HybridReciprocalRankFusion,
                [.. relevant, distractor]));
        }

        return results;
    }

    private static RetrievalLabelsFixture ReadLabels()
    {
        var fixtureDirectory = GetFixtureDirectory();
        var path = Path.Combine(fixtureDirectory, "source-evidence", "labels.json");
        var fixture = JsonSerializer.Deserialize<RetrievalLabelsFixture>(
            File.ReadAllText(path),
            new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                Converters = { new JsonStringEnumConverter() }
            });
        return fixture ?? throw new InvalidDataException("The source-evidence labels fixture is empty.");
    }

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

    private sealed record RetrievalLabelsFixture(
        string DatasetId,
        string CorpusClassification,
        IReadOnlyList<SourceEvidenceEvaluationQuery> Queries,
        IReadOnlyList<SourceEvidenceLabeledEvidence> LabeledEvidence);
}
