using System.Diagnostics;
using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.Evaluation.SourceEvidence;

public enum RetrievalStrategy
{
    ExactMetadata,
    Lexical,
    Vector,
    HybridReciprocalRankFusion
}

public sealed record SourceEvidenceBenchmarkQuery(
    string QueryId,
    string Question,
    IReadOnlyList<string> ExpectedRecordIds)
{
    public int K { get; init; } = 3;
    public SourceEvidenceEvaluationScenario Scenario { get; init; } = SourceEvidenceEvaluationScenario.Paraphrase;
    public string? ExactRecordId { get; init; }
    public IReadOnlyDictionary<string, string?> ExpectedLocations { get; init; } =
        new Dictionary<string, string?>(StringComparer.Ordinal);
}

public sealed record SourceEvidenceBenchmarkDataset(
    string DatasetId,
    string CorpusClassification,
    IReadOnlyList<SourceEvidenceRecord> Records,
    IReadOnlyList<SourceEvidenceBenchmarkQuery> Queries);

public sealed record SourceEvidenceEmbeddingCostInputs(
    string Model,
    string ModelVersion,
    int EmbeddingDimensions,
    int InputTextCount,
    int InputCharacterCount);

public sealed record SourceEvidenceSegmentLengthProfile(
    int MinimumLength,
    double? MeanLength,
    double? MedianLength,
    int MaximumLength,
    IReadOnlyDictionary<int, int> Distribution);

public sealed record SourceEvidenceBenchmarkCandidateResult(
    SegmentationStrategy SegmentationStrategy,
    RetrievalStrategy RetrievalStrategy,
    int SegmentCount,
    SourceEvidenceSegmentLengthProfile SegmentLengths,
    int QueryCount,
    int RelevantQueryCount,
    int ExpectedEvidenceCount,
    int RetrievedExpectedEvidenceCount,
    double? RelevantEvidenceCoverage,
    int DuplicateRetrievalCount,
    int CitationLocationCorrectCount,
    int CitationLocationCount,
    double? CitationLocationAccuracy,
    double ElapsedMilliseconds,
    SourceEvidenceRetrievalStrategyMetrics RetrievalMetrics);

public sealed record SourceEvidenceBenchmarkReport(
    string DatasetId,
    string CorpusClassification,
    int RecordCount,
    int QueryCount,
    int EmbeddingCallCount,
    double ElapsedMilliseconds,
    SourceEvidenceEmbeddingCostInputs EmbeddingCostInputs,
    IReadOnlyList<SourceEvidenceBenchmarkCandidateResult> Results);

public sealed record SourceEvidenceEmbeddingModelCandidate(string Provider, string Model);

public sealed class SourceEvidenceBenchmarkRunner
{
    private const int ReciprocalRankFusionConstant = 60;
    private static readonly Regex TokenPattern = new(
        @"[A-Za-z0-9]+(?:[-_:][A-Za-z0-9]+)*",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly RetrievalStrategy[] RetrievalStrategies =
    [
        RetrievalStrategy.ExactMetadata,
        RetrievalStrategy.Lexical,
        RetrievalStrategy.Vector,
        RetrievalStrategy.HybridReciprocalRankFusion
    ];
    private static readonly SegmentationStrategy[] SegmentationStrategies =
    [
        SegmentationStrategy.WholeRecord,
        SegmentationStrategy.StructuralFieldGroups,
        SegmentationStrategy.StructuralSemantic
    ];

    public static IReadOnlyList<SourceEvidenceEmbeddingModelCandidate> ProvisionalEmbeddingCandidates { get; } =
    Array.AsReadOnly(new SourceEvidenceEmbeddingModelCandidate[]
    {
        new("Azure OpenAI", "text-embedding-3-small"),
        new("Azure OpenAI", "text-embedding-3-large")
    });

    private readonly SourceEvidenceSegmenter _segmenter = new();
    private readonly SourceEvidenceRetrievalEvaluator _retrievalEvaluator = new();

    public async Task<SourceEvidenceBenchmarkReport> RunAsync(
        SourceEvidenceBenchmarkDataset dataset,
        ISourceEvidenceEmbeddingProvider embeddingProvider,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dataset);
        ArgumentNullException.ThrowIfNull(embeddingProvider);
        ValidateDataset(dataset);

        var overallTimer = Stopwatch.StartNew();
        var recordsById = dataset.Records.ToDictionary(record => record.RecordId, StringComparer.Ordinal);
        var segmentsByStrategy = SegmentationStrategies.ToDictionary(
            strategy => strategy,
            strategy => dataset.Records
                .SelectMany(record => _segmenter.Segment(record, strategy))
                .ToArray());
        var allSegments = SegmentationStrategies
            .SelectMany(strategy => segmentsByStrategy[strategy])
            .ToArray();
        var embeddingInputs = allSegments
            .Select(segment => segment.Text)
            .Concat(dataset.Queries.Select(query => query.Question))
            .ToArray();

        var vectors = embeddingInputs.Length == 0
            ? Array.Empty<SourceEvidenceVector>()
            : (await embeddingProvider.EmbedAsync(embeddingInputs, cancellationToken).ConfigureAwait(false)).ToArray();
        ValidateVectors(vectors, embeddingInputs.Length);

        var segmentVectors = new Dictionary<string, SourceEvidenceVector>(StringComparer.Ordinal);
        for (var index = 0; index < allSegments.Length; index++)
        {
            segmentVectors.Add(allSegments[index].SegmentId, vectors[index]);
        }

        var queryVectorOffset = allSegments.Length;
        var results = new List<SourceEvidenceBenchmarkCandidateResult>();
        var evaluationQueries = dataset.Queries
            .Select(query => new SourceEvidenceEvaluationQuery(
                query.QueryId,
                query.Question,
                query.Scenario,
                query.K,
                query.ExactRecordId))
            .ToArray();
        var labels = dataset.Queries
            .SelectMany(query => query.ExpectedRecordIds.Select(recordId =>
                new SourceEvidenceLabeledEvidence(
                    query.QueryId,
                    recordId,
                    query.ExpectedLocations.GetValueOrDefault(recordId))))
            .ToArray();
        var vectorConfiguration = DescribeVectors(vectors);

        foreach (var segmentationStrategy in SegmentationStrategies)
        {
            var segments = segmentsByStrategy[segmentationStrategy];
            var candidateResults = new List<PendingBenchmarkCandidateResult>();
            var strategyRankings = new List<SourceEvidenceRetrievedEvidence>();
            foreach (var retrievalStrategy in RetrievalStrategies)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var candidateTimer = Stopwatch.StartNew();
                var relevantQueryCount = 0;
                var expectedEvidenceCount = 0;
                var retrievedExpectedEvidenceCount = 0;
                var duplicateRetrievalCount = 0;
                var citationLocationCount = 0;
                var citationLocationCorrectCount = 0;
                var rankedResultsByQuery = new List<SourceEvidenceRetrievedEvidence>(dataset.Queries.Count);

                for (var queryIndex = 0; queryIndex < dataset.Queries.Count; queryIndex++)
                {
                    var query = dataset.Queries[queryIndex];
                    var queryVector = vectors[queryVectorOffset + queryIndex];
                    var ranked = Rank(
                        retrievalStrategy,
                        query,
                        queryVector,
                        segments,
                        recordsById,
                        segmentVectors);
                    rankedResultsByQuery.Add(new SourceEvidenceRetrievedEvidence(
                        query.QueryId,
                        retrievalStrategy,
                        ranked.Select(item => new SourceEvidenceRetrievedItem(
                            item.Segment.RecordId,
                            string.IsNullOrWhiteSpace(item.Segment.Location) ? null : item.Segment.Location)).ToArray()));
                    var selected = ranked.Take(query.K).ToArray();
                    var expectedIds = query.ExpectedRecordIds.ToHashSet(StringComparer.Ordinal);
                    var selectedRecordIds = selected
                        .Select(item => item.Segment.RecordId)
                        .ToHashSet(StringComparer.Ordinal);
                    var hits = expectedIds.Intersect(selectedRecordIds, StringComparer.Ordinal).Count();

                    expectedEvidenceCount += expectedIds.Count;
                    retrievedExpectedEvidenceCount += hits;
                    if (hits > 0)
                    {
                        relevantQueryCount++;
                    }

                    duplicateRetrievalCount += selected.Length
                        - selected.Select(item => item.Segment.RecordId)
                            .Distinct(StringComparer.Ordinal)
                            .Count();
                    citationLocationCount += selected.Length;
                    citationLocationCorrectCount += selected.Count(item =>
                        HasCorrectCitationLocation(item.Segment, recordsById[item.Segment.RecordId]));
                }

                candidateTimer.Stop();
                candidateResults.Add(new PendingBenchmarkCandidateResult(
                    segmentationStrategy,
                    retrievalStrategy,
                    segments.Length,
                    ProfileSegmentLengths(segments),
                    dataset.Queries.Count,
                    relevantQueryCount,
                    expectedEvidenceCount,
                    retrievedExpectedEvidenceCount,
                    Rate(retrievedExpectedEvidenceCount, expectedEvidenceCount),
                    duplicateRetrievalCount,
                    citationLocationCorrectCount,
                    citationLocationCount,
                    Rate(citationLocationCorrectCount, citationLocationCount),
                    candidateTimer.Elapsed.TotalMilliseconds));
                strategyRankings.AddRange(rankedResultsByQuery);
            }

            var retrievalMetrics = _retrievalEvaluator.Evaluate(
                evaluationQueries,
                labels,
                strategyRankings);
            var metricsByStrategy = retrievalMetrics.Strategies
                .ToDictionary(metric => metric.Strategy);
            results.AddRange(candidateResults.Select(candidate => new SourceEvidenceBenchmarkCandidateResult(
                candidate.SegmentationStrategy,
                candidate.RetrievalStrategy,
                candidate.SegmentCount,
                candidate.SegmentLengths,
                candidate.QueryCount,
                candidate.RelevantQueryCount,
                candidate.ExpectedEvidenceCount,
                candidate.RetrievedExpectedEvidenceCount,
                candidate.RelevantEvidenceCoverage,
                candidate.DuplicateRetrievalCount,
                candidate.CitationLocationCorrectCount,
                candidate.CitationLocationCount,
                candidate.CitationLocationAccuracy,
                candidate.ElapsedMilliseconds,
                metricsByStrategy[candidate.RetrievalStrategy])));
        }

        overallTimer.Stop();
        return new SourceEvidenceBenchmarkReport(
            dataset.DatasetId,
            dataset.CorpusClassification,
            dataset.Records.Count,
            dataset.Queries.Count,
            embeddingInputs.Length == 0 ? 0 : 1,
            overallTimer.Elapsed.TotalMilliseconds,
            new SourceEvidenceEmbeddingCostInputs(
                vectorConfiguration.Model,
                vectorConfiguration.Version,
                vectorConfiguration.Dimensions,
                embeddingInputs.Length,
                embeddingInputs.Sum(text => text.Length)),
            results);
    }

    private static IReadOnlyList<RankedSegment> Rank(
        RetrievalStrategy strategy,
        SourceEvidenceBenchmarkQuery query,
        SourceEvidenceVector queryVector,
        IReadOnlyList<SourceEvidenceSegment> segments,
        IReadOnlyDictionary<string, SourceEvidenceRecord> recordsById,
        IReadOnlyDictionary<string, SourceEvidenceVector> segmentVectors)
    {
        var exact = RankExactMetadata(query, segments, recordsById);
        if (strategy == RetrievalStrategy.ExactMetadata)
        {
            return exact;
        }

        var lexical = RankLexical(query, segments, recordsById);
        if (strategy == RetrievalStrategy.Lexical)
        {
            return lexical;
        }

        var vector = RankVector(queryVector, segments, segmentVectors);
        if (strategy == RetrievalStrategy.Vector)
        {
            return vector;
        }

        var fusedScores = new Dictionary<string, (SourceEvidenceSegment Segment, double Score)>(StringComparer.Ordinal);
        AddReciprocalRankScores(fusedScores, exact);
        AddReciprocalRankScores(fusedScores, lexical);
        AddReciprocalRankScores(fusedScores, vector);
        return Order(fusedScores.Values.Select(item => new RankedSegment(item.Segment, item.Score)));
    }

    private static IReadOnlyList<RankedSegment> RankExactMetadata(
        SourceEvidenceBenchmarkQuery query,
        IReadOnlyList<SourceEvidenceSegment> segments,
        IReadOnlyDictionary<string, SourceEvidenceRecord> recordsById)
    {
        var queryTerms = Tokenize(query.Question);
        var queryIdentifiers = queryTerms
            .Where(term => term.Any(char.IsDigit) && term.Any(character => character is '-' or '_' or ':'))
            .ToArray();
        return Order(segments.Select(segment =>
        {
            var record = recordsById[segment.RecordId];
            var identifierMetadata = new[]
            {
                record.RecordId,
                record.SourceRecordId,
                record.SourceRevision ?? "",
                record.Location,
                string.Join(' ', record.CanonicalEntityIds),
                string.Join(' ', record.EvidenceIds)
            };
            var identifierScore = queryIdentifiers.Count(identifier =>
                identifierMetadata.Any(value => ContainsIdentifier(value, identifier)));
            var sourceApplicationTerms = Tokenize(record.SourceApplication)
                .ToHashSet(StringComparer.Ordinal);
            var sourceApplicationScore = queryTerms
                .Distinct(StringComparer.Ordinal)
                .Count(sourceApplicationTerms.Contains);
            var score = (identifierScore * 100) + sourceApplicationScore;

            return new RankedSegment(segment, score);
        }).Where(result => result.Score > 0));
    }

    private static IReadOnlyList<RankedSegment> RankLexical(
        SourceEvidenceBenchmarkQuery query,
        IReadOnlyList<SourceEvidenceSegment> segments,
        IReadOnlyDictionary<string, SourceEvidenceRecord> recordsById)
    {
        var queryTerms = Tokenize(query.Question).ToHashSet(StringComparer.Ordinal);
        return Order(segments.Select(segment =>
        {
            var record = recordsById[segment.RecordId];
            var searchableTerms = Tokenize(string.Join(
                ' ',
                segment.Text,
                record.Title,
                record.SourceApplication,
                record.RecordType)).ToHashSet(StringComparer.Ordinal);
            var score = queryTerms.Count(searchableTerms.Contains);
            return new RankedSegment(segment, score);
        }).Where(result => result.Score > 0));
    }

    private static IReadOnlyList<RankedSegment> RankVector(
        SourceEvidenceVector queryVector,
        IReadOnlyList<SourceEvidenceSegment> segments,
        IReadOnlyDictionary<string, SourceEvidenceVector> segmentVectors) =>
        Order(segments.Select(segment =>
            new RankedSegment(
                segment,
                CosineSimilarity(queryVector.Values, segmentVectors[segment.SegmentId].Values))));

    private static IReadOnlyList<RankedSegment> Order(IEnumerable<RankedSegment> items) =>
        items.OrderByDescending(item => item.Score)
            .ThenBy(item => item.Segment.RecordId, StringComparer.Ordinal)
            .ThenBy(item => item.Segment.StartOffset)
            .ThenBy(item => item.Segment.SegmentId, StringComparer.Ordinal)
            .ToArray();

    private static void AddReciprocalRankScores(
        IDictionary<string, (SourceEvidenceSegment Segment, double Score)> scores,
        IReadOnlyList<RankedSegment> ranked)
    {
        for (var index = 0; index < ranked.Count; index++)
        {
            var item = ranked[index];
            var reciprocalRankScore = 1d / (ReciprocalRankFusionConstant + index + 1);
            if (scores.TryGetValue(item.Segment.SegmentId, out var existing))
            {
                scores[item.Segment.SegmentId] = (existing.Segment, existing.Score + reciprocalRankScore);
            }
            else
            {
                scores[item.Segment.SegmentId] = (item.Segment, reciprocalRankScore);
            }
        }
    }

    private static double CosineSimilarity(IReadOnlyList<float> left, IReadOnlyList<float> right)
    {
        double dotProduct = 0;
        double leftMagnitude = 0;
        double rightMagnitude = 0;
        for (var index = 0; index < left.Count; index++)
        {
            dotProduct += left[index] * right[index];
            leftMagnitude += left[index] * left[index];
            rightMagnitude += right[index] * right[index];
        }

        return leftMagnitude == 0 || rightMagnitude == 0
            ? 0
            : dotProduct / (Math.Sqrt(leftMagnitude) * Math.Sqrt(rightMagnitude));
    }

    private static bool HasCorrectCitationLocation(
        SourceEvidenceSegment segment,
        SourceEvidenceRecord record) =>
        !string.IsNullOrWhiteSpace(segment.Location)
        && segment.StartOffset >= 0
        && segment.EndOffset > segment.StartOffset
        && segment.EndOffset <= record.SearchableText.Length
        && string.Equals(
            record.SearchableText.Substring(segment.StartOffset, segment.EndOffset - segment.StartOffset),
            segment.Text,
            StringComparison.Ordinal);

    private static string[] Tokenize(string value) =>
        TokenPattern.Matches(value)
            .Select(match => match.Value.ToUpperInvariant())
            .ToArray();

    private static bool ContainsIdentifier(string value, string identifier)
    {
        var index = value.IndexOf(identifier, StringComparison.OrdinalIgnoreCase);
        while (index >= 0)
        {
            var end = index + identifier.Length;
            var hasLeadingBoundary = index == 0 || !char.IsLetterOrDigit(value[index - 1]);
            var hasTrailingBoundary = end == value.Length || !char.IsLetterOrDigit(value[end]);
            if (hasLeadingBoundary && hasTrailingBoundary)
            {
                return true;
            }

            index = value.IndexOf(identifier, index + 1, StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }

    private static double? Rate(int numerator, int denominator) =>
        denominator == 0 ? null : (double)numerator / denominator;

    private static SourceEvidenceSegmentLengthProfile ProfileSegmentLengths(
        IReadOnlyList<SourceEvidenceSegment> segments)
    {
        var lengths = segments.Select(segment => segment.Text.Length).Order().ToArray();
        var middle = lengths.Length / 2;
        var median = lengths.Length switch
        {
            0 => (double?)null,
            _ when lengths.Length % 2 == 0 => (lengths[middle - 1] + lengths[middle]) / 2d,
            _ => lengths[middle]
        };
        return new SourceEvidenceSegmentLengthProfile(
            lengths.FirstOrDefault(),
            lengths.Length == 0 ? null : lengths.Average(),
            median,
            lengths.LastOrDefault(),
            lengths.GroupBy(length => length)
                .OrderBy(group => group.Key)
                .ToDictionary(group => group.Key, group => group.Count()));
    }

    private static void ValidateDataset(SourceEvidenceBenchmarkDataset dataset)
    {
        if (string.IsNullOrWhiteSpace(dataset.DatasetId))
        {
            throw new ArgumentException("A benchmark dataset ID is required.", nameof(dataset));
        }

        if (dataset.CorpusClassification is not "synthetic-fixture-only" and not "approved-sanitized")
        {
            throw new ArgumentException(
                "Benchmarks accept only synthetic fixtures or approved sanitized corpora.",
                nameof(dataset));
        }

        ArgumentNullException.ThrowIfNull(dataset.Records);
        ArgumentNullException.ThrowIfNull(dataset.Queries);
        if (dataset.Records.Any(record => record is null))
        {
            throw new ArgumentException("The benchmark dataset contains a null record.", nameof(dataset));
        }
        if (dataset.Queries.Any(query =>
            query is null
            || string.IsNullOrWhiteSpace(query.QueryId)
            || string.IsNullOrWhiteSpace(query.Question)
            || query.ExpectedRecordIds is null
            || query.K <= 0
            || !Enum.IsDefined(query.Scenario)
            || query.ExpectedRecordIds.Any(string.IsNullOrWhiteSpace)
            || query.ExpectedRecordIds.Distinct(StringComparer.Ordinal).Count() != query.ExpectedRecordIds.Count))
        {
            throw new ArgumentException("The benchmark dataset contains an invalid query.", nameof(dataset));
        }
        if (dataset.Records.Select(record => record.RecordId).Distinct(StringComparer.Ordinal).Count()
            != dataset.Records.Count)
        {
            throw new ArgumentException("Record IDs must be unique within a benchmark dataset.", nameof(dataset));
        }
        if (dataset.Queries.Select(query => query.QueryId).Distinct(StringComparer.Ordinal).Count()
            != dataset.Queries.Count)
        {
            throw new ArgumentException("Query IDs must be unique within a benchmark dataset.", nameof(dataset));
        }
        if (dataset.Queries.Select(query => query.K).Distinct().Count() > 1)
        {
            throw new ArgumentException("All benchmark queries must use the same K.", nameof(dataset));
        }
        if (dataset.Queries.Any(query =>
            query.ExactRecordId is not null &&
            !query.ExpectedRecordIds.Contains(query.ExactRecordId, StringComparer.Ordinal)))
        {
            throw new ArgumentException("An exact record target must be labeled as relevant.", nameof(dataset));
        }
        if (dataset.Queries.Any(query =>
            query.ExpectedRecordIds.Any(recordId => !dataset.Records.Any(record =>
                string.Equals(record.RecordId, recordId, StringComparison.Ordinal)))))
        {
            throw new ArgumentException("Every expected record ID must exist in the benchmark dataset.", nameof(dataset));
        }
    }

    private static void ValidateVectors(
        IReadOnlyList<SourceEvidenceVector> vectors,
        int expectedCount)
    {
        if (vectors.Count != expectedCount)
        {
            throw new InvalidDataException(
                $"The embedding provider returned {vectors.Count} vectors for {expectedCount} input texts.");
        }

        if (vectors.Count == 0)
        {
            return;
        }

        var first = vectors[0];
        if (string.IsNullOrWhiteSpace(first.Model)
            || string.IsNullOrWhiteSpace(first.Version)
            || first.Values.Count == 0)
        {
            throw new InvalidDataException("Embedding model metadata and non-empty vectors are required.");
        }

        var dimension = first.Values.Count;
        foreach (var vector in vectors)
        {
            if (!string.Equals(vector.Model, first.Model, StringComparison.Ordinal)
                || !string.Equals(vector.Version, first.Version, StringComparison.Ordinal)
                || vector.Values.Count != dimension
                || vector.Values.Any(value => !float.IsFinite(value)))
            {
                throw new InvalidDataException(
                    "Embedding vectors must have finite values and consistent model, version, and dimensions.");
            }
        }
    }

    private static (string Model, string Version, int Dimensions) DescribeVectors(
        IReadOnlyList<SourceEvidenceVector> vectors) =>
        vectors.Count == 0
            ? ("none", "none", 0)
            : (vectors[0].Model, vectors[0].Version, vectors[0].Values.Count);

    private sealed record RankedSegment(SourceEvidenceSegment Segment, double Score);

    private sealed record PendingBenchmarkCandidateResult(
        SegmentationStrategy SegmentationStrategy,
        RetrievalStrategy RetrievalStrategy,
        int SegmentCount,
        SourceEvidenceSegmentLengthProfile SegmentLengths,
        int QueryCount,
        int RelevantQueryCount,
        int ExpectedEvidenceCount,
        int RetrievedExpectedEvidenceCount,
        double? RelevantEvidenceCoverage,
        int DuplicateRetrievalCount,
        int CitationLocationCorrectCount,
        int CitationLocationCount,
        double? CitationLocationAccuracy,
        double ElapsedMilliseconds);
}
