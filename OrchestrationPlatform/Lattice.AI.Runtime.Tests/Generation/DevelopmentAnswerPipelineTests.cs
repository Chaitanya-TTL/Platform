using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.Validation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Orchestration.API.AI.Adapters;
using Orchestration.API.AI.Composition;

namespace Lattice.AI.Runtime.Tests.Generation;

public sealed class DevelopmentAnswerPipelineTests
{
    [Fact]
    public void DevelopmentParser_PreservesStructuredFactsAndSourceEvidence()
    {
        const string response = """
            {
              "schemaVersion": "answer-v2",
              "summary": "The investigation includes Configit, Codebeamer, and Windchill.",
              "impacts": [],
              "facts": [
                {
                  "factId": "FACT-1",
                  "exactValue": 2.5,
                  "evidenceIds": ["EVIDENCE-1"],
                  "sourceIds": ["SOURCE-1"]
                }
              ],
              "applicationContexts": [
                {
                  "candidateId": "configit",
                  "evidenceIds": ["EVIDENCE-2"],
                  "sourceIds": ["SOURCE-2"]
                }
              ],
              "sourceEvidence": [
                {
                  "passageId": "PASSAGE-1",
                  "explanation": "The source record states the requirement.",
                  "evidenceIds": ["EVIDENCE-3"],
                  "sourceIds": ["PASSAGE-1"]
                }
              ],
              "warnings": []
            }
            """;

        var candidate = new DevelopmentAnswerCandidateParser().Parse(response);

        Assert.Equal(
            "The investigation includes Configit, Codebeamer, and Windchill.",
            candidate.Summary);
        var fact = Assert.Single(candidate.Facts);
        Assert.Equal("FACT-1", fact.FactId);
        Assert.Equal("2.5", fact.ExactValueJson);
        Assert.Equal(["EVIDENCE-1"], fact.EvidenceIds);
        Assert.Equal(["SOURCE-1"], fact.SourceIds);
        Assert.Equal("configit", Assert.Single(candidate.ApplicationContexts).CandidateId);
        Assert.Equal("PASSAGE-1", Assert.Single(candidate.SourceEvidence).PassageId);
    }

    [Fact]
    public void DevelopmentParser_ReturnsNonJsonModelTextInsteadOfRejectingIt()
    {
        const string response = "The investigation includes Configit and Windchill.";

        var candidate = new DevelopmentAnswerCandidateParser().Parse(response);

        Assert.Equal(response, candidate.Summary);
    }

    [Fact]
    public void DevelopmentParser_ExtractsSummaryFromMarkdownJsonFence()
    {
        const string response = """
            ```json
            {
              "schemaVersion": "answer-v2",
              "summary": "The investigation includes Configit, Codebeamer, and Windchill.",
              "impacts": [],
              "facts": [],
              "applicationContexts": [],
              "sourceEvidence": [],
              "warnings": []
            }
            ```
            """;

        var candidate = new DevelopmentAnswerCandidateParser().Parse(response);

        Assert.Equal(
            "The investigation includes Configit, Codebeamer, and Windchill.",
            candidate.Summary);
        Assert.Empty(candidate.Impacts);
    }

    [Fact]
    public void DevelopmentParser_RecoversCompleteSummaryFromTruncatedJsonEnvelope()
    {
        const string response = """
            {
              "schemaVersion": "answer-v2",
              "summary": "The investigation includes Configit and Windchill.",
              "facts": [
            """;

        var candidate = new DevelopmentAnswerCandidateParser().Parse(response);

        Assert.Equal("The investigation includes Configit and Windchill.", candidate.Summary);
    }

    [Fact]
    public void AddAiRuntime_UsesPassThroughAnswerPipelineOnlyInDevelopment()
    {
        using var developmentProvider = CreateProvider(Environments.Development);
        using var productionProvider = CreateProvider(Environments.Production);

        Assert.IsType<DevelopmentAnswerCandidateParser>(
            developmentProvider.GetRequiredService<IAnswerCandidateParser>());
        Assert.IsType<DevelopmentAnswerPassThroughValidator>(
            developmentProvider.GetRequiredService<IAnswerValidator>());
        Assert.IsType<DevelopmentConversationTurnInterpreter>(
            developmentProvider.GetRequiredService<IConversationTurnInterpreter>());
        Assert.IsType<AnswerCandidateParser>(
            productionProvider.GetRequiredService<IAnswerCandidateParser>());
        Assert.IsType<AnswerValidator>(
            productionProvider.GetRequiredService<IAnswerValidator>());
        Assert.IsType<ConversationTurnInterpreter>(
            productionProvider.GetRequiredService<IConversationTurnInterpreter>());
    }

    private static ServiceProvider CreateProvider(string environmentName)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAiRuntime(configuration, new TestHostEnvironment
        {
            EnvironmentName = environmentName
        });
        return services.BuildServiceProvider();
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = string.Empty;

        public string ApplicationName { get; set; } = "Lattice.AI.Runtime.Tests";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
