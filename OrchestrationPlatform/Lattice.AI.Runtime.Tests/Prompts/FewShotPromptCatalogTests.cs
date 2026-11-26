using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Tests.Prompts;

public sealed class FewShotPromptCatalogTests
{
    [Fact]
    public void GetRequired_LoadsVersionedSyntheticExamplesPinnedToEngineeringImpactV2()
    {
        var set = new FewShotPromptCatalog().GetRequired("engineering-impact-few-shot", "v1");

        Assert.Equal("engineering-impact-few-shot", set.Id);
        Assert.Equal("v1", set.Version);
        Assert.Equal("engineering-impact", set.BasePromptId);
        Assert.Equal("v2", set.BasePromptVersion);
        Assert.Equal("synthetic-fixture-only", set.Classification);
        Assert.Equal(3, set.Examples.Count);
        Assert.All(set.Examples, example =>
        {
            Assert.StartsWith("SYNTH-", example.Id, StringComparison.Ordinal);
            Assert.NotEmpty(example.BehaviorTags);
        });
    }

    [Theory]
    [InlineData("engineering-impact-few-shot", "v2")]
    [InlineData("other-set", "v1")]
    public void GetRequired_RejectsUnknownSetOrVersion(string id, string version)
    {
        Assert.Throws<KeyNotFoundException>(() => new FewShotPromptCatalog().GetRequired(id, version));
    }

    [Fact]
    public void SelectFor_ReturnsOnlyExactIntentExamplesAndNoControlExamples()
    {
        var set = new FewShotPromptCatalog().GetRequired("engineering-impact-few-shot", "v1");

        Assert.Equal("DirectImpact", Assert.Single(set.SelectFor(FewShotPromptIntent.DirectImpact)).Intent.ToString());
        Assert.Equal("FollowUpExplanation", Assert.Single(set.SelectFor(FewShotPromptIntent.FollowUpExplanation)).Intent.ToString());
        Assert.Equal("SourceEvidenceExplanation", Assert.Single(set.SelectFor(FewShotPromptIntent.SourceEvidenceExplanation)).Intent.ToString());
        Assert.Empty(set.SelectFor(FewShotPromptIntent.Clarification));
        Assert.Empty(set.SelectFor(FewShotPromptIntent.InsufficientEvidence));
    }

    [Fact]
    public void Parse_RejectsUnknownOrDuplicateManifestProperties()
    {
        const string examples = """
            [
              {
                "id": "SYNTH-EXAMPLE-001",
                "intent": "DirectImpact",
                "question": "What changes?",
                "context": "{}",
                "expectedAnswer": "{}",
                "behaviorTags": ["valid-reference"]
              }
            ]
            """;
        const string unknownManifestProperty = """
            {"schemaVersion":"few-shot-prompt-set/v1","id":"engineering-impact-few-shot","version":"v1","basePromptId":"engineering-impact","basePromptVersion":"v2","classification":"synthetic-fixture-only","examplesFile":"examples.json","exampleCount":1,"unexpected":true}
            """;
        const string duplicateManifestProperty = """
            {"schemaVersion":"few-shot-prompt-set/v1","id":"engineering-impact-few-shot","id":"other","version":"v1","basePromptId":"engineering-impact","basePromptVersion":"v2","classification":"synthetic-fixture-only","examplesFile":"examples.json","exampleCount":1}
            """;

        Assert.Throws<InvalidDataException>(() => FewShotPromptCatalog.Parse(unknownManifestProperty, examples));
        Assert.Throws<InvalidDataException>(() => FewShotPromptCatalog.Parse(duplicateManifestProperty, examples));
    }

    [Fact]
    public void Parse_RejectsDuplicateExampleIdsAndUnsupportedIntents()
    {
        const string manifest = """
            {"schemaVersion":"few-shot-prompt-set/v1","id":"engineering-impact-few-shot","version":"v1","basePromptId":"engineering-impact","basePromptVersion":"v2","classification":"synthetic-fixture-only","examplesFile":"examples.json","exampleCount":2}
            """;
        const string duplicateExamples = """
            [
              {"id":"SYNTH-EXAMPLE-001","intent":"DirectImpact","question":"What changes?","context":"{}","expectedAnswer":"{}","behaviorTags":["valid-reference"]},
              {"id":"SYNTH-EXAMPLE-001","intent":"FollowUpExplanation","question":"Why?","context":"{}","expectedAnswer":"{}","behaviorTags":["uncertainty"]}
            ]
            """;
        const string unsupportedIntent = """
            [
              {"id":"SYNTH-EXAMPLE-001","intent":"ModelChooses","question":"What changes?","context":"{}","expectedAnswer":"{}","behaviorTags":["valid-reference"]}
            ]
            """;
        const string oneExampleManifest = """
            {"schemaVersion":"few-shot-prompt-set/v1","id":"engineering-impact-few-shot","version":"v1","basePromptId":"engineering-impact","basePromptVersion":"v2","classification":"synthetic-fixture-only","examplesFile":"examples.json","exampleCount":1}
            """;

        Assert.Throws<InvalidDataException>(() => FewShotPromptCatalog.Parse(manifest, duplicateExamples));
        Assert.Throws<InvalidDataException>(() => FewShotPromptCatalog.Parse(oneExampleManifest, unsupportedIntent));
    }
}
