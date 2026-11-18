using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.ScopePlanning;

public sealed class ScopePlanner : IScopePlanner
{
    private const int MaximumImpactHops = 3;
    private static readonly IReadOnlyList<string> ReadyDiagnostics = Array.AsReadOnly(
        new[]
        {
            "The Phase 1 impact scope is bounded to a maximum of 3 relationship hops.",
            "Empty relationship-type and source-system filters add no additional narrowing; the planner does not infer either filter.",
            "Empty filters do not authorize access across investigations or sources: the service remains bound to the active investigation, resolved canonical subject, authorization decision, and provenance checks."
        });

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
            ReadyDiagnostics);
    }
}
