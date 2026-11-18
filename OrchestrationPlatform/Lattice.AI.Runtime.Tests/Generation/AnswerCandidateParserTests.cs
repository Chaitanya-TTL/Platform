using System.Text.Json;
using Lattice.AI.Runtime.Generation;

namespace Lattice.AI.Runtime.Tests.Generation;

public sealed class AnswerCandidateParserTests
{
    [Theory]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"Summary","impacts":[{"claimId":"claim-1","explanation":"Impact","evidenceIds":["evidence-1","evidence-1"],"sourceIds":["source-1"]}],"warnings":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"Summary","impacts":[{"claimId":"claim-1","explanation":"Impact","evidenceIds":["evidence-1"],"sourceIds":["source-1","source-1"]}],"warnings":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"Summary","impacts":[{"claimId":"claim-1","explanation":" ","evidenceIds":["evidence-1"],"sourceIds":["source-1"]}],"warnings":[]}""")]
    public void Parse_RejectsDuplicateReferencesAndEmptyExplanations(string content)
    {
        Assert.ThrowsAny<JsonException>(() => new AnswerCandidateParser().Parse(content));
    }
}
