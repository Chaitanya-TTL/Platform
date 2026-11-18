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
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.Generation;
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
    public async Task PostImpactAnswer_ReturnsForbiddenBeforeCallingPlmWhenDecisionIsDenied()
    {
        using var factory = new ImpactAnswerFactory(denyDecision: true);
        using var client = CreateClient(factory, authenticate: true);

        var response = await PostAsync(client, ValidRequest);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, factory.DecisionProvider.CallCount);
        Assert.Equal(0, factory.TokenIssuer.CallCount);
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(0, factory.EvidenceSource.CallCount);
    }

    [Fact]
    public async Task PostImpactAnswer_ReportsAuthorizationProviderFailureAsUnavailable()
    {
        using var factory = new ImpactAnswerFactory(failDecision: true);
        using var client = CreateClient(factory, authenticate: true);

        var response = await PostAsync(client, ValidRequest);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(0, factory.EntityResolver.CallCount);
        Assert.Equal(0, factory.EvidenceSource.CallCount);
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
              "tenantId": "attacker-tenant",
              "subjectId": "attacker-subject",
              "grants": ["*"],
              "policyVersion": "attacker-policy",
              "decisionId": "attacker-decision"
            }
            """;

        var response = await PostAsync(client, requestWithOverrides);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("tenant-from-authentication", factory.DecisionProvider.LastTenantId);
        Assert.Equal("subject-from-authentication", factory.DecisionProvider.LastSubjectId);
        Assert.Equal("investigation-1", factory.DecisionProvider.LastInvestigationId);
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

    private const string ValidRequest =
        """{"investigationId":"investigation-1","question":"What impacts if REQ-123 changes?","conversationId":"conversation-1"}""";

    private sealed class ImpactAnswerFactory(
        bool denyDecision = false,
        bool failDecision = false) : WebApplicationFactory<Program>
    {
        public RecordingDecisionProvider DecisionProvider { get; } = new(denyDecision, failDecision);
        public RecordingTokenIssuer TokenIssuer { get; } = new();
        public RecordingEntityResolver EntityResolver { get; } = new();
        public RecordingEvidenceSource EvidenceSource { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.ConfigureTestServices(services =>
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

                services.RemoveAll<IResourceAuthorizationDecisionProvider>();
                services.AddSingleton<IResourceAuthorizationDecisionProvider>(DecisionProvider);
                services.RemoveAll<IAuthorizationDecisionTokenIssuer>();
                services.AddSingleton<IAuthorizationDecisionTokenIssuer>(TokenIssuer);
                services.RemoveAll<IEngineeringEntityResolver>();
                services.AddSingleton<IEngineeringEntityResolver>(EntityResolver);
                services.RemoveAll<IEngineeringEvidenceSource>();
                services.AddSingleton<IEngineeringEvidenceSource>(EvidenceSource);
                services.RemoveAll<IModelGateway>();
                services.AddSingleton<IModelGateway, TestModelGateway>();
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
    }

    private sealed class TestModelGateway : IModelGateway
    {
        private const string Content =
            """{"schemaVersion":"answer-v1","summary":"REQ-123 affects P-1.","impacts":[{"claimId":"relationship:relationship-1","explanation":"REQ-123 affects P-1.","evidenceIds":["evidence-1"],"sourceIds":["citation-1"]}],"warnings":[]}""";

        public Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken) =>
            Task.FromResult(new ModelResponse(
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
