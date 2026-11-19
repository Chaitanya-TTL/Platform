using System.Security.Claims;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Authorization;

public interface IResourceAuthorizationDecisionProvider
{
    Task<AuthorizationScope?> EvaluateAsync(
        ClaimsPrincipal principal,
        string investigationId,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken);
}
