using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Authorization;

namespace Lattice.AI.Runtime.Authorization;

public sealed record AuthorizationDecisionTicketOptions
{
    public string Issuer { get; init; } = string.Empty;
    public string Audience { get; init; } = string.Empty;
    public int MaximumLifetimeSeconds { get; init; } = 60;
}

public interface IAuthorizationDecisionTokenSigner
{
    Task<string> GetKeyIdAsync(CancellationToken cancellationToken);

    Task<byte[]> SignAsync(
        ReadOnlyMemory<byte> data,
        CancellationToken cancellationToken);
}

public sealed class AuthorizationDecisionTokenIssuer(
    IAuthorizationDecisionTokenSigner signer,
    AuthorizationDecisionTicketOptions options,
    TimeProvider? timeProvider = null) : IAuthorizationDecisionTokenIssuer
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string Operation = "engineering-impact-answer";
    private static readonly string[] RequiredGrants =
    [
        "investigation:resolve-entity",
        "investigation:read-impact-evidence"
    ];

    public async Task<AuthorizationContext> IssueAsync(
        AuthorizationScope authorization,
        string investigationId,
        string requestId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentException.ThrowIfNullOrWhiteSpace(investigationId);
        ArgumentException.ThrowIfNullOrWhiteSpace(requestId);

        if (string.IsNullOrWhiteSpace(options.Issuer) || string.IsNullOrWhiteSpace(options.Audience))
        {
            throw new InvalidOperationException("Authorization decision ticket issuer and audience must be configured.");
        }

        if (options.MaximumLifetimeSeconds is < 1 or > 60)
        {
            throw new InvalidOperationException("Authorization decision ticket maximum lifetime must be between 1 and 60 seconds.");
        }

        var now = (timeProvider ?? TimeProvider.System).GetUtcNow();
        if (now >= authorization.DecisionExpiresAt)
        {
            throw new InvalidOperationException("The server-side authorization decision has expired.");
        }
        if (!RequiredGrants.All(authorization.Grants.Contains))
        {
            throw new InvalidOperationException("The authorization decision does not grant all required PLM operations.");
        }

        var expiresAt = Min(authorization.DecisionExpiresAt, now.AddSeconds(options.MaximumLifetimeSeconds));
        if (expiresAt.ToUnixTimeSeconds() <= now.ToUnixTimeSeconds())
        {
            throw new InvalidOperationException("The authorization decision expires before a usable ticket can be issued.");
        }
        var claims = new AuthorizationDecisionTicketClaims(
            options.Issuer,
            options.Audience,
            authorization.TenantId,
            authorization.SubjectId,
            investigationId,
            Operation,
            RequiredGrants,
            authorization.PolicyVersion,
            authorization.DecisionId,
            requestId,
            Guid.NewGuid().ToString("N"),
            now,
            expiresAt);

        var keyId = await signer.GetKeyIdAsync(cancellationToken);
        var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(
            new { alg = "RS256", typ = "JWT", kid = keyId }, JsonOptions));
        var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object>
        {
            ["iss"] = claims.Issuer,
            ["aud"] = claims.Audience,
            ["tid"] = claims.TenantId,
            ["sub"] = claims.SubjectId,
            ["investigation_id"] = claims.InvestigationId,
            ["operation"] = claims.Operation,
            ["grants"] = claims.Grants,
            ["policy_version"] = claims.PolicyVersion,
            ["decision_id"] = claims.DecisionId,
            ["request_id"] = claims.RequestId,
            ["jti"] = claims.TokenId,
            ["iat"] = claims.IssuedAt.ToUnixTimeSeconds(),
            ["exp"] = claims.ExpiresAt.ToUnixTimeSeconds()
        }, JsonOptions));

        var signingInput = $"{header}.{payload}";
        var signature = await signer.SignAsync(Encoding.ASCII.GetBytes(signingInput), cancellationToken);
        var token = $"{signingInput}.{Base64Url(signature)}";

        return new AuthorizationContext(authorization, token, expiresAt);
    }

    private static DateTimeOffset Min(DateTimeOffset left, DateTimeOffset right) =>
        left < right ? left : right;

    private static string Base64Url(ReadOnlySpan<byte> value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
