using System.Security.Claims;
using System.Net;
using System.Text;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.Azure.Models;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Orchestration.API.AI.Adapters;

namespace Lattice.AI.Runtime.Tests.Authorization;

public sealed class LocalDevelopmentAuthorizationTests
{
    [Fact]
    public async Task DecisionProviderGrantsRuntimeOperationsToTheLocalDevelopmentPrincipal()
    {
        var provider = new LocalDevelopmentResourceAuthorizationDecisionProvider();
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim("tid", "local-development"),
            new Claim("sub", "local-development")
        ], "LocalDevelopment"));
        var requestContext = new RuntimeRequestContext("request-1", "trace-1", null, "conversation-1");

        var decision = await provider.EvaluateAsync(
            principal,
            "investigation-1",
            requestContext,
            CancellationToken.None);

        Assert.NotNull(decision);
        Assert.Equal("local-development", decision.TenantId);
        Assert.Equal("local-development", decision.SubjectId);
        Assert.Equal("local-development", decision.PolicyVersion);
        Assert.Equal("local-development", decision.DecisionId);
        Assert.Contains("investigation:resolve-entity", decision.Grants);
        Assert.Contains("investigation:read-impact-evidence", decision.Grants);
        Assert.True(decision.DecisionExpiresAt > DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task DecisionProviderDoesNotGrantAnUnauthenticatedPrincipal()
    {
        var provider = new LocalDevelopmentResourceAuthorizationDecisionProvider();
        var principal = new ClaimsPrincipal(new ClaimsIdentity());
        var requestContext = new RuntimeRequestContext("request-1", "trace-1", null, "conversation-1");

        var decision = await provider.EvaluateAsync(
            principal,
            "investigation-1",
            requestContext,
            CancellationToken.None);

        Assert.Null(decision);
    }

    [Fact]
    public async Task DevelopmentDecisionTokenIssuerReturnsTheLocalTicket()
    {
        var issuer = new LocalDevelopmentAuthorizationDecisionTokenIssuer();
        var scope = new Lattice.AI.Runtime.Contracts.Authorization.AuthorizationScope(
            "local-development",
            "local-development",
            "local-development",
            "decision-1",
            new HashSet<string>(StringComparer.Ordinal)
            {
                "investigation:resolve-entity",
                "investigation:read-impact-evidence"
            },
            DateTimeOffset.UtcNow.AddMinutes(1));

        var authorization = await issuer.IssueAsync(
            scope,
            "investigation-1",
            "request-1",
            CancellationToken.None);

        Assert.Equal("lattice-local-development", authorization.SignedDecisionToken);
        Assert.Equal(scope, authorization.Scope);
    }

    [Fact]
    public async Task DevelopmentApiAcceptsAnonymousLocalRequestAndReportsReadyWithModelConfiguration()
    {
        using var factory = new LocalDevelopmentApiFactory(configureModel: true);
        using var client = factory.CreateClient();

        Assert.IsType<LocalDevelopmentResourceAuthorizationDecisionProvider>(
            factory.Services.GetRequiredService<IResourceAuthorizationDecisionProvider>());
        var workloadToken = await factory.Services
            .GetRequiredService<PlmBrainWorkloadTokenProvider>()
            .GetTokenAsync(
                "request-1",
                "local-development",
                DateTimeOffset.UtcNow.AddMinutes(1),
                CancellationToken.None);
        Assert.Equal(LocalDevelopmentAuthenticationHandler.Token, workloadToken);

        const string answerRequest = """{"investigationId":"investigation-1","question":"Summarize this investigation."}""";
        var response = await PostAnswerAsync(client, answerRequest);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            "local-development",
            factory.AnswerService.Authorization?.Scope.TenantId);
        Assert.Equal(
            LocalDevelopmentAuthenticationHandler.Token,
            factory.AnswerService.Authorization?.SignedDecisionToken);

        var readiness = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, readiness.StatusCode);
    }

    [Fact]
    public async Task DevelopmentApiReportsNotReadyWithoutModelConfiguration()
    {
        using var factory = new LocalDevelopmentApiFactory(configureModel: false);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains(
            "AI_RUNTIME_MODEL_CONFIGURATION_NOT_CONFIGURED",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    private static Task<HttpResponseMessage> PostAnswerAsync(HttpClient client, string body) =>
        client.PostAsync(
            "/api/engineering/impact-answer",
            new StringContent(body, Encoding.UTF8, "application/json"));

    private sealed class LocalDevelopmentApiFactory(bool configureModel) : WebApplicationFactory<Program>
    {
        public LocalDevelopmentAnswerService AnswerService { get; } = new();

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                if (!configureModel) return;
                services.Configure<AiRuntimeOptions>(options =>
                {
                    options.Endpoint = "https://runtime.example.test";
                    options.DeploymentName = "local-test-deployment";
                });
                services.RemoveAll<IImpactAnswerService>();
                services.AddSingleton<IImpactAnswerService>(AnswerService);
            });
        }
    }

    private sealed class LocalDevelopmentAnswerService : IImpactAnswerService
    {
        public AuthorizationContext? Authorization { get; private set; }

        public Task<ImpactAnswerResult> AnswerAsync(
            ImpactAnswerRequest request,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            Authorization = authorization;
            return Task.FromResult(new ImpactAnswerResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Answer,
                "Local runtime answer",
                [],
                [],
                [],
                null));
        }
    }
}
