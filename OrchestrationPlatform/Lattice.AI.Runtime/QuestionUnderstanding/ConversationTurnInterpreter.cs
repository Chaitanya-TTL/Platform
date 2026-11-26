using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

public sealed class ConversationTurnInterpreter(TimeProvider? timeProvider = null)
    : IConversationTurnInterpreter
{
    private static readonly Regex ExplicitIdentifier = new(
        @"(?<![A-Z0-9_-])(?:REQ|R)-\d+(?![A-Z0-9_-])",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ImpactIntent = new(
        @"\b(?:impacts?|impacted|affected|downstream|depends?|dependents?|engineering\s+items)\b|\bwhat\s+happens\s+if\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ApplicationFilter = new(
        @"\b(?i:only|just)\s+(?<application>.+?)\s+(?:(?i:application)\s+)?(?i:impacts?)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex QuotedApplicationFilter = new(
        """\b(?i:only|just)\s+(?:"(?<application>[^"]+)"|'(?<application>[^']+)')\s+(?:(?i:application)\s+)?(?i:impacts?)\b""",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex OperationalRestriction = new(
        @"\bonly\s+operational\s+impacts?\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex CriticalityRestriction = new(
        @"\bonly\s+critical\s+impacts?\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ExpansionIntent = new(
        @"\b(?:expand|broaden|widen|show\s+more|include\s+more)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex OwnershipIntent = new(
        @"\b(?:who\s+owns?|owner(?:ship)?|which\s+teams?\s+(?:own|manage))\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ComparisonIntent = new(
        @"\b(?:compare|comparison|versus|vs\.?|difference(?:s)?)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ExplanationIntent = new(
        @"\b(?:why|explain|how\s+does|how\s+is)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ReferenceIntent = new(
        @"\b(?:it|that|those|them|these|this|they|their|its)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ClarificationResponseIntent = new(
        @"\b(?:i\s+meant|i\s+mean|the\s+first\s+one|the\s+second\s+one|the\s+last\s+one)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    public Task<ConversationTurnInterpretation> InterpretAsync(
        ConversationTurnInput input,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(requestContext);
        cancellationToken.ThrowIfCancellationRequested();

        var question = input.Question ?? string.Empty;
        var identifiers = ExplicitIdentifier.Matches(question)
            .Select(match => match.Value.ToUpperInvariant())
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var type = Classify(question, identifiers);
        var applicationMatch = QuotedApplicationFilter.Match(question);
        if (!applicationMatch.Success)
        {
            applicationMatch = ApplicationFilter.Match(question);
        }
        var targetApplications = type == ConversationTurnType.FollowUpFilter && applicationMatch.Success
            ? new[] { applicationMatch.Groups["application"].Value.Trim() }
            : null;
        var requestedRelationshipTerms = type == ConversationTurnType.FollowUpRestriction &&
            OperationalRestriction.IsMatch(question)
                ? new[] { "operational" }
                : null;

        var priorStateEligible = IsEligiblePriorState(input);
        var explicitReferences = identifiers;
        var priorReferences = priorStateEligible
            ? EligibleReferences(question, type, input.PreviousState!)
            : Array.Empty<string>();
        var references = explicitReferences.Length > 0
            ? explicitReferences
            : ReferenceIntent.IsMatch(question) || type is ConversationTurnType.FollowUpFilter
                or ConversationTurnType.FollowUpRestriction
                or ConversationTurnType.FollowUpExpansion
                or ConversationTurnType.FollowUpOwnershipQuestion
                or ConversationTurnType.FollowUpExplanation
                or ConversationTurnType.FollowUpComparison
                or ConversationTurnType.ClarificationResponse
                    ? priorReferences
                    : Array.Empty<string>();

        var reasons = new List<string>();
        var ambiguous = identifiers.Length > 1 || references.Length > 1;
        if (identifiers.Length > 1)
        {
            reasons.Add("multiple-explicit-identifiers");
        }
        else if (references.Length > 1)
        {
            reasons.Add("multiple-validated-subjects");
        }

        var requiresReference = type is ConversationTurnType.FollowUpFilter
            or ConversationTurnType.FollowUpRestriction
            or ConversationTurnType.FollowUpExpansion
            or ConversationTurnType.FollowUpOwnershipQuestion
            or ConversationTurnType.FollowUpExplanation
            or ConversationTurnType.FollowUpComparison
            or ConversationTurnType.ClarificationResponse;
        if (requiresReference && references.Length == 0)
        {
            reasons.Add(priorStateEligible
                ? "no-validated-subject-reference"
                : "no-eligible-prior-answer-state");
        }

        if (type == ConversationTurnType.FollowUpRestriction &&
            requestedRelationshipTerms is not null)
        {
            reasons.Add("filter-term-requires-current-ontology-validation");
        }
        if (CriticalityRestriction.IsMatch(question))
        {
            reasons.Add("criticality-requires-governed-definition");
        }

        var outputDimension = type switch
        {
            ConversationTurnType.FollowUpOwnershipQuestion => ConversationOutputDimension.Ownership,
            ConversationTurnType.FollowUpExplanation => ConversationOutputDimension.Explanation,
            ConversationTurnType.FollowUpComparison => ConversationOutputDimension.Comparison,
            ConversationTurnType.NewImpactQuestion or
                ConversationTurnType.FollowUpFilter or
                ConversationTurnType.FollowUpRestriction or
                ConversationTurnType.FollowUpExpansion => ConversationOutputDimension.Impact,
            _ => (ConversationOutputDimension?)null
        };

        var interpretation = new ConversationTurnInterpretation(
            type,
            identifiers,
            references,
            new ConversationFilterDelta(
                null,
                targetApplications,
                requestedRelationshipTerms,
                null,
                null),
            outputDimension,
            ambiguous,
            reasons,
            ambiguous || (requiresReference && references.Length == 0))
        {
            RequestedFactFieldIds = FactFieldNeedResolver.ResolveFieldIds(
                question,
                targetApplications),
            ApplicationContextRequested =
                targetApplications is { Length: > 0 } ||
                FactFieldNeedResolver.RequestsApplicationContext(question)
        };

        return Task.FromResult(interpretation);
    }

    private static ConversationTurnType Classify(string question, IReadOnlyList<string> identifiers)
    {
        if (ClarificationResponseIntent.IsMatch(question)) return ConversationTurnType.ClarificationResponse;
        if (OwnershipIntent.IsMatch(question)) return ConversationTurnType.FollowUpOwnershipQuestion;
        if (ComparisonIntent.IsMatch(question)) return ConversationTurnType.FollowUpComparison;
        if (ExplanationIntent.IsMatch(question)) return ConversationTurnType.FollowUpExplanation;
        if (OperationalRestriction.IsMatch(question) || CriticalityRestriction.IsMatch(question))
            return ConversationTurnType.FollowUpRestriction;
        if (IsApplicationFilter(question)) return ConversationTurnType.FollowUpFilter;
        if (Regex.IsMatch(question, @"\bonly\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            return ConversationTurnType.FollowUpRestriction;
        if (ExpansionIntent.IsMatch(question)) return ConversationTurnType.FollowUpExpansion;
        if (identifiers.Count > 0 || ImpactIntent.IsMatch(question))
            return ConversationTurnType.NewImpactQuestion;
        return ConversationTurnType.Unsupported;
    }

    private static bool IsApplicationFilter(string question) =>
        ApplicationFilter.IsMatch(question) || QuotedApplicationFilter.IsMatch(question);

    private bool IsEligiblePriorState(ConversationTurnInput input)
    {
        var state = input.PreviousState;
        var isAnswerState = state is not null &&
            state.LastTurnDisposition == ConversationTurnDisposition.Answer;
        var isClarificationState = state is not null &&
            ClarificationResponseIntent.IsMatch(input.Question) &&
            state.LastTurnDisposition == ConversationTurnDisposition.Clarify &&
            state.UnresolvedReference is not null;
        if (state is null ||
            state.SchemaVersion != 1 ||
            state.StateVersion < 1 ||
            (!isAnswerState && !isClarificationState) ||
            !string.Equals(state.ConversationId, input.ConversationId, StringComparison.Ordinal) ||
            !string.Equals(state.InvestigationId, input.InvestigationId, StringComparison.Ordinal) ||
            !string.Equals(state.PreviousTurnId, input.ParentTurnId, StringComparison.Ordinal))
        {
            return false;
        }

        return state.ExpiresAt > (timeProvider ?? TimeProvider.System).GetUtcNow();
    }

    private static string[] EligibleReferences(
        string question,
        ConversationTurnType type,
        ConversationState state)
    {
        if (type == ConversationTurnType.ClarificationResponse &&
            state.LastTurnDisposition == ConversationTurnDisposition.Clarify &&
            state.UnresolvedReference is { } unresolved)
        {
            var candidates = unresolved.CandidateCanonicalIds;
            var ordinal = new (string Word, int Index)[]
            {
                ("first", 0), ("second", 1), ("third", 2), ("fourth", 3), ("fifth", 4),
                ("sixth", 5), ("seventh", 6), ("eighth", 7), ("ninth", 8), ("tenth", 9)
            }.FirstOrDefault(candidate => Regex.IsMatch(
                question,
                $@"\b{candidate.Word}\b",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant));
            if (ordinal.Word is not null)
                return candidates.Skip(ordinal.Index).Take(1).ToArray();
            if (Regex.IsMatch(question, @"\blast\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
                return candidates.TakeLast(1).ToArray();
            return candidates.Distinct(StringComparer.Ordinal).ToArray();
        }

        var requestedEntityKind = Regex.IsMatch(
            question,
            @"\bmaterials?\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)
                ? "material"
                : Regex.IsMatch(question, @"\bparts?\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)
                    ? "part"
                    : null;
        if (requestedEntityKind is not null)
        {
            return state.CurrentValidatedEntityRefs
                .Where(reference => reference.EntityKind.Contains(requestedEntityKind, StringComparison.OrdinalIgnoreCase))
                .Select(reference => reference.CanonicalId)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        }

        if (type is ConversationTurnType.FollowUpOwnershipQuestion or ConversationTurnType.FollowUpComparison)
        {
            var requestedKind = type == ConversationTurnType.FollowUpOwnershipQuestion
                ? "material"
                : "part";
            var typedReferences = state.CurrentValidatedEntityRefs
                .Where(reference => reference.EntityKind.Contains(requestedKind, StringComparison.OrdinalIgnoreCase))
                .Select(reference => reference.CanonicalId)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            if (typedReferences.Length > 0) return typedReferences;
        }

        var isPluralReference = Regex.IsMatch(
            question,
            @"\b(?:those|them|these|they|their)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (isPluralReference)
        {
            return state.CurrentValidatedEntityRefs
                .Select(reference => reference.CanonicalId)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
        }

        var subjectIds = new HashSet<string>(state.CurrentSubjectIds, StringComparer.Ordinal);
        return state.CurrentValidatedEntityRefs
            .Where(reference => subjectIds.Contains(reference.CanonicalId))
            .Select(reference => reference.CanonicalId)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }
}
