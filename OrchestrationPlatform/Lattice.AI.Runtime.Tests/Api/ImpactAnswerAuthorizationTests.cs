using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.ApplicationContext;
using Lattice.AI.Runtime.Azure.Models;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.FactEvidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.SourceEvidence;
using Lattice.AI.Runtime.Tests.ApplicationContext;
using Lattice.AI.Runtime.Tests.FactEvidence;
using Lattice.AI.Runtime.Tests.SourceEvidence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Orchestration.API.AI.Adapters;

namespace Lattice.AI.Runtime.Tests.Api;

public sealed class ImpactAnswerAuthorizationTests
{
    [Fact]
    public async Task GetHealthReady_ReturnsNotReadyWhenProductionAuthorizationProviderIsUnavailable()
    {
        using var factory = new ImpactAnswerFactory(useDefaultDecisionProvider: true);
        using var client = CreateClient(factory);

        Assert.IsType<UnavailableResourceAuthorizationDecisionProvider>(
            factory.Services.GetRequiredService<IResourceAuthorizationDecisionProvider>());

        var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        using var responseJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, responseJson.RootElement.EnumerateObject().Count());
        Assert.Equal("not-ready", responseJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(
            "AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED",
            responseJson.RootElement.GetProperty("code").GetString());
        Assert.Equal(0, factory.DecisionProvider.CallCount);
    }

    [Fact]
    public async Task GetHealthReady_ReturnsReadyWhenAuthorizationProviderIsConfigured()
    {
        using var factory = new ImpactAnswerFactory();
        using var client = CreateClient(factory);

        Assert.Same(
            factory.DecisionProvider,
            factory.Services.GetRequiredService<IResourceAuthorizationDecisionProvider>());

        var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var responseJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Single(responseJson.RootElement.EnumerateObject());
        Assert.Equal("ready", responseJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(0, factory.DecisionProvider.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_RequiresAuthentication()
    {
        using var factory = new ImpactAnswerFactory();
        using var client = CreateClient(factory);

        var response = await PostAsync(client, """{"investigationId":"investigation-1","question":"What impacts if REQ-123 changes?"}""");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, factory.DecisionProvider.CallCount);
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(0, factory.EvidenceSource.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_LocalDevelopmentIdentityRunsTheRuntimePipeline()
    {
        using var factory = new ImpactAnswerFactory(useDevelopmentIdentity: true);
        using var client = CreateClient(factory);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue(
                "Bearer",
                LocalDevelopmentAuthenticationHandler.Token);

        var response = await PostAsync(client, ValidRequest);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.IsType<LocalDevelopmentResourceAuthorizationDecisionProvider>(
            factory.Services.GetRequiredService<IResourceAuthorizationDecisionProvider>());
        Assert.Equal(0, factory.DecisionProvider.CallCount);
        Assert.Equal(0, factory.TokenIssuer.CallCount);
        Assert.Equal(1, factory.EntityResolver.CallCount);
        Assert.Equal(1, factory.EvidenceSource.CallCount);
        Assert.Equal(1, factory.ModelGateway.CallCount);

        using var responseJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("REQ-123 affects P-1.", responseJson.RootElement.GetProperty("summary").GetString());
        Assert.False(string.IsNullOrWhiteSpace(
            responseJson.RootElement.GetProperty("contextPackageId").GetString()));
    }

    [Fact]
    public async Task PostImpactAnswer_WithConversationHistoryRunsTheRuntimePipeline()
    {
        using var factory = new ImpactAnswerFactory(useDevelopmentIdentity: true);
        using var client = CreateClient(factory);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue(
                "Bearer",
                LocalDevelopmentAuthenticationHandler.Token);
        const string requestWithHistory = """
            {
              "investigationId": "investigation-1",
              "question": "Summarize this investigation in 5 bullet points.",
              "conversationId": "conversation-1",
              "turnId": "turn-2",
              "conversationHistory": [
                {
                  "turnId": "turn-1",
                  "userMessage": "Which applications contributed to this investigation?",
                  "assistantMessage": "The investigation involved Configit, Codebeamer, and Windchill.",
                  "disposition": 0
                }
              ]
            }
            """;

        var response = await PostAsync(client, requestWithHistory);
        var responseBody = await response.Content.ReadAsStringAsync();

        Assert.True(
            response.StatusCode == HttpStatusCode.OK,
            $"Expected OK, got {(int)response.StatusCode}: {responseBody}");
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(1, factory.EvidenceSource.CallCount);
        Assert.Equal(1, factory.FactEvidenceRetriever.CallCount);
        Assert.Equal(1, factory.ApplicationContextRetriever.CallCount);
        Assert.Equal(1, factory.ModelGateway.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_PolicyDenialRemainsForbidden()
    {
        using var factory = new ImpactAnswerFactory(denyDecision: true);
        using var client = CreateClient(factory, authenticate: true);

        var response = await PostAsync(client, ValidRequest);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, factory.DecisionProvider.CallCount);
        Assert.Equal(0, factory.TokenIssuer.CallCount);
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(0, factory.EvidenceSource.CallCount);
        Assert.Equal(0, factory.ModelGateway.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_ReturnsUnavailableWhenAuthorizationProviderIsNotConfigured()
    {
        using var factory = new ImpactAnswerFactory(useDefaultDecisionProvider: true);
        using var client = CreateClient(factory, authenticate: true);

        var response = await PostAsync(client, ValidRequest);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        await AssertProblemCodeAsync(response, "AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED");
        Assert.Equal(0, factory.DecisionProvider.CallCount);
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(0, factory.EvidenceSource.CallCount);
        Assert.Equal(0, factory.ModelGateway.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_ReturnsUnavailableWhenAuthorizationProviderThrows()
    {
        using var factory = new ImpactAnswerFactory(failDecision: true);
        using var client = CreateClient(factory, authenticate: true);

        var response = await PostAsync(client, ValidRequest);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        await AssertProblemCodeAsync(response, "AI_RUNTIME_AUTHORIZATION_PROVIDER_UNAVAILABLE");
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(0, factory.EvidenceSource.CallCount);
        Assert.Equal(0, factory.ModelGateway.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_RejectsRequestWithoutActiveInvestigation()
    {
        using var factory = new ImpactAnswerFactory();
        using var client = CreateClient(factory, authenticate: true);

        var response = await PostAsync(client, """{"question":"What impacts if REQ-123 changes?"}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, factory.DecisionProvider.CallCount);
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(0, factory.EvidenceSource.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_UsesAuthenticatedIdentityAndServerGrantsInsteadOfCallerOverrides()
    {
        using var factory = new ImpactAnswerFactory();
        using var client = CreateClient(factory, authenticate: true);
        const string requestWithOverrides = """
            {
              "investigationId": "investigation-1",
              "question": "What impacts if REQ-123 changes?",
              "conversationId": "conversation-1",
              "turnId": "turn-1",
              "tenantId": "attacker-tenant",
              "subjectId": "attacker-subject",
              "grants": ["*"],
              "policyVersion": "attacker-policy",
              "decisionId": "attacker-decision"
            }
            """;

        var response = await PostAsync(client, requestWithOverrides);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, factory.DecisionProvider.CallCount);
        Assert.Equal(1, factory.TokenIssuer.CallCount);
        Assert.Equal(1, factory.EntityResolver.CallCount);
        Assert.Equal(1, factory.EvidenceSource.CallCount);
        Assert.Equal("tenant-from-authentication", factory.DecisionProvider.LastTenantId);
        Assert.Equal("subject-from-authentication", factory.DecisionProvider.LastSubjectId);
        Assert.Equal("investigation-1", factory.DecisionProvider.LastInvestigationId);
        Assert.Equal("turn-1", factory.DecisionProvider.LastTurnId);
        Assert.Equal("tenant-from-authentication", factory.EntityResolver.Authorization?.Scope.TenantId);
        Assert.Equal("subject-from-authentication", factory.EntityResolver.Authorization?.Scope.SubjectId);
        Assert.Contains(
            "investigation:read-impact-evidence",
            factory.EntityResolver.Authorization!.Scope.Grants);
        Assert.DoesNotContain("*", factory.EntityResolver.Authorization.Scope.Grants);
        Assert.Same(factory.EntityResolver.Authorization, factory.EvidenceSource.Authorization);

        using var responseJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("investigation-1", responseJson.RootElement.GetProperty("investigationId").GetString());
    }

    private static HttpClient CreateClient(ImpactAnswerFactory factory, bool authenticate = false)
    {
        var client = factory.CreateClient();
        if (authenticate)
        {
            client.DefaultRequestHeaders.Add(TestAuthenticationHandler.HeaderName, "authenticated");
        }

        return client;
    }

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string body) =>
        client.PostAsync(
            "/api/engineering/impact-answer",
            new StringContent(body, Encoding.UTF8, "application/json"));

    private static async Task AssertProblemCodeAsync(HttpResponseMessage response, string expectedCode)
    {
        using var responseJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expectedCode, responseJson.RootElement.GetProperty("code").GetString());
        Assert.Equal(
            "The authorization decision could not be completed.",
            responseJson.RootElement.GetProperty("detail").GetString());
    }

    private const string ValidRequest =
        """{"investigationId":"investigation-1","question":"What impacts if REQ-123 changes?","conversationId":"conversation-1"}""";

    private sealed class ImpactAnswerFactory(
        bool denyDecision = false,
        bool failDecision = false,
        bool useDefaultDecisionProvider = false,
        bool useDevelopmentIdentity = false) : WebApplicationFactory<Program>
    {
        public RecordingDecisionProvider DecisionProvider { get; } = new(denyDecision, failDecision);
        public RecordingTokenIssuer TokenIssuer { get; } = new();
        public RecordingEntityResolver EntityResolver { get; } = new();
        public RecordingEvidenceSource EvidenceSource { get; } = new();
        public FakeFactEvidenceRetriever FactEvidenceRetriever { get; } = new();
        public FakeApplicationContextRetriever ApplicationContextRetriever { get; } = new();
        public RecordingModelGateway ModelGateway { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(useDevelopmentIdentity ? "Development" : "Production");
            builder.ConfigureTestServices(services =>
            {
                if (!useDevelopmentIdentity)
                {
                    services.AddAuthentication(options =>
                        {
                            options.DefaultAuthenticateScheme = TestAuthenticationHandler.TestSchemeName;
                            options.DefaultChallengeScheme = TestAuthenticationHandler.TestSchemeName;
                            options.DefaultForbidScheme = TestAuthenticationHandler.TestSchemeName;
                        })
                        .AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(
                            TestAuthenticationHandler.TestSchemeName,
                            _ => { });
                }

                services.Configure<AiRuntimeOptions>(options =>
                {
                    options.Endpoint = "https://runtime.example.test";
                    options.DeploymentName = "test-deployment";
                    options.MaxInputTokens = 4096;
                });

                if (!useDevelopmentIdentity && !useDefaultDecisionProvider)
                {
                    services.RemoveAll<IResourceAuthorizationDecisionProvider>();
                    services.AddSingleton<IResourceAuthorizationDecisionProvider>(DecisionProvider);
                }

                if (!useDevelopmentIdentity)
                {
                    services.RemoveAll<IAuthorizationDecisionTokenIssuer>();
                    services.AddSingleton<IAuthorizationDecisionTokenIssuer>(TokenIssuer);
                }
                services.RemoveAll<IEngineeringEntityResolver>();
                services.AddSingleton<IEngineeringEntityResolver>(EntityResolver);
                services.RemoveAll<IEngineeringEvidenceSource>();
                services.AddSingleton<IEngineeringEvidenceSource>(EvidenceSource);
                services.RemoveAll<ISourceEvidenceRetriever>();
                services.AddSingleton<ISourceEvidenceRetriever>(new FakeSourceEvidenceRetriever());
                services.RemoveAll<IFactEvidenceRetriever>();
                services.AddSingleton<IFactEvidenceRetriever>(FactEvidenceRetriever);
                services.RemoveAll<IApplicationContextRetriever>();
                services.AddSingleton<IApplicationContextRetriever>(ApplicationContextRetriever);
                services.RemoveAll<ModelConfiguration>();
                services.AddSingleton(new ModelConfiguration(
                    "test-model-config",
                    "test",
                    "test-model",
                    "test-deployment",
                    256,
                    4096));
                services.RemoveAll<IModelGateway>();
                services.AddSingleton<IModelGateway>(ModelGateway);
            });
        }
    }

    private sealed class TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string TestSchemeName = "RuntimeIntegrationTest";
        public const string HeaderName = "X-Test-Authentication";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(HeaderName, out var value) ||
                !string.Equals(value.ToString(), "authenticated", StringComparison.Ordinal))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            var identity = new ClaimsIdentity(
            [
                new Claim("tid", "tenant-from-authentication"),
                new Claim("sub", "subject-from-authentication")
            ], TestSchemeName);
            var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), TestSchemeName);
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }

    private sealed class RecordingDecisionProvider(bool denyDecision, bool failDecision) : IResourceAuthorizationDecisionProvider
    {
        public int CallCount { get; private set; }
        public string? LastTenantId { get; private set; }
        public string? LastSubjectId { get; private set; }
        public string? LastInvestigationId { get; private set; }
        public string? LastTurnId { get; private set; }

        public Task<AuthorizationScope?> EvaluateAsync(
            ClaimsPrincipal principal,
            string investigationId,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            CallCount++;
            if (failDecision)
            {
                throw new HttpRequestException("Policy service unavailable.");
            }

            LastTenantId = principal.FindFirst("tid")?.Value;
            LastSubjectId = principal.FindFirst("sub")?.Value;
            LastInvestigationId = investigationId;
            LastTurnId = requestContext.TurnId;
            var grants = denyDecision
                ? new HashSet<string>(["investigation:resolve-entity"], StringComparer.Ordinal)
                : new HashSet<string>(
                    ["investigation:resolve-entity", "investigation:read-impact-evidence"],
                    StringComparer.Ordinal);
            return Task.FromResult<AuthorizationScope?>(new AuthorizationScope(
                LastTenantId!,
                LastSubjectId!,
                "server-policy-v1",
                "server-decision-1",
                grants,
                DateTimeOffset.UtcNow.AddMinutes(1)));
        }
    }

    private sealed class RecordingTokenIssuer : IAuthorizationDecisionTokenIssuer
    {
        public int CallCount { get; private set; }

        public Task<AuthorizationContext> IssueAsync(
            AuthorizationScope authorization,
            string investigationId,
            string requestId,
            CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(new AuthorizationContext(
                authorization,
                "server-signed-ticket",
                authorization.DecisionExpiresAt));
        }
    }

    private sealed class RecordingEntityResolver : IEngineeringEntityResolver
    {
        public int CallCount { get; private set; }
        public string? InvestigationId { get; private set; }
        public AuthorizationContext? Authorization { get; private set; }

        public Task<EntityResolutionResult> ResolveAsync(
            string investigationId,
            Lattice.AI.Runtime.Contracts.Requests.QuestionInterpretation interpretation,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            CallCount++;
            InvestigationId = investigationId;
            Authorization = authorization;
            return Task.FromResult(new EntityResolutionResult(
                EntityResolutionDisposition.Resolved,
                new ResolvedEntity("plm", "Requirement", "REQ-123", "Requirement REQ-123"),
                ["REQ-123"],
                []));
        }
    }

    private sealed class RecordingEvidenceSource : IEngineeringEvidenceSource
    {
        public int CallCount { get; private set; }
        public AuthorizationContext? Authorization { get; private set; }

        public Task<EvidenceRetrievalResult> RetrieveImpactAsync(
            ImpactEvidenceQuery query,
            CancellationToken cancellationToken)
        {
            CallCount++;
            Authorization = query.Authorization;
            return Task.FromResult(new EvidenceRetrievalResult(
                query.InvestigationId,
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
                [
                    new EvidenceSourceReference(
                        "evidence-1",
                        "relationship",
                        "plm",
                        "record-1",
                        "revision-1",
                        null,
                        null,
                        "provenance-1",
                        query.Authorization.Scope.DecisionId,
                        CitationId: "citation-1",
                        Authority: "source-authoritative",
                        Provider: "plm")
                ],
                "source-v1",
                "ontology-v1",
                query.Authorization.Scope.DecisionId,
                query.RequestContext.RequestId,
                query.RequestContext.TraceId));
        }

        public Task<EvidenceRetrievalResult> RetrieveInvestigationAsync(
            InvestigationEvidenceQuery query,
            CancellationToken cancellationToken)
        {
            CallCount++;
            Authorization = query.Authorization;
            return Task.FromResult(new EvidenceRetrievalResult(
                query.InvestigationId,
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
                [
                    new EvidenceSourceReference(
                        "evidence-1",
                        "relationship",
                        "plm",
                        "record-1",
                        "revision-1",
                        null,
                        null,
                        "provenance-1",
                        query.Authorization.Scope.DecisionId,
                        CitationId: "citation-1",
                        Authority: "source-authoritative",
                        Provider: "plm")
                ],
                "revision-1",
                "ontology-1",
                query.Authorization.Scope.DecisionId,
                query.RequestContext.RequestId,
                query.RequestContext.TraceId));
        }
    }

    private sealed class RecordingModelGateway : IModelGateway
    {
        private const string Content =
            """{"schemaVersion":"answer-v1","summary":"REQ-123 affects P-1.","impacts":[{"claimId":"relationship:relationship-1","explanation":"REQ-123 affects P-1.","evidenceIds":["evidence-1"],"sourceIds":["citation-1"]}],"warnings":[]}""";

        public int CallCount { get; private set; }

        public Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken)
        {
            if (request.PromptBundleId != "engineering-request-brief")
            {
                CallCount++;
            }
            return Task.FromResult(new ModelResponse(
                request.RequestContext,
                Content,
                "test",
                "test-model",
                null,
                10,
                10,
                TimeSpan.FromMilliseconds(1)));
        }
    }
}
