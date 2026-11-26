namespace Lattice.AI.Runtime.Evaluation.SourceEvidence;

public enum SourceEvidenceEvaluationScenario
{
    ExactIdentifier,
    Abbreviation,
    EngineeringVocabulary,
    CrossSystemTerms,
    Paraphrase,
    Distractors,
    LongRecord,
    ShortRecord,
    MissingText,
    ConflictingRevision
}

public sealed record SourceEvidenceEvaluationQuery(
    string QueryId,
    string Question,
    SourceEvidenceEvaluationScenario Scenario,
    int K,
    string? ExactRecordId);

public sealed record SourceEvidenceLabeledEvidence(
    string QueryId,
    string RecordId,
    string? ExpectedLocation);

public sealed record SourceEvidenceRetrievedItem(
    string RecordId,
    string? CitationLocation);

public sealed record SourceEvidenceRetrievedEvidence(
    string QueryId,
    RetrievalStrategy Strategy,
    IReadOnlyList<SourceEvidenceRetrievedItem> RankedResults);

public sealed record SourceEvidenceRetrievalStrategyMetrics(
    RetrievalStrategy Strategy,
    int QueryCount,
    int K,
    int ExactIdSuccessCount,
    int ExactIdQueryCount,
    double? ExactIdSuccessRate,
    double? RecallAtK,
    double? PrecisionAtK,
    double? MeanReciprocalRank,
    double? NormalizedDiscountedCumulativeGainAtK,
    int DuplicateRetrievalCount,
    int CitationLocationCorrectCount,
    int CitationLocationCount,
    double? CitationLocationAccuracy);

public sealed record SourceEvidenceRetrievalMetrics(
    int QueryCount,
    int K,
    IReadOnlyList<SourceEvidenceRetrievalStrategyMetrics> Strategies);

public sealed class SourceEvidenceRetrievalEvaluator
{
    private static readonly RetrievalStrategy[] Strategies = Enum.GetValues<RetrievalStrategy>();

    public SourceEvidenceRetrievalMetrics Evaluate(
        IReadOnlyList<SourceEvidenceEvaluationQuery> queries,
        IReadOnlyList<SourceEvidenceLabeledEvidence> labeledEvidence,
        IReadOnlyList<SourceEvidenceRetrievedEvidence> retrievedEvidence)
    {
        ArgumentNullException.ThrowIfNull(queries);
        ArgumentNullException.ThrowIfNull(labeledEvidence);
        ArgumentNullException.ThrowIfNull(retrievedEvidence);

        var queriesById = ValidateQueries(queries, out var k);
        var labelsByQuery = ValidateLabels(labeledEvidence, queriesById);
        var resultsByQueryAndStrategy = ValidateRankings(retrievedEvidence, queriesById);
        ValidateExactTargets(queries, labelsByQuery);

        var metrics = Strategies
            .Select(strategy => EvaluateStrategy(
                strategy,
                queries,
                labelsByQuery,
                resultsByQueryAndStrategy,
                k))
            .ToArray();

        return new SourceEvidenceRetrievalMetrics(queries.Count, k, metrics);
    }

    private static Dictionary<string, SourceEvidenceEvaluationQuery> ValidateQueries(
        IReadOnlyList<SourceEvidenceEvaluationQuery> queries,
        out int k)
    {
        if (queries.Count == 0)
        {
            throw new ArgumentException("At least one evaluation query is required.", nameof(queries));
        }

        var queriesById = new Dictionary<string, SourceEvidenceEvaluationQuery>(StringComparer.Ordinal);
        foreach (var query in queries)
        {
            if (query is null)
            {
                throw new ArgumentException("Evaluation queries cannot contain null entries.", nameof(queries));
            }
            if (string.IsNullOrWhiteSpace(query.QueryId))
            {
                throw new ArgumentException("Evaluation query IDs must be non-empty.", nameof(queries));
            }
            if (string.IsNullOrWhiteSpace(query.Question))
            {
                throw new ArgumentException($"Query '{query.QueryId}' must contain a question.", nameof(queries));
            }
            if (!Enum.IsDefined(query.Scenario))
            {
                throw new ArgumentException($"Query '{query.QueryId}' has an unsupported scenario.", nameof(queries));
            }
            if (query.K <= 0)
            {
                throw new ArgumentException($"Query '{query.QueryId}' must have a positive K.", nameof(queries));
            }
            if (query.ExactRecordId is not null && string.IsNullOrWhiteSpace(query.ExactRecordId))
            {
                throw new ArgumentException(
                    $"Query '{query.QueryId}' has an empty exact record ID.",
                    nameof(queries));
            }
            if (!queriesById.TryAdd(query.QueryId, query))
            {
                throw new ArgumentException($"Duplicate query ID '{query.QueryId}'.", nameof(queries));
            }
        }

        k = queries[0].K;
        var commonK = k;
        if (queries.Any(query => query.K != commonK))
        {
            throw new ArgumentException("All queries in one evaluation must use the same K.", nameof(queries));
        }

        return queriesById;
    }

    private static Dictionary<string, Dictionary<string, string?>> ValidateLabels(
        IReadOnlyList<SourceEvidenceLabeledEvidence> labeledEvidence,
        IReadOnlyDictionary<string, SourceEvidenceEvaluationQuery> queriesById)
    {
        var labelsByQuery = queriesById.Keys.ToDictionary(
            queryId => queryId,
            _ => new Dictionary<string, string?>(StringComparer.Ordinal),
            StringComparer.Ordinal);

        foreach (var label in labeledEvidence)
        {
            if (label is null)
            {
                throw new ArgumentException("Labeled evidence cannot contain null entries.", nameof(labeledEvidence));
            }
            if (string.IsNullOrWhiteSpace(label.QueryId))
            {
                throw new ArgumentException("Labeled evidence must reference a non-empty query ID.", nameof(labeledEvidence));
            }
            if (!labelsByQuery.TryGetValue(label.QueryId, out var queryLabels))
            {
                throw new ArgumentException(
                    $"Labeled evidence references unknown query '{label.QueryId}'.",
                    nameof(labeledEvidence));
            }
            if (string.IsNullOrWhiteSpace(label.RecordId))
            {
                throw new ArgumentException(
                    $"Labeled evidence for query '{label.QueryId}' has an empty record ID.",
                    nameof(labeledEvidence));
            }
            if (label.ExpectedLocation is not null && string.IsNullOrWhiteSpace(label.ExpectedLocation))
            {
                throw new ArgumentException(
                    $"Labeled evidence for record '{label.RecordId}' has an empty expected location.",
                    nameof(labeledEvidence));
            }
            if (!queryLabels.TryAdd(label.RecordId, label.ExpectedLocation))
            {
                throw new ArgumentException(
                    $"Duplicate labeled evidence '{label.RecordId}' for query '{label.QueryId}'.",
                    nameof(labeledEvidence));
            }
        }

        return labelsByQuery;
    }

    private static Dictionary<(string QueryId, RetrievalStrategy Strategy), IReadOnlyList<SourceEvidenceRetrievedItem>>
        ValidateRankings(
            IReadOnlyList<SourceEvidenceRetrievedEvidence> retrievedEvidence,
            IReadOnlyDictionary<string, SourceEvidenceEvaluationQuery> queriesById)
    {
        var rankings = new Dictionary<
            (string QueryId, RetrievalStrategy Strategy),
            IReadOnlyList<SourceEvidenceRetrievedItem>>();

        foreach (var result in retrievedEvidence)
        {
            if (result is null)
            {
                throw new ArgumentException(
                    "Retrieved evidence cannot contain null entries.",
                    nameof(retrievedEvidence));
            }
            if (string.IsNullOrWhiteSpace(result.QueryId))
            {
                throw new ArgumentException(
                    "Retrieved evidence must reference a non-empty query ID.",
                    nameof(retrievedEvidence));
            }
            if (!queriesById.ContainsKey(result.QueryId))
            {
                throw new ArgumentException(
                    $"Retrieved evidence references unknown query '{result.QueryId}'.",
                    nameof(retrievedEvidence));
            }
            if (!Enum.IsDefined(result.Strategy))
            {
                throw new ArgumentException(
                    $"Retrieved evidence for query '{result.QueryId}' has an unsupported strategy.",
                    nameof(retrievedEvidence));
            }
            if (result.RankedResults is null)
            {
                throw new ArgumentException(
                    $"Retrieved evidence for query '{result.QueryId}' has no ranking list.",
                    nameof(retrievedEvidence));
            }

            foreach (var item in result.RankedResults)
            {
                if (item is null || string.IsNullOrWhiteSpace(item.RecordId))
                {
                    throw new ArgumentException(
                        $"Retrieved evidence for query '{result.QueryId}' contains an empty record ID.",
                        nameof(retrievedEvidence));
                }
                if (item.CitationLocation is not null && string.IsNullOrWhiteSpace(item.CitationLocation))
                {
                    throw new ArgumentException(
                        $"Retrieved evidence for record '{item.RecordId}' has an empty citation location.",
                        nameof(retrievedEvidence));
                }
            }

            if (!rankings.TryAdd((result.QueryId, result.Strategy), result.RankedResults))
            {
                throw new ArgumentException(
                    $"Duplicate ranking for query '{result.QueryId}' and strategy '{result.Strategy}'.",
                    nameof(retrievedEvidence));
            }
        }

        var missingRanking = queriesById.Keys
            .SelectMany(queryId => Strategies.Select(strategy => (QueryId: queryId, Strategy: strategy)))
            .FirstOrDefault(key => !rankings.ContainsKey(key));
        if (missingRanking != default)
        {
            throw new ArgumentException(
                $"Missing ranking for query '{missingRanking.QueryId}' and strategy '{missingRanking.Strategy}'.",
                nameof(retrievedEvidence));
        }

        return rankings;
    }

    private static void ValidateExactTargets(
        IReadOnlyList<SourceEvidenceEvaluationQuery> queries,
        IReadOnlyDictionary<string, Dictionary<string, string?>> labelsByQuery)
    {
        foreach (var query in queries.Where(query => query.ExactRecordId is not null))
        {
            if (!labelsByQuery[query.QueryId].ContainsKey(query.ExactRecordId!))
            {
                throw new ArgumentException(
                    $"Exact record '{query.ExactRecordId}' for query '{query.QueryId}' must be labeled relevant.",
                    nameof(queries));
            }
        }
    }

    private static SourceEvidenceRetrievalStrategyMetrics EvaluateStrategy(
        RetrievalStrategy strategy,
        IReadOnlyList<SourceEvidenceEvaluationQuery> queries,
        IReadOnlyDictionary<string, Dictionary<string, string?>> labelsByQuery,
        IReadOnlyDictionary<(string QueryId, RetrievalStrategy Strategy), IReadOnlyList<SourceEvidenceRetrievedItem>>
            resultsByQueryAndStrategy,
        int k)
    {
        var precisionValues = new List<double>(queries.Count);
        var recallValues = new List<double>();
        var reciprocalRanks = new List<double>(queries.Count);
        var ndcgValues = new List<double>();
        var exactIdQueryCount = 0;
        var exactIdSuccessCount = 0;
        var duplicateRetrievalCount = 0;
        var citationLocationCount = 0;
        var citationLocationCorrectCount = 0;

        foreach (var query in queries)
        {
            var labels = labelsByQuery[query.QueryId];
            var results = resultsByQueryAndStrategy[(query.QueryId, strategy)];
            var topK = results.Take(k).ToArray();
            var uniqueRelevantAtK = GetUniqueRelevantResults(topK, labels);

            precisionValues.Add(uniqueRelevantAtK.Count / (double)k);
            if (labels.Count > 0)
            {
                recallValues.Add(uniqueRelevantAtK.Count / (double)labels.Count);
                ndcgValues.Add(CalculateNdcgAtK(topK, labels, k));
            }

            reciprocalRanks.Add(CalculateReciprocalRank(results, labels));
            duplicateRetrievalCount += results.Count
                - results.Select(result => result.RecordId).Distinct(StringComparer.Ordinal).Count();

            if (query.ExactRecordId is not null)
            {
                exactIdQueryCount++;
                if (results.FirstOrDefault()?.RecordId == query.ExactRecordId)
                {
                    exactIdSuccessCount++;
                }
            }

            foreach (var result in uniqueRelevantAtK)
            {
                var expectedLocation = labels[result.RecordId];
                if (expectedLocation is null)
                {
                    continue;
                }

                citationLocationCount++;
                if (string.Equals(result.CitationLocation, expectedLocation, StringComparison.Ordinal))
                {
                    citationLocationCorrectCount++;
                }
            }
        }

        return new SourceEvidenceRetrievalStrategyMetrics(
            strategy,
            queries.Count,
            k,
            exactIdSuccessCount,
            exactIdQueryCount,
            Rate(exactIdSuccessCount, exactIdQueryCount),
            AverageOrNull(recallValues),
            AverageOrNull(precisionValues),
            AverageOrNull(reciprocalRanks),
            AverageOrNull(ndcgValues),
            duplicateRetrievalCount,
            citationLocationCorrectCount,
            citationLocationCount,
            Rate(citationLocationCorrectCount, citationLocationCount));
    }

    private static IReadOnlyList<SourceEvidenceRetrievedItem> GetUniqueRelevantResults(
        IReadOnlyList<SourceEvidenceRetrievedItem> results,
        IReadOnlyDictionary<string, string?> labels)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        return results
            .Where(result => labels.ContainsKey(result.RecordId) && seen.Add(result.RecordId))
            .ToArray();
    }

    private static double CalculateReciprocalRank(
        IReadOnlyList<SourceEvidenceRetrievedItem> results,
        IReadOnlyDictionary<string, string?> labels)
    {
        for (var index = 0; index < results.Count; index++)
        {
            if (labels.ContainsKey(results[index].RecordId))
            {
                return 1d / (index + 1);
            }
        }

        return 0d;
    }

    private static double CalculateNdcgAtK(
        IReadOnlyList<SourceEvidenceRetrievedItem> results,
        IReadOnlyDictionary<string, string?> labels,
        int k)
    {
        var seenRelevant = new HashSet<string>(StringComparer.Ordinal);
        var discountedGain = 0d;
        for (var index = 0; index < results.Count && index < k; index++)
        {
            if (labels.ContainsKey(results[index].RecordId)
                && seenRelevant.Add(results[index].RecordId))
            {
                discountedGain += 1d / Math.Log2(index + 2);
            }
        }

        var idealRelevantCount = Math.Min(labels.Count, k);
        var idealDiscountedGain = Enumerable.Range(0, idealRelevantCount)
            .Sum(index => 1d / Math.Log2(index + 2));
        return idealDiscountedGain == 0 ? 0 : discountedGain / idealDiscountedGain;
    }

    private static double? Rate(int numerator, int denominator) =>
        denominator == 0 ? null : numerator / (double)denominator;

    private static double? AverageOrNull(IReadOnlyCollection<double> values) =>
        values.Count == 0 ? null : values.Average();
}
