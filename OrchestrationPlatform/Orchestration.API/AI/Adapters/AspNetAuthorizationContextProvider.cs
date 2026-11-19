using System.Security.Claims;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Microsoft.Extensions.Options;

namespace Orchestration.API.AI.Adapters;

public sealed class AspNetAuthorizationContextProvider(
    IResourceAuthorizationDecisionProvider decisionProvider,
    IAuthorizationDecisionTokenIssuer tokenIssuer,
    IOptions<PlmBrainServiceOptions> options,
    TimeProvider? timeProvider = null) : IAuthorizationContextProvider
{
    private readonly AuthorizationContextProvider _provider = new(
        decisionProvider,
        tokenIssuer,
        options.Value.TenantClaimType ?? "tid",
        options.Value.SubjectClaimType ?? "sub",
        timeProvider);

    public async Task<AuthorizationContextResult> CreateAsync(
        ClaimsPrincipal principal,
        string investigationId,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        return await _provider.CreateAsync(principal, investigationId, requestContext, cancellationToken);
    }
}
