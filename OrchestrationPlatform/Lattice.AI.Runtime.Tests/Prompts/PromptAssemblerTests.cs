using System.Text;
using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Tests.Prompts;

public sealed class PromptAssemblerTests
{
    [Fact]
    public void Assemble_EstimatesUtf8TokensForSystemAndUserMessagesIncludingFraming()
    {
        const string question = "Does Änderung β affect the cooling pump?";
        var context = ContextPackage();
        var request = new ImpactAnswerRequest("investigation-1", question);
        var prompt = new PromptBundle(
            "engineering-impact",
            "test-v1",
            "answer-v1",
            "Policy for engineering change control.",
            "Engineering guidance for München subsystem.",
            "Explain downstream impact for a change.");
        var configuration = new ModelConfiguration(
            "model-config",
            "azure-openai",
            "gpt",
            "deployment",
            512,
            4096);

        var modelRequest = new PromptAssembler().Assemble(request, context, prompt, configuration);

        var systemMessage = Assert.Single(modelRequest.Messages, message => message.Role == "system");
        var userMessage = Assert.Single(modelRequest.Messages, message => message.Role == "user");
        using var userJson = JsonDocument.Parse(userMessage.Content);

        Assert.Contains("Policy for engineering change control.", systemMessage.Content, StringComparison.Ordinal);
        Assert.Contains("Engineering guidance for München subsystem.", systemMessage.Content, StringComparison.Ordinal);
        Assert.Contains("Explain downstream impact for a change.", systemMessage.Content, StringComparison.Ordinal);
        Assert.Equal(question, userJson.RootElement.GetProperty("question").GetString());

        var systemContentTokens = (Encoding.UTF8.GetByteCount(systemMessage.Content) + 3) / 4;
        var userContentTokens = (Encoding.UTF8.GetByteCount(userMessage.Content) + 3) / 4;
        var expectedEstimatedInputTokens = systemContentTokens + userContentTokens + 8;

        Assert.True(Encoding.UTF8.GetByteCount(question) > question.Length);
        Assert.Equal(expectedEstimatedInputTokens, modelRequest.EstimatedInputTokens);
    }

    private static ContextPackage ContextPackage() => new(
        new RuntimeRequestContext("request-1", "trace-1", "parent-1", "conversation-1"),
        "investigation-1",
        "package-1",
        "context-v1",
        "compiler-v1",
        "decision-id",
        new ResolvedEntity("plm", "Requirement", "R-123", "Requirement R-123"),
        new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
        [],
        [],
        []);
}
