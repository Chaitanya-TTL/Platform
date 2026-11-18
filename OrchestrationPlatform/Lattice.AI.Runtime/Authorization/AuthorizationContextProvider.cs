using System.Security.Claims;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Authorization;

public sealed class AuthorizationContextProvider(
    IResourceAuthorizationDecisionProvider decisionProvider,
    IAuthorizationDecisionTokenIssuer tokenIssuer,
    string tenantClaimType = "tid",
    string subjectClaimType = "sub",
    TimeProvider? timeProvider = null) : IAuthorizationContextProvider
{
    private static readonly string[] RequiredGrants =
    [
        "investigation:resolve-entity",
        "investigation:read-impact-evidence"
    ];

    public Task<AuthorizationContextResult> CreateAsync(
        ClaimsPrincipal principal,
        string investigationId,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        if (principal.Identity?.IsAuthenticated != true ||
            string.IsNullOrWhiteSpace(investigationId) ||
            string.IsNullOrWhiteSpace(requestContext.RequestId))
        {
            return Task.FromResult<AuthorizationContextResult>(
                new AuthorizationContextResult.Denied(AuthorizationDenialCode.MissingIdentity));
        }

        var tenantId = principal.FindFirst(tenantClaimType)?.Value;
        var subjectId = principal.FindFirst(subjectClaimType)?.Value;
        if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(subjectId))
        {
            return Task.FromResult<AuthorizationContextResult>(
                new AuthorizationContextResult.Denied(AuthorizationDenialCode.MissingIdentity));
        }

        return CreateAuthorizedContextAsync(
            principal,
            investigationId,
            requestContext,
            tenantId,
            subjectId,
            cancellationToken);
    }

    private async Task<AuthorizationContextResult> CreateAuthorizedContextAsync(
        ClaimsPrincipal principal,
        string investigationId,
        RuntimeRequestContext requestContext,
        string tenantId,
        string subjectId,
        CancellationToken cancellationToken)
    {
        var decision = await decisionProvider.EvaluateAsync(
            principal,
            investigationId,
            requestContext,
            cancellationToken);
        if (decision is null)
        {
            return new AuthorizationContextResult.Denied(AuthorizationDenialCode.MissingProviderConfiguration);
        }

        if (!string.Equals(decision.TenantId, tenantId, StringComparison.Ordinal) ||
            !string.Equals(decision.SubjectId, subjectId, StringComparison.Ordinal) ||
            !RequiredGrants.All(decision.Grants.Contains))
        {
            return new AuthorizationContextResult.Denied(AuthorizationDenialCode.InvestigationAccessDenied);
        }

        if ((timeProvider ?? TimeProvider.System).GetUtcNow() >= decision.DecisionExpiresAt)
        {
            return new AuthorizationContextResult.Denied(AuthorizationDenialCode.ExpiredPolicyDecision);
        }

        var authorization = await tokenIssuer.IssueAsync(
            decision,
            investigationId,
            requestContext.RequestId,
            cancellationToken);
        return new AuthorizationContextResult.Authorized(authorization);
    }
}
