using System.Text;
using System.Text.Json;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Authorization;

namespace Lattice.AI.Runtime.Tests.Authorization;

public sealed class AuthorizationDecisionTokenTests
{
    [Fact]
    public async Task IssueAsync_CapsTicketAtDecisionExpiryOrSixtySeconds()
    {
        var now = DateTimeOffset.Parse("2026-11-17T10:00:00Z");
        var signer = new TestSigner();
        var issuer = new AuthorizationDecisionTokenIssuer(
            signer,
            new AuthorizationDecisionTicketOptions
            {
                Issuer = "https://runtime.example.test",
                Audience = "lattice-plm",
                MaximumLifetimeSeconds = 60
            },
            new TestTimeProvider(now));
        var authorization = AuthorizationScope(now.AddSeconds(90));

        var context = await issuer.IssueAsync(authorization, "investigation-1", "request-1", default);
        var payload = ReadPayload(context.SignedDecisionToken);

        Assert.Equal(now.AddSeconds(60).ToUnixTimeSeconds(), payload.GetProperty("exp").GetInt64());
        Assert.Equal("investigation-1", payload.GetProperty("investigation_id").GetString());
        Assert.Equal("engineering-impact-answer", payload.GetProperty("operation").GetString());
        Assert.Equal("request-1", payload.GetProperty("request_id").GetString());
    }

    [Fact]
    public async Task IssueAsync_CapsTicketAtEarlierPolicyDecisionExpiry()
    {
        var now = DateTimeOffset.Parse("2026-11-17T10:00:00Z");
        var issuer = new AuthorizationDecisionTokenIssuer(
            new TestSigner(),
            new AuthorizationDecisionTicketOptions { Issuer = "issuer", Audience = "audience" },
            new TestTimeProvider(now));

        var context = await issuer.IssueAsync(
            AuthorizationScope(now.AddSeconds(12)),
            "investigation-1",
            "request-1",
            default);

        Assert.Equal(now.AddSeconds(12), context.ExpiresAt);
    }

    [Fact]
    public async Task IssueAsync_RejectsAnAlreadyExpiredDecision()
    {
        var now = DateTimeOffset.Parse("2026-11-17T10:00:00Z");
        var issuer = new AuthorizationDecisionTokenIssuer(
            new TestSigner(),
            new AuthorizationDecisionTicketOptions { Issuer = "issuer", Audience = "audience" },
            new TestTimeProvider(now));

        await Assert.ThrowsAsync<InvalidOperationException>(() => issuer.IssueAsync(
            AuthorizationScope(now),
            "investigation-1",
            "request-1",
            default));
    }

    [Fact]
    public async Task AuthorizationContext_DoesNotSerializeTheSignedTicket()
    {
        var scope = AuthorizationScope(DateTimeOffset.UtcNow.AddSeconds(60));
        var context = new AuthorizationContext(scope, "secret-ticket", scope.DecisionExpiresAt);

        Assert.DoesNotContain("secret-ticket", JsonSerializer.Serialize(context));
    }

    private static AuthorizationScope AuthorizationScope(DateTimeOffset expiresAt) => new(
        "tenant-1",
        "subject-1",
        "policy-v1",
        "decision-1",
        new HashSet<string>
        {
            "investigation:resolve-entity",
            "investigation:read-impact-evidence"
        },
        expiresAt);

    private static JsonElement ReadPayload(string token)
    {
        var payload = token.Split('.')[1].Replace('-', '+').Replace('_', '/');
        payload = payload.PadRight(payload.Length + ((4 - payload.Length % 4) % 4), '=');
        return JsonDocument.Parse(Convert.FromBase64String(payload)).RootElement.Clone();
    }

    private sealed class TestSigner : IAuthorizationDecisionTokenSigner
    {
        public Task<string> GetKeyIdAsync(CancellationToken cancellationToken) =>
            Task.FromResult("key-1");

        public Task<byte[]> SignAsync(ReadOnlyMemory<byte> data, CancellationToken cancellationToken) =>
            Task.FromResult(Encoding.UTF8.GetBytes("signature"));
    }

    private sealed class TestTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
