using System.Security.Claims;
using System.Text.Encodings.Web;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace Orchestration.API.AI.Adapters;

public sealed class LocalDevelopmentAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "LocalDevelopment";
    public const string Token = "lattice-local-development";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var authorization = Request.Headers.Authorization.ToString();
        var hasAuthorizationHeader = !string.IsNullOrWhiteSpace(authorization);
        var hasValidLocalToken =
            authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) &&
            string.Equals(authorization["Bearer ".Length..], Token, StringComparison.Ordinal);
        if (hasAuthorizationHeader && !hasValidLocalToken)
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var identity = new ClaimsIdentity(
        [
            new Claim("tid", "local-development"),
            new Claim("sub", "local-development")
        ], SchemeName);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

public sealed class LocalDevelopmentResourceAuthorizationDecisionProvider(
    TimeProvider? timeProvider = null) : IResourceAuthorizationDecisionProvider
{
    private static readonly IReadOnlySet<string> Grants = new HashSet<string>(
        ["investigation:resolve-entity", "investigation:read-impact-evidence"],
        StringComparer.Ordinal);

    public Task<AuthorizationScope?> EvaluateAsync(
        ClaimsPrincipal principal,
        string investigationId,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        if (principal.Identity?.IsAuthenticated != true ||
            principal.FindFirst("tid")?.Value != "local-development" ||
            principal.FindFirst("sub")?.Value != "local-development")
        {
            return Task.FromResult<AuthorizationScope?>(null);
        }

        var decision = new AuthorizationScope(
            "local-development",
            "local-development",
            "local-development",
            "local-development",
            Grants,
            (timeProvider ?? TimeProvider.System).GetUtcNow().AddMinutes(5));
        return Task.FromResult<AuthorizationScope?>(decision);
    }
}

public sealed class LocalDevelopmentAuthorizationDecisionTokenIssuer : IAuthorizationDecisionTokenIssuer
{
    public Task<AuthorizationContext> IssueAsync(
        AuthorizationScope authorization,
        string investigationId,
        string requestId,
        CancellationToken cancellationToken) =>
        Task.FromResult(new AuthorizationContext(
            authorization,
            LocalDevelopmentAuthenticationHandler.Token,
            authorization.DecisionExpiresAt));
}
