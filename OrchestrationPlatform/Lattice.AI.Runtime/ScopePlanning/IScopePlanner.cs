using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.ScopePlanning;

public interface IScopePlanner
{
    ScopePlanningResult Plan(
        QuestionInterpretation interpretation,
        ResolvedEntity subject,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext);
}
