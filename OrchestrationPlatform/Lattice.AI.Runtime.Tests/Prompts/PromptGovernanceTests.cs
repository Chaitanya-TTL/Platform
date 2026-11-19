using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Tests.Prompts;

public sealed class PromptGovernanceTests
{
    [Fact]
    public void GetRequired_LoadsExactVersionedBundleWithRequiredSections()
    {
        var catalog = new SourceControlledPromptCatalog();
        var prompt = catalog.GetRequired("engineering-impact", "v1");

        Assert.Equal("engineering-impact", prompt.Id);
        Assert.Equal("v1", prompt.Version);
        Assert.Equal(AnswerCandidateParser.SupportedSchemaVersion, prompt.OutputSchemaVersion);
        Assert.Contains("authorization tokens", prompt.SystemPolicy, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("PLM Brain", prompt.DomainGuidance, StringComparison.Ordinal);
        Assert.Contains("evidenceIds", prompt.ImpactTask, StringComparison.Ordinal);
    }

    [Fact]
    public void GetRequired_RejectsUnknownIdOrVersion()
    {
        var catalog = new SourceControlledPromptCatalog();

        Assert.Throws<KeyNotFoundException>(() => catalog.GetRequired("engineering-impact", "v2"));
        Assert.Throws<KeyNotFoundException>(() => catalog.GetRequired("other-prompt", "v1"));
    }

    [Fact]
    public void Assemble_PreservesCorrelationAndInvestigationAndSeparatesUntrustedContext()
    {
        const string signedAuthorizationToken = "signed-authorization-token-must-never-be-sent";
        var context = ContextPackage(signedAuthorizationToken);
        var request = new ImpactAnswerRequest("investigation-1", "What is impacted?");
        var prompt = new SourceControlledPromptCatalog().GetRequired("engineering-impact", "v1");
        var configuration = new ModelConfiguration("model-config", "azure-openai", "gpt", "deployment", 512, 4096);

        var modelRequest = new PromptAssembler().Assemble(request, context, prompt, configuration);
        var systemMessage = Assert.Single(modelRequest.Messages, message => message.Role == "system");
        var userMessage = Assert.Single(modelRequest.Messages, message => message.Role == "user");
        using var contextJson = JsonDocument.Parse(userMessage.Content);
        var contextRoot = contextJson.RootElement;
        var structuredPackage = contextRoot.GetProperty("contextPackage");

        Assert.Same(context.RequestContext, modelRequest.RequestContext);
        Assert.Equal("engineering-impact", modelRequest.PromptBundleId);
        Assert.Equal("v1", modelRequest.PromptBundleVersion);
        Assert.Equal("answer-v1", modelRequest.OutputSchemaVersion);
        Assert.Equal(context.PackageId, modelRequest.ContextPackageId);
        Assert.Equal(context.InvestigationId, contextRoot.GetProperty("investigationId").GetString());
        Assert.Equal(context.PackageId, contextRoot.GetProperty("packageId").GetString());
        Assert.Equal("What is impacted?", contextRoot.GetProperty("question").GetString());
        Assert.Equal("answer-v1", contextRoot.GetProperty("outputSchemaVersion").GetString());
        Assert.Equal(context.RequestContext.RequestId, contextRoot.GetProperty("requestId").GetString());
        Assert.Equal(context.RequestContext.TraceId, contextRoot.GetProperty("traceId").GetString());
        Assert.Equal(context.InvestigationId, structuredPackage.GetProperty("investigationId").GetString());
        Assert.Equal(context.PackageId, structuredPackage.GetProperty("packageId").GetString());
        Assert.Equal(context.RequestContext.RequestId, structuredPackage.GetProperty("requestContext").GetProperty("requestId").GetString());
        Assert.Equal(context.RequestContext.TraceId, structuredPackage.GetProperty("requestContext").GetProperty("traceId").GetString());
        Assert.Contains("System policy", systemMessage.Content, StringComparison.Ordinal);
        Assert.Contains("Domain guidance", systemMessage.Content, StringComparison.Ordinal);
        Assert.Contains("Impact task", systemMessage.Content, StringComparison.Ordinal);
        Assert.Contains("answer-v1", systemMessage.Content, StringComparison.Ordinal);
        Assert.Contains("untrusted retrieved evidence", userMessage.Content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(signedAuthorizationToken, userMessage.Content, StringComparison.Ordinal);
        Assert.DoesNotContain(signedAuthorizationToken, systemMessage.Content, StringComparison.Ordinal);
    }

    [Fact]
    public void Assemble_RejectsContextFromAnotherInvestigation()
    {
        var request = new ImpactAnswerRequest("investigation-other", "What is impacted?");
        var prompt = new SourceControlledPromptCatalog().GetRequired("engineering-impact", "v1");
        var configuration = new ModelConfiguration("model-config", "azure-openai", "gpt", "deployment", 512, 4096);

        Assert.Throws<ArgumentException>(() =>
            new PromptAssembler().Assemble(request, ContextPackage("decision-id"), prompt, configuration));
    }

    [Theory]
    [InlineData("{")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"A summary","impacts":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v2","summary":"A summary","impacts":[],"warnings":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"A summary","impacts":[],"warnings":[],"extra":true}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"A summary","impacts":[{"claimId":"claim-1","explanation":"Impact","evidenceIds":[]}],"warnings":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"A summary","impacts":[{"claimId":"claim-1","explanation":"Impact","evidenceIds":[],"sourceIds":[],"extra":true}],"warnings":[]}""")]
    [InlineData("""{"schemaVersion":"answer-v1","summary":"A summary","impacts":[{"claimId":"claim-1","explanation":"Impact","evidenceIds":[],"sourceIds":["source-1"]}],"warnings":[]}""")]
    public void Parse_RejectsMalformedMissingOrUnsupportedSchemaData(string content)
    {
        Assert.ThrowsAny<JsonException>(() => new AnswerCandidateParser().Parse(content));
    }

    [Fact]
    public void Parse_ReturnsCandidateForStrictVersionedJson()
    {
        const string content = """
            {
              "schemaVersion": "answer-v1",
              "summary": "The requirement affects the design.",
              "impacts": [
                {
                  "claimId": "claim-1",
                  "explanation": "The design depends on the requirement.",
                  "evidenceIds": ["evidence-1"],
                  "sourceIds": ["source-1"]
                }
              ],
              "warnings": []
            }
            """;

        var answer = new AnswerCandidateParser().Parse(content);

        Assert.Equal("The requirement affects the design.", answer.Summary);
        Assert.Single(answer.Impacts);
        Assert.Equal("claim-1", answer.Impacts[0].ClaimId);
        Assert.Equal(new[] { "evidence-1" }, answer.Impacts[0].EvidenceIds);
    }

    private static ContextPackage ContextPackage(string authorizationDecisionId) => new(
        new RuntimeRequestContext("request-1", "trace-1", "parent-1", "conversation-1"),
        "investigation-1",
        "package-1",
        "context-v1",
        "compiler-v1",
        authorizationDecisionId,
        new ResolvedEntity("plm", "Requirement", "R-123", "Requirement R-123"),
        new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
        [],
        [],
        []);
}
