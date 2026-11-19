using System.Text.Json;
using Lattice.AI.Runtime.Evaluation.SourceEvidence;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class SourceEvidenceCorpusProfilerTests
{
    [Fact]
    public void Profile_ReportsSyntheticFixtureCountsDuplicatesAndMetadataCoverage()
    {
        var fixture = ReadJson(Path.Combine(GetFixtureDirectory(), "source-evidence", "records.json"));
        var records = fixture.RootElement.GetProperty("records")
            .Deserialize<SourceEvidenceFixtureRecord[]>(JsonOptions())!;

        var profile = new SourceEvidenceCorpusProfiler().Profile(records);

        Assert.Equal("synthetic-fixture-only", fixture.RootElement.GetProperty("corpusClassification").GetString());
        Assert.Equal("synthetic-fixture-only", profile.CorpusClassification);
        Assert.Equal(7, profile.RecordCount);
        Assert.Equal(5, profile.EligibleSourceTextRecordCount);
        Assert.Equal(1, profile.EmptyTextRecordCount);
        Assert.Equal(1, profile.IdentifierOnlyTextRecordCount);
        Assert.Equal(1, profile.ExactDuplicateRecordCount);
        Assert.Equal(0.2, profile.ExactDuplicateRate);
        Assert.Equal(2, profile.NormalizedDuplicateRecordCount);
        Assert.Equal(0.4, profile.NormalizedDuplicateRate);
        Assert.Equal(4, profile.RevisionCoveredRecordCount);
        Assert.Equal(0.8, profile.RevisionCoverageRate);
        Assert.Equal(4, profile.ProvenanceCoveredRecordCount);
        Assert.Equal(0.8, profile.ProvenanceCoverageRate);
        Assert.Equal(4, profile.LocationCoveredRecordCount);
        Assert.Equal(0.8, profile.LocationCoverageRate);
        Assert.Equal(
            new Dictionary<string, int>
            {
                ["SyntheticPLM"] = 3,
                ["SyntheticRequirements"] = 2,
                ["SyntheticRules"] = 2
            },
            profile.RecordCountsByApplication);
        Assert.Equal(
            new Dictionary<string, int>
            {
                ["description"] = 2,
                ["identifier"] = 1,
                ["requirement"] = 2,
                ["rule"] = 2
            },
            profile.RecordCountsByType);

        var eligibleLengths = records
            .Where(record => !string.IsNullOrWhiteSpace(record.SearchableText)
                && record.SearchableText != "REQ-123")
            .Select(record => record.SearchableText!.Length)
            .Order()
            .ToArray();
        Assert.Equal(eligibleLengths.Min(), profile.MinimumTextLength);
        Assert.Equal(eligibleLengths.Average(), profile.MeanTextLength);
        Assert.Equal(eligibleLengths[2], profile.MedianTextLength);
        Assert.Equal(eligibleLengths.Max(), profile.MaximumTextLength);
        Assert.Equal(
            eligibleLengths.GroupBy(length => length).ToDictionary(group => group.Key, group => group.Count()),
            profile.TextLengthDistribution);
    }

    [Fact]
    public void Profile_ReportsNoEligibleSourceTextFromExistingR123Fixture()
    {
        using var fixture = ReadJson(Path.Combine(GetFixtureDirectory(), "requirement-r123.json"));
        var records = fixture.RootElement.GetProperty("sources")
            .EnumerateArray()
            .Select(source => new SourceEvidenceFixtureRecord(
                source.GetProperty("recordId").GetString()!,
                source.GetProperty("sourceSystem").GetString()!,
                source.GetProperty("sourceType").GetString()!,
                GetOptionalString(source, "searchableText"),
                GetOptionalString(source, "revision"),
                GetOptionalString(source, "deepLink"),
                GetOptionalString(source, "provenanceId"),
                GetOptionalString(source, "freshness")))
            .ToArray();

        var profile = new SourceEvidenceCorpusProfiler().Profile(records);

        Assert.Equal(4, profile.RecordCount);
        Assert.Equal(0, profile.EligibleSourceTextRecordCount);
        Assert.Equal("synthetic-fixture-only", profile.CorpusClassification);
        Assert.Null(profile.MeanTextLength);
        Assert.Null(profile.MedianTextLength);
        Assert.Null(profile.ExactDuplicateRate);
        Assert.Null(profile.NormalizedDuplicateRate);
    }

    [Fact]
    public void Profile_LeavesTextStatisticsUndefinedWhenNoRecordsAreEligible()
    {
        var records = new[]
        {
            new SourceEvidenceFixtureRecord("EMPTY", "Synthetic", "description", null, null, null, null, null),
            new SourceEvidenceFixtureRecord("ID", "Synthetic", "identifier", "PART-42", null, null, null, null)
        };

        var profile = new SourceEvidenceCorpusProfiler().Profile(records);

        Assert.Equal(0, profile.EligibleSourceTextRecordCount);
        Assert.Equal(1, profile.EmptyTextRecordCount);
        Assert.Equal(1, profile.IdentifierOnlyTextRecordCount);
        Assert.Empty(profile.TextLengthDistribution);
        Assert.Null(profile.RevisionCoverageRate);
        Assert.Null(profile.ProvenanceCoverageRate);
        Assert.Null(profile.LocationCoverageRate);
    }

    private static JsonDocument ReadJson(string path) => JsonDocument.Parse(File.ReadAllText(path));

    private static string? GetOptionalString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property)
            && property.ValueKind == JsonValueKind.String
                ? property.GetString()
                : null;

    private static string GetFixtureDirectory()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory);
             directory is not null;
             directory = directory.Parent)
        {
            var candidate = Path.Combine(directory.FullName, "evals", "engineering-impact", "v1", "fixtures");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new DirectoryNotFoundException("Could not locate the engineering-impact fixture directory.");
    }

    private static JsonSerializerOptions JsonOptions() => new()
    {
        PropertyNameCaseInsensitive = true
    };
}
