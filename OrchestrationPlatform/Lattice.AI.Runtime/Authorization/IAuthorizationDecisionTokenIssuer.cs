using Lattice.AI.Runtime.Contracts.Authorization;

namespace Lattice.AI.Runtime.Authorization;

public interface IAuthorizationDecisionTokenIssuer
{
    Task<AuthorizationContext> IssueAsync(
        AuthorizationScope authorization,
        string investigationId,
        string requestId,
        CancellationToken cancellationToken);
}
