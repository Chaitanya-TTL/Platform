using System.Collections.ObjectModel;
using System.Text;
using System.Text.RegularExpressions;

namespace Lattice.AI.Runtime.Evaluation.SourceEvidence;

public sealed record SourceEvidenceFixtureRecord(
    string RecordId,
    string SourceApplication,
    string RecordType,
    string? SearchableText,
    string? SourceRevision,
    string? Location,
    string? ProvenanceId,
    string? Freshness);

public sealed record SourceEvidenceCorpusProfile(
    string CorpusClassification,
    int RecordCount,
    IReadOnlyDictionary<string, int> RecordCountsByApplication,
    IReadOnlyDictionary<string, int> RecordCountsByType,
    int EligibleSourceTextRecordCount,
    int EmptyTextRecordCount,
    int IdentifierOnlyTextRecordCount,
    int MinimumTextLength,
    double? MeanTextLength,
    double? MedianTextLength,
    int MaximumTextLength,
    IReadOnlyDictionary<int, int> TextLengthDistribution,
    int ExactDuplicateRecordCount,
    double? ExactDuplicateRate,
    int NormalizedDuplicateRecordCount,
    double? NormalizedDuplicateRate,
    int RevisionCoveredRecordCount,
    double? RevisionCoverageRate,
    int ProvenanceCoveredRecordCount,
    double? ProvenanceCoverageRate,
    int LocationCoveredRecordCount,
    double? LocationCoverageRate);

public sealed class SourceEvidenceCorpusProfiler
{
    private const string SyntheticCorpusClassification = "synthetic-fixture-only";
    private static readonly Regex IdentifierTokenPattern = new(
        @"[A-Za-z0-9]+(?:[-_:][A-Za-z0-9]+)*",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex WhitespacePattern = new(
        @"\s+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public SourceEvidenceCorpusProfile Profile(IReadOnlyList<SourceEvidenceFixtureRecord> records)
    {
        ArgumentNullException.ThrowIfNull(records);

        var emptyTextRecordCount = 0;
        var identifierOnlyTextRecordCount = 0;
        var eligibleRecords = new List<(SourceEvidenceFixtureRecord Record, string Text)>();

        foreach (var record in records)
        {
            ArgumentNullException.ThrowIfNull(record);

            if (string.IsNullOrWhiteSpace(record.SearchableText))
            {
                emptyTextRecordCount++;
            }
            else if (IsIdentifierOnly(record.SearchableText))
            {
                identifierOnlyTextRecordCount++;
            }
            else
            {
                eligibleRecords.Add((record, record.SearchableText));
            }
        }

        var textLengths = eligibleRecords
            .Select(item => item.Text.Length)
            .Order()
            .ToArray();
        var exactDuplicateRecordCount = CountDuplicateRecords(
            eligibleRecords.Select(item => item.Text),
            StringComparer.Ordinal);
        var normalizedDuplicateRecordCount = CountDuplicateRecords(
            eligibleRecords.Select(item => NormalizeText(item.Text)),
            StringComparer.Ordinal);
        var eligibleCount = eligibleRecords.Count;

        return new SourceEvidenceCorpusProfile(
            SyntheticCorpusClassification,
            records.Count,
            CountBy(records, record => record.SourceApplication),
            CountBy(records, record => record.RecordType),
            eligibleCount,
            emptyTextRecordCount,
            identifierOnlyTextRecordCount,
            textLengths.FirstOrDefault(),
            textLengths.Length == 0 ? null : textLengths.Average(),
            Median(textLengths),
            textLengths.LastOrDefault(),
            new ReadOnlyDictionary<int, int>(textLengths
                .GroupBy(length => length)
                .OrderBy(group => group.Key)
                .ToDictionary(group => group.Key, group => group.Count())),
            exactDuplicateRecordCount,
            Rate(exactDuplicateRecordCount, eligibleCount),
            normalizedDuplicateRecordCount,
            Rate(normalizedDuplicateRecordCount, eligibleCount),
            CountCovered(eligibleRecords, record => record.SourceRevision),
            CoverageRate(eligibleRecords, record => record.SourceRevision),
            CountCovered(eligibleRecords, record => record.ProvenanceId),
            CoverageRate(eligibleRecords, record => record.ProvenanceId),
            CountCovered(eligibleRecords, record => record.Location),
            CoverageRate(eligibleRecords, record => record.Location));
    }

    private static bool IsIdentifierOnly(string text)
    {
        var tokens = IdentifierTokenPattern.Matches(text);
        return tokens.Count > 0 && tokens.All(token => token.Value.Any(char.IsDigit));
    }

    private static string NormalizeText(string text) =>
        WhitespacePattern.Replace(text.Normalize(NormalizationForm.FormKC).Trim(), " ").ToUpperInvariant();

    private static int CountDuplicateRecords(IEnumerable<string> values, StringComparer comparer)
    {
        var groups = values.GroupBy(value => value, comparer);
        return groups.Sum(group => group.Count() - 1);
    }

    private static double? Median(IReadOnlyList<int> values)
    {
        if (values.Count == 0)
        {
            return null;
        }

        var middle = values.Count / 2;
        return values.Count % 2 == 0
            ? (values[middle - 1] + values[middle]) / 2d
            : values[middle];
    }

    private static IReadOnlyDictionary<string, int> CountBy(
        IEnumerable<SourceEvidenceFixtureRecord> records,
        Func<SourceEvidenceFixtureRecord, string> selector) =>
        new ReadOnlyDictionary<string, int>(records
            .GroupBy(record => string.IsNullOrWhiteSpace(selector(record)) ? "(missing)" : selector(record),
                StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal));

    private static int CountCovered(
        IEnumerable<(SourceEvidenceFixtureRecord Record, string Text)> records,
        Func<SourceEvidenceFixtureRecord, string?> selector) =>
        records.Count(item => !string.IsNullOrWhiteSpace(selector(item.Record)));

    private static double? CoverageRate(
        IReadOnlyCollection<(SourceEvidenceFixtureRecord Record, string Text)> records,
        Func<SourceEvidenceFixtureRecord, string?> selector) =>
        Rate(CountCovered(records, selector), records.Count);

    private static double? Rate(int numerator, int denominator) =>
        denominator == 0 ? null : (double)numerator / denominator;
}
