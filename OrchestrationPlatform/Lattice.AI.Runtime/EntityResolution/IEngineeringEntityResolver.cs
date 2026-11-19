using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.EntityResolution;

public interface IEngineeringEntityResolver
{
    Task<EntityResolutionResult> ResolveAsync(
        string investigationId,
        QuestionInterpretation interpretation,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken);
}
