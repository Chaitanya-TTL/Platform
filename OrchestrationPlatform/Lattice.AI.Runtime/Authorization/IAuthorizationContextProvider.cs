using System.Security.Claims;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Authorization;

public interface IAuthorizationContextProvider
{
    Task<AuthorizationContextResult> CreateAsync(
        ClaimsPrincipal principal,
        string investigationId,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken);
}
