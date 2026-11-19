using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Application;

public interface IImpactAnswerService
{
    Task<ImpactAnswerResult> AnswerAsync(
        ImpactAnswerRequest request,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken);
}
