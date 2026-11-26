using System.Security.Claims;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;

namespace Lattice.AI.Runtime.Tests.Evidence;

public sealed class AuthorizationAwareRetrievalTests
{
    [Fact]
    public async Task AnswerOperations_UseOneServerDecisionAndReuseTheSameTicket()
    {
        var decisionProvider = new RecordingDecisionProvider(Decision());
        var tokenIssuer = new RecordingTokenIssuer();
        var contextProvider = new AuthorizationContextProvider(decisionProvider, tokenIssuer);
        var principal = Principal();
        var requestContext = RequestContext();

        var result = await contextProvider.CreateAsync(
            principal,
            "investigation-1",
            requestContext,
            CancellationToken.None);
        var authorized = Assert.IsType<AuthorizationContextResult.Authorized>(result).Context;
        var resolver = new RecordingEntityResolver();
        var evidenceSource = new RecordingEvidenceSource();
        var query = new ImpactEvidenceQuery(
            "investigation-1",
            new ResolvedEntity("plm", "Part", "part-1", "Part 1"),
            new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
            authorized,
            requestContext);

        await resolver.ResolveAsync(
            "investigation-1",
            new QuestionInterpretation(ImpactQuestionType.EngineeringImpact, "impact ABC-1", null, "ABC-1", null, []),
            authorized,
            requestContext,
            CancellationToken.None);
        await evidenceSource.RetrieveImpactAsync(query, CancellationToken.None);

        Assert.Equal(1, decisionProvider.CallCount);
        Assert.Equal(1, tokenIssuer.CallCount);
        Assert.Same(authorized, resolver.Authorization);
        Assert.Same(authorized, evidenceSource.Authorization);
        Assert.Equal("ticket-1", resolver.Authorization?.SignedDecisionToken);
        Assert.Equal(resolver.Authorization?.SignedDecisionToken, evidenceSource.Authorization?.SignedDecisionToken);
    }

    [Fact]
    public async Task MissingPolicyProvider_DeniesBeforeAnyEvidenceOperation()
    {
        var contextProvider = new AuthorizationContextProvider(
            new UnavailableResourceAuthorizationDecisionProvider(),
            new RecordingTokenIssuer());
        var result = await contextProvider.CreateAsync(
            Principal(),
            "investigation-1",
            RequestContext(),
            CancellationToken.None);
        var denial = Assert.IsType<AuthorizationContextResult.Denied>(result);

        Assert.Equal(AuthorizationDenialCode.MissingProviderConfiguration, denial.Code);
        Assert.Equal(0, new RecordingEvidenceSource().CallCount);
    }

    [Fact]
    public async Task DeniedInvestigationDecision_IsNotConvertedToAuthorizationContext()
    {
        var deniedDecision = Decision() with
        {
            Grants = new HashSet<string> { "investigation:resolve-entity" }
        };
        var tokenIssuer = new RecordingTokenIssuer();
        var provider = new AuthorizationContextProvider(
            new RecordingDecisionProvider(deniedDecision),
            tokenIssuer);

        var result = await provider.CreateAsync(
            Principal(),
            "investigation-1",
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(
            AuthorizationDenialCode.InvestigationAccessDenied,
            Assert.IsType<AuthorizationContextResult.Denied>(result).Code);
        Assert.Equal(0, tokenIssuer.CallCount);
    }

    private static AuthorizationScope Decision() => new(
        "tenant-1",
        "subject-1",
        "policy-v1",
        "decision-1",
        new HashSet<string>
        {
            "investigation:resolve-entity",
            "investigation:read-impact-evidence"
        },
        DateTimeOffset.UtcNow.AddMinutes(1));

    private static ClaimsPrincipal Principal() => new(
        new ClaimsIdentity(
        [
            new Claim("tid", "tenant-1"),
            new Claim("sub", "subject-1")
        ], "test"));

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "4bf92f3577b34da6a3ce929d0e0e4736", null, null);

    private sealed class RecordingDecisionProvider(AuthorizationScope? decision)
        : IResourceAuthorizationDecisionProvider
    {
        public int CallCount { get; private set; }

        public Task<AuthorizationScope?> EvaluateAsync(
            ClaimsPrincipal principal,
            string investigationId,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(decision);
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
                "ticket-1",
                authorization.DecisionExpiresAt));
        }
    }

    private sealed class RecordingEntityResolver : IEngineeringEntityResolver
    {
        public AuthorizationContext? Authorization { get; private set; }

        public Task<EntityResolutionResult> ResolveAsync(
            string investigationId,
            QuestionInterpretation interpretation,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            Authorization = authorization;
            return Task.FromResult(new EntityResolutionResult(
                EntityResolutionDisposition.Resolved,
                new ResolvedEntity("plm", "Part", "part-1", "Part"),
                ["part-1"],
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
                [],
                [],
                [],
                [],
                "revision-1",
                "ontology-1",
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
                [],
                [],
                [],
                [],
                "revision-1",
                "ontology-1",
                query.Authorization.Scope.DecisionId,
                query.RequestContext.RequestId,
                query.RequestContext.TraceId));
        }
    }
}
