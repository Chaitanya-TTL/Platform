using System.Security.Claims;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Authorization;

public sealed class UnavailableResourceAuthorizationDecisionProvider
    : IResourceAuthorizationDecisionProvider
{
    public Task<AuthorizationScope?> EvaluateAsync(
        ClaimsPrincipal principal,
        string investigationId,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken) =>
        Task.FromResult<AuthorizationScope?>(null);
}
