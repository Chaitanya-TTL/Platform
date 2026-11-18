using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.ScopePlanning;

public sealed class ScopePlanner : IScopePlanner
{
    private const int MaximumImpactHops = 3;

    public ScopePlanningResult Plan(
        QuestionInterpretation interpretation,
        ResolvedEntity subject,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext)
    {
        ArgumentNullException.ThrowIfNull(interpretation);
        ArgumentNullException.ThrowIfNull(subject);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(requestContext);

        if (interpretation.Type != ImpactQuestionType.EngineeringImpact ||
            interpretation.ClarificationReasons.Count > 0)
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Clarify,
                null,
                interpretation.ClarificationReasons);
        }

        return new ScopePlanningResult(
            ScopePlanningDisposition.Ready,
            new ImpactScope(new HashSet<string>(StringComparer.Ordinal), MaximumImpactHops,
                new HashSet<string>(StringComparer.Ordinal), null),
            Array.Empty<string>());
    }
}
