using System.Text.Json;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.Validation;

namespace Lattice.AI.Runtime.Tests.Application;

public sealed class ImpactAnswerServiceTests
{
    [Fact]
    public async Task AnswerAsync_ReturnsValidatedAnswerAndScopedSources()
    {
        var fixture = new Fixture();

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Answer, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Equal("investigation-1", result.InvestigationId);
        Assert.Equal("request-1", result.RequestContext.RequestId);
        Assert.False(string.IsNullOrWhiteSpace(result.ContextPackageId));
        Assert.Single(result.Impacts);
        Assert.Single(result.Sources);
        Assert.Equal(1, fixture.ScopePlanner.CallCount);
        Assert.Same(fixture.Resolver.Authorization, fixture.EvidenceSource.Authorization);
        Assert.Equal(1, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_ClarifiesUnresolvedSubjectWithoutRetrievingEvidenceOrCallingModel()
    {
        var fixture = new Fixture(resolution: new EntityResolutionResult(
            EntityResolutionDisposition.Unresolved,
            null,
            [],
            ["No exact subject was found."]));

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Clarify, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
        Assert.Equal(0, fixture.ScopePlanner.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_ClarifiesUnsupportedQuestionBeforeCallingPlm()
    {
        var fixture = new Fixture();
        var request = new ImpactAnswerRequest("investigation-1", "Describe requirement REQ-123.");

        var result = await fixture.Service.AnswerAsync(
            request,
            Authorization(),
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Clarify, result.Disposition);
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_RejectsMissingInvestigationBeforeCallingPlm()
    {
        var fixture = new Fixture();

        await Assert.ThrowsAsync<ArgumentException>(() =>
            fixture.Service.AnswerAsync(
                new ImpactAnswerRequest("", "What is impacted if R-123 changes?"),
                Authorization(),
                RequestContext(),
                CancellationToken.None));

        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_AbstainsOnEmptyEvidenceWithoutCallingModel()
    {
        var fixture = new Fixture(evidence: EmptyEvidence());

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Abstain, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.NotEmpty(result.Issues);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_RejectsMalformedModelJson()
    {
        var fixture = new Fixture(modelContent: "{not-json");

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Contains(result.Issues, issue => issue.Code == "invalid-model-output");
    }

    [Fact]
    public async Task AnswerAsync_ReportsModelProviderFailureExplicitly()
    {
        var fixture = new Fixture(modelFailure: new HttpRequestException("provider unavailable"));

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Contains(result.Issues, issue => issue.Code == "model-provider-failed");
    }

    [Fact]
    public async Task AnswerAsync_DoesNotResolveOrRetrieveWhenAuthorizationIsExpired()
    {
        var fixture = new Fixture();
        var expiredAuthorization = Authorization() with
        {
            ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1)
        };

        var result = await fixture.Service.AnswerAsync(
            Request(),
            expiredAuthorization,
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Deny, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.ScopePlanner.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
    }

    private static ImpactAnswerRequest Request() =>
        new("investigation-1", "What impacts if REQ-123 changes?", "conversation-1");

    [Theory]
    [InlineData(AnswerDisposition.Answer)]
    [InlineData(AnswerDisposition.Clarify)]
    [InlineData(AnswerDisposition.Abstain)]
    [InlineData(AnswerDisposition.Deny)]
    [InlineData(AnswerDisposition.Failed)]
    public void ImpactAnswerResult_SerializesSemanticSupportAsNotEvaluated(AnswerDisposition disposition)
    {
        var result = new ImpactAnswerResult(
            "investigation-1",
            RequestContext(),
            disposition,
            null,
            [],
            [],
            [],
            null);

        using var document = JsonDocument.Parse(JsonSerializer.Serialize(
            result,
            new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        Assert.Equal(
            "not-evaluated",
            document.RootElement.GetProperty("semanticSupportStatus").GetString());
    }

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "trace-1", null, "conversation-1");

    private static AuthorizationContext Authorization()
    {
        var scope = new AuthorizationScope(
            "tenant-1",
            "subject-1",
            "policy-v1",
            "decision-1",
            new HashSet<string>(
                ["investigation:resolve-entity", "investigation:read-impact-evidence"],
                StringComparer.Ordinal),
            DateTimeOffset.UtcNow.AddMinutes(1));
        return new AuthorizationContext(scope, "ticket-secret", scope.DecisionExpiresAt);
    }

    private static EvidenceRetrievalResult EmptyEvidence() =>
        new(
            "investigation-1",
            [],
            [],
            [],
            [],
            "source-v1",
            "ontology-v1",
            "decision-1",
            "request-1",
            "trace-1");

    private sealed class Fixture
    {
        public Fixture(
            EntityResolutionResult? resolution = null,
            EvidenceRetrievalResult? evidence = null,
            string? modelContent = null,
            Exception? modelFailure = null)
        {
            Resolver = new StubEntityResolver(resolution);
            ScopePlanner = new TrackingScopePlanner();
            EvidenceSource = new StubEvidenceSource(evidence ?? Evidence());
            Gateway = new StubModelGateway(modelContent ?? ValidModelContent, modelFailure);
            Service = new ImpactAnswerService(
                new QuestionInterpreter(),
                Resolver,
                ScopePlanner,
                EvidenceSource,
                new ContextCompiler(),
                new SourceControlledPromptCatalog(),
                new PromptAssembler(),
                Gateway,
                new AnswerCandidateParser(),
                new AnswerValidator(),
                new ModelConfiguration("model-1", "test", "test-model", "test-deployment", 256));
        }

        public StubEntityResolver Resolver { get; }
        public TrackingScopePlanner ScopePlanner { get; }
        public StubEvidenceSource EvidenceSource { get; }
        public StubModelGateway Gateway { get; }
        public ImpactAnswerService Service { get; }
    }

    private sealed class TrackingScopePlanner : IScopePlanner
    {
        private readonly ScopePlanner _inner = new();

        public int CallCount { get; private set; }

        public ScopePlanningResult Plan(
            QuestionInterpretation interpretation,
            ResolvedEntity subject,
            AuthorizationScope authorization,
            RuntimeRequestContext requestContext)
        {
            CallCount++;
            return _inner.Plan(interpretation, subject, authorization, requestContext);
        }
    }

    private const string ValidModelContent =
        """{"schemaVersion":"answer-v1","summary":"REQ-123 affects P-1.","impacts":[{"claimId":"relationship:relationship-1","explanation":"REQ-123 affects P-1.","evidenceIds":["evidence-1"],"sourceIds":["provenance-1"]}],"warnings":[]}""";

    private static EvidenceRetrievalResult Evidence() =>
        new(
            "investigation-1",
            [
                new RelationshipEvidence(
                    "relationship-1",
                    "REQ-123",
                    "P-1",
                    "depends-on",
                    "REQ-123 affects P-1.",
                    ["evidence-1"])
            ],
            [],
            [],
            [new EvidenceSourceReference(
                "evidence-1",
                "relationship",
                "plm",
                "record-1",
                "revision-1",
                null,
                null,
                "provenance-1",
                "decision-1",
                CitationId: "citation-1",
                Authority: "source-authoritative",
                Provider: "plm")],
            "source-v1",
            "ontology-v1",
            "decision-1",
            "request-1",
            "trace-1");

    private sealed class StubEntityResolver(EntityResolutionResult? result = null) : IEngineeringEntityResolver
    {
        public int CallCount { get; private set; }
        public AuthorizationContext? Authorization { get; private set; }

        public Task<EntityResolutionResult> ResolveAsync(
            string investigationId,
            QuestionInterpretation interpretation,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            CallCount++;
            Authorization = authorization;
            return Task.FromResult(result ?? new EntityResolutionResult(
                EntityResolutionDisposition.Resolved,
                new ResolvedEntity("plm", "Requirement", "REQ-123", "Requirement REQ-123"),
                ["REQ-123"],
                []));
        }
    }

    private sealed class StubEvidenceSource(EvidenceRetrievalResult result) : IEngineeringEvidenceSource
    {
        public int CallCount { get; private set; }
        public AuthorizationContext? Authorization { get; private set; }

        public Task<EvidenceRetrievalResult> RetrieveImpactAsync(
            ImpactEvidenceQuery query,
            CancellationToken cancellationToken)
        {
            CallCount++;
            Authorization = query.Authorization;
            return Task.FromResult(result);
        }
    }

    private sealed class StubModelGateway(string content, Exception? failure) : IModelGateway
    {
        public int CallCount { get; private set; }

        public Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken)
        {
            CallCount++;
            if (failure is not null)
            {
                throw failure;
            }

            return Task.FromResult(new ModelResponse(
                request.RequestContext,
                content,
                "test",
                "test-model",
                null,
                10,
                10,
                TimeSpan.FromMilliseconds(1)));
        }
    }
}
