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
    private static readonly IReadOnlyList<string> InvestigationDiagnostics = Array.AsReadOnly(
        new[]
        {
            "The request is scoped to the authorized active investigation and retains its complete returned graph evidence."
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

        if (turn.FilterDelta.RequestedRelationshipTerms is { Count: > 0 } ||
            turn.FilterDelta.MaxHops is not null ||
            turn.FilterDelta.AsOf is not null)
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Unsupported,
                null,
                ["Requested relationship-filter semantics are not supported by the current PLM evidence contract."]);
        }

        var sourceApplications = (turn.FilterDelta.RequestedSourceApplications ?? [])
            .Concat(turn.FilterDelta.RequestedTargetApplications ?? [])
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (sourceApplications.Any(string.IsNullOrWhiteSpace))
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Unsupported,
                null,
                ["The requested source-application filter contains an empty value."]);
        }

        var hasSourceApplicationFilter = sourceApplications.Length > 0;
        if (!ReusableImpactTurns.Contains(turn.Type) &&
            !(turn.Type == ConversationTurnType.FollowUpFilter && hasSourceApplicationFilter))
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

        return CreateReadyPlan(
            subject,
            ReadyDiagnostics,
            sourceApplications,
            turn.ExplicitIdentifiers,
            hasSourceApplicationFilter ? "source-application-context" : "impact-source-evidence",
            turn.RequestedFactFieldIds,
            turn.ApplicationContextRequested || hasSourceApplicationFilter,
            requestFactEvidence: false);
    }

    public ScopePlanningResult Plan(
        QuestionInterpretation interpretation,
        ResolvedEntity? subject,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext)
    {
        ArgumentNullException.ThrowIfNull(interpretation);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(requestContext);

        if (interpretation.Type is not (ImpactQuestionType.EngineeringImpact or ImpactQuestionType.InvestigationQuestion) ||
            interpretation.ClarificationReasons.Count > 0)
        {
            return new ScopePlanningResult(
                ScopePlanningDisposition.Clarify,
                null,
                interpretation.ClarificationReasons);
        }

        return CreateReadyPlan(
            subject,
            subject is null ? InvestigationDiagnostics : ReadyDiagnostics,
            interpretation.RequestedSourceApplications,
            interpretation.CandidateEntityId is { Length: > 0 } candidateEntityId
                ? [candidateEntityId]
                : [],
            "impact-source-evidence",
            interpretation.RequestedFactFieldIds,
            interpretation.ApplicationContextRequested,
            requestFactEvidence: interpretation.Type == ImpactQuestionType.InvestigationQuestion);
    }

    private static ScopePlanningResult CreateReadyPlan(
        ResolvedEntity? subject,
        IReadOnlyList<string> diagnostics,
        IReadOnlyList<string>? requestedSourceApplications,
        IReadOnlyList<string>? exactIdentifiers,
        string reasonCode,
        IReadOnlyList<string>? requestedFactFieldIds = null,
        bool requestApplicationContext = false,
        bool requestFactEvidence = false)
    {
        var sourceApplications = requestedSourceApplications is null
            ? []
            : requestedSourceApplications
                .Select(application => application.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        var exactIds = exactIdentifiers is null
            ? []
            : exactIdentifiers
                .Where(identifier => !string.IsNullOrWhiteSpace(identifier))
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        var factSourceApplications = sourceApplications.Length > 0
            ? sourceApplications
            : FieldIdsSourceApplications(requestedFactFieldIds);
        var linkedEntityIds = subject is null
            ? Array.Empty<string>()
            : new[] { subject.CanonicalId };
        var sourceEvidencePlan = subject is null && !requestFactEvidence
            ? null
            : new SourceEvidencePlan(
                true,
                Array.AsReadOnly(linkedEntityIds),
                Array.AsReadOnly(sourceApplications),
                Array.AsReadOnly(exactIds),
                reasonCode);
        var fieldIds = requestedFactFieldIds is null
            ? []
            : requestedFactFieldIds
                .Where(fieldId => !string.IsNullOrWhiteSpace(fieldId))
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        var factEvidencePlan = fieldIds.Length == 0 && !requestFactEvidence && subject is not null
            ? null
            : new FactEvidencePlan(
                true,
                Array.AsReadOnly(linkedEntityIds),
                Array.AsReadOnly(factSourceApplications),
                Array.AsReadOnly(fieldIds),
                Array.AsReadOnly(exactIds),
                "resolvable-structured-field-need");
        var applicationContextPlan = requestApplicationContext
            ? new ApplicationContextPlan(
                true,
                Array.AsReadOnly(linkedEntityIds),
                Array.AsReadOnly(sourceApplications),
                "explicit-source-application-or-cross-application-intent")
            : null;

        return new ScopePlanningResult(
            ScopePlanningDisposition.Ready,
            new ImpactScope(
                new HashSet<string>(StringComparer.Ordinal),
                subject is null ? null : MaximumImpactHops,
                new HashSet<string>(StringComparer.Ordinal),
                null),
            diagnostics,
            sourceEvidencePlan,
            factEvidencePlan,
            requestApplicationContext || subject is null
                ? applicationContextPlan ?? new ApplicationContextPlan(
                    true,
                    Array.AsReadOnly(linkedEntityIds),
                    Array.AsReadOnly(sourceApplications),
                    "investigation-wide-application-coverage")
                : applicationContextPlan);
    }

    private static string[] FieldIdsSourceApplications(IReadOnlyList<string>? fieldIds)
    {
        if (fieldIds is null) return [];
        return fieldIds
            .Select(fieldId => fieldId.StartsWith("windchill.", StringComparison.Ordinal)
                ? "windchill"
                : fieldId.StartsWith("configit.", StringComparison.Ordinal)
                    ? "configit"
                    : fieldId.StartsWith("requirement.", StringComparison.Ordinal)
                        ? "codebeamer"
                        : null)
            .OfType<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
