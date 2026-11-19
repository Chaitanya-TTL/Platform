using System.Security.Claims;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Tests.Authorization;

public sealed class AuthorizationContextProviderTests
{
    [Fact]
    public async Task CreateAsync_EvaluatesEachCallIndependently()
    {
        var decision = Decision(DateTimeOffset.UtcNow.AddMinutes(1));
        var decisionProvider = new RecordingDecisionProvider(decision);
        var tokenIssuer = new RecordingTokenIssuer();
        var provider = new AuthorizationContextProvider(decisionProvider, tokenIssuer);
        var principal = Principal();
        var requestContext = RequestContext();

        var firstResult = await provider.CreateAsync(
            principal,
            "investigation-1",
            requestContext,
            CancellationToken.None);
        var secondResult = await provider.CreateAsync(
            principal,
            "investigation-1",
            requestContext,
            CancellationToken.None);

        Assert.IsType<AuthorizationContextResult.Authorized>(firstResult);
        Assert.IsType<AuthorizationContextResult.Authorized>(secondResult);
        Assert.Equal(2, decisionProvider.CallCount);
        Assert.Equal(2, tokenIssuer.CallCount);
        Assert.Same(decision, tokenIssuer.LastDecision);
        Assert.Equal("investigation-1", tokenIssuer.LastInvestigationId);
        Assert.Equal(requestContext.RequestId, tokenIssuer.LastRequestId);
    }

    [Fact]
    public async Task CreateAsync_RejectsMissingIdentityWithoutEvaluatingDecision()
    {
        var decisionProvider = new RecordingDecisionProvider(Decision(DateTimeOffset.UtcNow.AddMinutes(1)));
        var tokenIssuer = new RecordingTokenIssuer();
        var provider = new AuthorizationContextProvider(decisionProvider, tokenIssuer);
        var principal = new ClaimsPrincipal(new ClaimsIdentity());

        var result = await provider.CreateAsync(
            principal,
            "investigation-1",
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(
            AuthorizationDenialCode.MissingIdentity,
            Assert.IsType<AuthorizationContextResult.Denied>(result).Code);
        Assert.Equal(0, decisionProvider.CallCount);
        Assert.Equal(0, tokenIssuer.CallCount);
    }

    [Fact]
    public async Task CreateAsync_DeniesInsufficientGrantsAndExpiredDecisionsBeforeIssuingTicket()
    {
        var now = DateTimeOffset.UtcNow;
        var insufficientGrants = Decision(now.AddMinutes(1)) with
        {
            Grants = new HashSet<string>(["investigation:resolve-entity"], StringComparer.Ordinal)
        };
        var deniedProvider = new AuthorizationContextProvider(
            new RecordingDecisionProvider(insufficientGrants),
            new RecordingTokenIssuer());

        var grantResult = await deniedProvider.CreateAsync(
            Principal(),
            "investigation-1",
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(
            AuthorizationDenialCode.InvestigationAccessDenied,
            Assert.IsType<AuthorizationContextResult.Denied>(grantResult).Code);

        var expiredTokenIssuer = new RecordingTokenIssuer();
        var expiredProvider = new AuthorizationContextProvider(
            new RecordingDecisionProvider(Decision(now)),
            expiredTokenIssuer,
            timeProvider: new FixedTimeProvider(now));
        var expiredResult = await expiredProvider.CreateAsync(
            Principal(),
            "investigation-1",
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(
            AuthorizationDenialCode.ExpiredPolicyDecision,
            Assert.IsType<AuthorizationContextResult.Denied>(expiredResult).Code);
        Assert.Equal(0, expiredTokenIssuer.CallCount);
    }

    [Fact]
    public async Task CreateAsync_PropagatesCancellationFromDecisionProvider()
    {
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();
        var decisionProvider = new RecordingDecisionProvider(
            Decision(DateTimeOffset.UtcNow.AddMinutes(1)),
            honorCancellation: true);
        var provider = new AuthorizationContextProvider(decisionProvider, new RecordingTokenIssuer());

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => provider.CreateAsync(
            Principal(),
            "investigation-1",
            RequestContext(),
            cancellation.Token));

        Assert.Equal(cancellation.Token, decisionProvider.LastCancellationToken);
    }

    private static ClaimsPrincipal Principal() => new(
        new ClaimsIdentity(
        [
            new Claim("tid", "tenant-1"),
            new Claim("sub", "subject-1")
        ], "test"));

    private static AuthorizationScope Decision(DateTimeOffset expiresAt) => new(
        "tenant-1",
        "subject-1",
        "policy-v1",
        "decision-1",
        new HashSet<string>(
        [
            "investigation:resolve-entity",
            "investigation:read-impact-evidence"
        ], StringComparer.Ordinal),
        expiresAt);

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "4bf92f3577b34da6a3ce929d0e0e4736", null, null);

    private sealed class RecordingDecisionProvider(
        AuthorizationScope? decision,
        bool honorCancellation = false) : IResourceAuthorizationDecisionProvider
    {
        public int CallCount { get; private set; }
        public CancellationToken LastCancellationToken { get; private set; }

        public Task<AuthorizationScope?> EvaluateAsync(
            ClaimsPrincipal principal,
            string investigationId,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            CallCount++;
            LastCancellationToken = cancellationToken;
            if (honorCancellation && cancellationToken.IsCancellationRequested)
            {
                return Task.FromCanceled<AuthorizationScope?>(cancellationToken);
            }

            return Task.FromResult(decision);
        }
    }

    private sealed class RecordingTokenIssuer : IAuthorizationDecisionTokenIssuer
    {
        public int CallCount { get; private set; }
        public AuthorizationScope? LastDecision { get; private set; }
        public string? LastInvestigationId { get; private set; }
        public string? LastRequestId { get; private set; }

        public Task<AuthorizationContext> IssueAsync(
            AuthorizationScope authorization,
            string investigationId,
            string requestId,
            CancellationToken cancellationToken)
        {
            CallCount++;
            LastDecision = authorization;
            LastInvestigationId = investigationId;
            LastRequestId = requestId;
            return Task.FromResult(new AuthorizationContext(
                authorization,
                "signed-ticket",
                authorization.DecisionExpiresAt));
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
