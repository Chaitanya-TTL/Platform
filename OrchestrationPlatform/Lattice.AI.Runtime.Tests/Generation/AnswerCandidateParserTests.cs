using System.Text.Json;
using Lattice.AI.Runtime.Generation;

namespace Lattice.AI.Runtime.Tests.Generation;

public sealed class AnswerCandidateParserTests
{
    [Fact]
    public void Parse_PreservesMoreThanTwentyFiveSupportedImpactCandidates()
    {
        var impacts = Enumerable.Range(1, 30)
            .Select(index => new
            {
                claimId = $"claim-{index}",
                explanation = $"Supported impact {index}.",
                evidenceIds = new[] { $"evidence-{index}" },
                sourceIds = new[] { $"source-{index}" }
            })
            .ToArray();
        var content = JsonSerializer.Serialize(new
        {
            schemaVersion = "answer-v1",
            summary = "Thirty supported impacts.",
            impacts,
            warnings = Array.Empty<string>()
        });

        var result = new AnswerCandidateParser().Parse(content);

        Assert.Equal(30, result.Impacts.Count);
    }

    [Fact]
    public void Parse_PreservesFactAndApplicationContextAssertionsAsSeparateEvidenceTypes()
    {
        const string content = """
            {
              "schemaVersion": "answer-v2",
              "summary": "The part weighs 2.5 kg and is represented in Windchill.",
              "impacts": [],
              "facts": [
                {
                  "factId": "fact-1",
                  "exactValue": {"value": 2.5, "unit": "kg"},
                  "evidenceIds": ["fact-evidence-1"],
                  "sourceIds": ["fact-citation-1"]
                }
              ],
              "applicationContexts": [
                {
                  "candidateId": "participation-1",
                  "evidenceIds": ["participation-evidence-1"],
                  "sourceIds": ["participation-citation-1"]
                }
              ],
              "sourceEvidence": [
                {
                  "passageId": "passage-1",
                  "explanation": "The source describes the requirement.",
                  "evidenceIds": ["source-evidence-1"],
                  "sourceIds": ["passage-1"]
                }
              ],
              "warnings": []
            }
            """;

        var result = new AnswerCandidateParser().Parse(content);

        var fact = Assert.Single(result.Facts);
        Assert.Equal("fact-1", fact.FactId);
        Assert.Equal(2.5, fact.ExactValue.GetProperty("value").GetDouble());
        Assert.Equal("fact-citation-1", Assert.Single(fact.SourceIds));
        var context = Assert.Single(result.ApplicationContexts);
        Assert.Equal("participation-1", context.CandidateId);
        Assert.Equal("participation-citation-1", Assert.Single(context.SourceIds));
        var sourceEvidence = Assert.Single(result.SourceEvidence);
        Assert.Equal("passage-1", sourceEvidence.PassageId);
        Assert.Equal("source-evidence-1", Assert.Single(sourceEvidence.EvidenceIds));
    }

    [Theory]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"Summary","impacts":[{"claimId":"claim-1","explanation":"Impact","evidenceIds":["evidence-1","evidence-1"],"sourceIds":["source-1"]}],"warnings":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"Summary","impacts":[{"claimId":"claim-1","explanation":"Impact","evidenceIds":["evidence-1"],"sourceIds":["source-1","source-1"]}],"warnings":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"Summary","impacts":[{"claimId":"claim-1","explanation":" ","evidenceIds":["evidence-1"],"sourceIds":["source-1"]}],"warnings":[]}""")]
    public void Parse_RejectsDuplicateReferencesAndEmptyExplanations(string content)
    {
        Assert.ThrowsAny<JsonException>(() => new AnswerCandidateParser().Parse(content));
    }
}
