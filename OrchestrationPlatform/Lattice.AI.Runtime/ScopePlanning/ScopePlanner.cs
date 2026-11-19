using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.ScopePlanning;

public sealed class ScopePlanner : IScopePlanner
{
    private const int MaximumImpactHops = 3;
    private static readonly IReadOnlySet<ConversationTurnType> ReusableImpactTurns =
        new HashSet<ConversationTurnType>
        {
            ConversationTurnType.FollowUpExpansion,
            ConversationTurnType.FollowUpExplanation,
            ConversationTurnType.ClarificationResponse
        };
    private static readonly IReadOnlyList<string> ReadyDiagnostics = Array.AsReadOnly(
        new[]
        {
            "The Phase 1 impact scope is bounded to a maximum of 3 relationship hops.",
            "Empty relationship-type and source-system filters add no additional narrowing; the planner does not infer either filter.",
            "Empty filters do not authorize access across investigations or sources: the service remains bound to the active investigation, resolved canonical subject, authorization decision, and provenance checks."
        });

    public ScopePlanningResult Plan(
        ConversationTurnInterpretation turn,
        ConversationState? priorState,
        ResolvedEntity subject,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext)
    {
        ArgumentNullException.ThrowIfNull(turn);
        ArgumentNullException.ThrowIfNull(subject);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(requestContext);

        if (turn.IsAmbiguous ||
            turn.ClarificationRequired ||
            turn.ReferenceCandidateIds.Count != 1)
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Clarify,
                null,
                turn.ReasonCodes.Count > 0
                    ? turn.ReasonCodes
                    : ["The follow-up does not identify one validated engineering reference."]);
        }

        if (turn.FilterDelta.RequestedTargetApplications is { Count: > 0 } ||
            turn.FilterDelta.RequestedSourceApplications is { Count: > 0 } ||
            turn.FilterDelta.RequestedRelationshipTerms is { Count: > 0 } ||
            turn.FilterDelta.MaxHops is not null ||
            turn.FilterDelta.AsOf is not null)
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Unsupported,
                null,
                ["Requested application or relationship filter semantics are not supported by the current PLM evidence contract."]);
        }

        if (!ReusableImpactTurns.Contains(turn.Type))
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Unsupported,
                null,
                ["This follow-up output dimension is not supported by the current impact evidence contract."]);
        }

        var subjectWasValidated = priorState is not null &&
            (priorState.CurrentValidatedEntityRefs.Any(reference =>
                 string.Equals(reference.CanonicalId, subject.CanonicalId, StringComparison.Ordinal)) ||
             turn.Type == ConversationTurnType.ClarificationResponse &&
             priorState.UnresolvedReference?.CandidateCanonicalIds.Contains(
                 subject.CanonicalId,
                 StringComparer.Ordinal) == true) ||
            turn.ExplicitIdentifiers.Count == 1 &&
            turn.ReferenceCandidateIds.Count == 1;
        if (!subjectWasValidated)
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Clarify,
                null,
                ["The resolved follow-up subject is not present in the immediately preceding structured conversation state."]);
        }

        var interpretation = new QuestionInterpretation(
            ImpactQuestionType.EngineeringImpact,
            string.Empty,
            null,
            subject.CanonicalId,
            null,
            []);
        return Plan(interpretation, subject, authorization.Scope, requestContext);
    }

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
