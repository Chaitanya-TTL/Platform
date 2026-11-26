using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Validation;

public sealed class AnswerValidator(TimeProvider? timeProvider = null) : IAnswerValidator
{
    private const string ReadImpactEvidenceGrant = "investigation:read-impact-evidence";

    public ValidationResult Validate(
        AnswerCandidate answer,
        ContextPackage context,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext,
        string investigationId)
    {
        ArgumentNullException.ThrowIfNull(answer);
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(requestContext);

        var issues = new List<ValidationIssue>();
        if (string.IsNullOrWhiteSpace(investigationId) ||
            !string.Equals(context.InvestigationId, investigationId, StringComparison.Ordinal))
        {
            issues.Add(new ValidationIssue(
                "investigation-mismatch",
                "The Context Package does not belong to the requested investigation."));
        }

        if (string.IsNullOrWhiteSpace(answer.Summary))
        {
            issues.Add(new ValidationIssue("empty-summary", "The answer summary is empty."));
        }
        else if (ContainsUnsupportedIdentifier(answer.Summary, GetIdentifiers(context)))
        {
            issues.Add(new ValidationIssue(
                "unsupported-identifier",
                "The answer summary contains an identifier that is not present in the Context Package."));
        }

        if (answer.Warnings.Count > 0)
        {
            issues.Add(new ValidationIssue(
                "unsupported-warning",
                "Model-provided warnings are not accepted."));
        }

        if (!SameRequestContext(context.RequestContext, requestContext))
        {
            issues.Add(new ValidationIssue("request-context-mismatch", "The Context Package belongs to another request."));
        }

        if (string.IsNullOrWhiteSpace(context.PackageId) ||
            string.IsNullOrWhiteSpace(context.InvestigationId) ||
            string.IsNullOrWhiteSpace(context.AuthorizationDecisionId) ||
            !string.Equals(context.AuthorizationDecisionId, authorization.DecisionId, StringComparison.Ordinal) ||
            !authorization.Grants.Contains(ReadImpactEvidenceGrant) ||
            authorization.DecisionExpiresAt <= (timeProvider ?? TimeProvider.System).GetUtcNow())
        {
            issues.Add(new ValidationIssue("authorization-mismatch", "The Context Package is not covered by the current authorization."));
        }

        if (context.Sources.Any(source => string.IsNullOrWhiteSpace(source.EvidenceId)))
        {
            issues.Add(new ValidationIssue("invalid-source-id", "The Context Package contains a source without an evidence ID."));
        }

        var sourceGroups = context.Sources
            .Where(source => !string.IsNullOrWhiteSpace(source.EvidenceId))
            .GroupBy(source => source.EvidenceId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        if (sourceGroups.Values.Any(group => group.Skip(1).Any(source => source != group[0])))
        {
            issues.Add(new ValidationIssue("conflicting-source-reference", "The Context Package contains conflicting sources for an evidence ID."));
        }

        foreach (var source in context.Sources)
        {
            if (string.IsNullOrWhiteSpace(source.EvidenceId) ||
                string.IsNullOrWhiteSpace(source.SourceType) ||
                string.IsNullOrWhiteSpace(source.SourceSystem) ||
                string.IsNullOrWhiteSpace(source.RecordId) ||
                string.IsNullOrWhiteSpace(source.ProvenanceId) ||
                string.IsNullOrWhiteSpace(source.Authority) ||
                string.IsNullOrWhiteSpace(source.Provider) ||
                !string.Equals(source.AuthorizationDecisionId, authorization.DecisionId, StringComparison.Ordinal))
            {
                issues.Add(new ValidationIssue(
                    "unauthorized-source",
                    "The Context Package contains a source without complete provenance for the current authorization."));
                continue;
            }

            if (context.Scope.SourceSystems.Count > 0 &&
                !context.Scope.SourceSystems.Contains(source.SourceSystem) &&
                (source.Provider is null || !context.Scope.SourceSystems.Contains(source.Provider)))
            {
                issues.Add(new ValidationIssue(
                    "source-out-of-scope",
                    "The Context Package contains a source outside the requested source scope."));
            }
        }

        foreach (var fact in context.EngineeringFacts)
        {
            if (string.IsNullOrWhiteSpace(fact.FactId) ||
                !string.Equals(fact.InvestigationId, context.InvestigationId, StringComparison.Ordinal) ||
                !string.Equals(fact.AuthorizationDecisionId, authorization.DecisionId, StringComparison.Ordinal) ||
                !fact.CitationEligible ||
                fact.EvidenceIds.Count == 0 ||
                fact.CitationIds.Count == 0)
            {
                issues.Add(new ValidationIssue(
                    "unauthorized-fact",
                    "The Context Package contains a fact without complete current authorization or citation binding."));
            }
        }

        foreach (var participation in context.ApplicationParticipation)
        {
            if (string.IsNullOrWhiteSpace(participation.CandidateId) ||
                !string.Equals(participation.InvestigationId, context.InvestigationId, StringComparison.Ordinal) ||
                !string.Equals(
                    participation.AuthorizationDecisionId,
                    authorization.DecisionId,
                    StringComparison.Ordinal) ||
                participation.EvidenceIds.Count == 0 ||
                participation.CitationIds.Count == 0)
            {
                issues.Add(new ValidationIssue(
                    "unauthorized-application-context",
                    "The Context Package contains application participation without current authorization or citation binding."));
            }
        }

        if (context.Claims.Any(claim => string.IsNullOrWhiteSpace(claim.ClaimId)))
        {
            issues.Add(new ValidationIssue("invalid-package-claim-id", "The Context Package contains a claim without an ID."));
        }

        var claims = context.Claims
            .Where(claim => !string.IsNullOrWhiteSpace(claim.ClaimId))
            .GroupBy(claim => claim.ClaimId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        if (claims.Any(pair => pair.Value.Length != 1))
        {
            issues.Add(new ValidationIssue("duplicate-package-claim", "The Context Package contains conflicting claim IDs."));
        }

        if (answer.Impacts.Count == 0 &&
            answer.Facts.Count == 0 &&
            answer.ApplicationContexts.Count == 0 &&
            answer.SourceEvidence.Count == 0)
        {
            return new ValidationResult(
                issues.Count == 0 ? ValidationDisposition.Abstain : ValidationDisposition.Reject,
                issues.Append(new ValidationIssue(
                    "no-supported-evidence",
                    "The answer contains no evidence-backed claims.")).ToArray())
            {
                AssertionOutcomes = CreateAssertionOutcomes(answer, issues)
            };
        }

        ValidateFactAssertions(answer.Facts, context, issues);
        ValidateApplicationContextAssertions(answer.ApplicationContexts, context, issues);
        ValidateSourceEvidenceAssertions(answer.SourceEvidence, context, authorization, issues);

        var seenClaimIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var impact in answer.Impacts)
        {
            if (string.IsNullOrWhiteSpace(impact.Explanation))
            {
                issues.Add(new ValidationIssue(
                    "empty-explanation",
                    "Every impact must include a non-empty explanation.",
                    impact.ClaimId));
            }

            if (!seenClaimIds.Add(impact.ClaimId))
            {
                issues.Add(new ValidationIssue(
                    "duplicate-answer-claim",
                    "The answer references the same claim more than once.",
                    impact.ClaimId));
                continue;
            }

            if (!claims.TryGetValue(impact.ClaimId, out var matchingClaims) || matchingClaims.Length != 1)
            {
                issues.Add(new ValidationIssue(
                    "unknown-claim",
                    "The answer references a claim that is not present in the Context Package.",
                    impact.ClaimId));
                continue;
            }

            var claim = matchingClaims[0];
            if (!string.IsNullOrWhiteSpace(impact.Explanation) &&
                ContainsUnsupportedIdentifier(impact.Explanation, GetIdentifiers([claim])))
            {
                issues.Add(new ValidationIssue(
                    "unsupported-identifier",
                    "The impact explanation contains an identifier that is not present in its referenced claim.",
                    impact.ClaimId));
            }

            var citedSources = new List<(string EvidenceId, Lattice.AI.Runtime.Contracts.Evidence.EvidenceSourceReference Source)>();
            foreach (var evidenceId in impact.EvidenceIds.Distinct(StringComparer.Ordinal))
            {
                if (!claim.EvidenceIds.Contains(evidenceId, StringComparer.Ordinal) ||
                    !sourceGroups.TryGetValue(evidenceId, out var evidenceSources))
                {
                    issues.Add(new ValidationIssue(
                        "unknown-evidence",
                        "The answer references evidence that does not support the selected claim.",
                        impact.ClaimId));
                    continue;
                }

                foreach (var evidenceSource in evidenceSources)
                {
                    citedSources.Add((evidenceId, evidenceSource));
                }
            }

            if (impact.EvidenceIds.Count == 0 || impact.SourceIds.Count == 0)
            {
                issues.Add(new ValidationIssue(
                    "missing-provenance-reference",
                    "Every impact must cite evidence and source IDs.",
                    impact.ClaimId));
                continue;
            }

            var allowedSourceIds = citedSources
                .SelectMany(item => GetSourceIds(item.Source))
                .ToHashSet(StringComparer.Ordinal);
            foreach (var sourceId in impact.SourceIds.Distinct(StringComparer.Ordinal))
            {
                var matchingPassages = context.SourceEvidencePassages
                    .Where(passage => string.Equals(passage.PassageId, sourceId, StringComparison.Ordinal))
                    .ToArray();
                if (matchingPassages.Length > 0)
                {
                    if (matchingPassages.Any(passage =>
                            !string.Equals(
                                passage.AuthorizationDecisionId,
                                authorization.DecisionId,
                                StringComparison.Ordinal)))
                    {
                        issues.Add(new ValidationIssue(
                            "unauthorized-source",
                            "The answer references source evidence outside the current authorization decision.",
                            impact.ClaimId));
                    }

                    continue;
                }

                if (!allowedSourceIds.Contains(sourceId))
                {
                    issues.Add(new ValidationIssue(
                        "unknown-source",
                        "The answer references a source that is not present in the Context Package.",
                        impact.ClaimId));
                }
            }

            if (impact.EvidenceIds.Distinct(StringComparer.Ordinal).Any(evidenceId =>
                    sourceGroups.TryGetValue(evidenceId, out var sources) &&
                    sources.Any(source => !string.Equals(
                        source.AuthorizationDecisionId,
                        authorization.DecisionId,
                        StringComparison.Ordinal))))
            {
                issues.Add(new ValidationIssue(
                    "unauthorized-evidence",
                    "The answer references evidence outside the current authorization decision.",
                    impact.ClaimId));
            }
        }

        var result = issues.Count == 0
            ? new ValidationResult(ValidationDisposition.Accept, Array.Empty<ValidationIssue>())
            : new ValidationResult(ValidationDisposition.Reject, issues);
        return result with { AssertionOutcomes = CreateAssertionOutcomes(answer, issues) };
    }

    private static IReadOnlyList<ValidationAssertionOutcome> CreateAssertionOutcomes(
        AnswerCandidate answer,
        IReadOnlyList<ValidationIssue> issues) =>
        answer.Impacts.Select(impact => CreateOutcome(
                "impact",
                impact.ClaimId,
                impact.EvidenceIds,
                impact.SourceIds,
                issues))
            .Concat(answer.Facts.Select(fact => CreateOutcome(
                "fact",
                fact.FactId,
                fact.EvidenceIds,
                fact.SourceIds,
                issues)))
            .Concat(answer.ApplicationContexts.Select(application => CreateOutcome(
                "application-digest",
                application.CandidateId,
                application.EvidenceIds,
                application.SourceIds,
                issues)))
            .Concat(answer.SourceEvidence.Select(passage => CreateOutcome(
                "source-evidence",
                passage.PassageId,
                passage.EvidenceIds,
                passage.SourceIds,
                issues)))
            .ToArray();

    private static ValidationAssertionOutcome CreateOutcome(
        string assertionType,
        string assertionId,
        IReadOnlyList<string> evidenceIds,
        IReadOnlyList<string> citationIds,
        IReadOnlyList<ValidationIssue> issues)
    {
        var assertionIssues = issues
            .Where(issue => string.Equals(issue.ClaimId, assertionId, StringComparison.Ordinal))
            .Select(issue => issue.Code)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        return new ValidationAssertionOutcome(
            assertionType,
            assertionId,
            assertionIssues.Length == 0,
            evidenceIds,
            citationIds,
            assertionIssues);
    }

    private static void ValidateFactAssertions(
        IReadOnlyList<AnswerFactAssertion> assertions,
        ContextPackage context,
        ICollection<ValidationIssue> issues)
    {
        var facts = context.EngineeringFacts
            .Where(fact => !string.IsNullOrWhiteSpace(fact.FactId))
            .GroupBy(fact => fact.FactId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        var seenFactIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var assertion in assertions)
        {
            if (string.IsNullOrWhiteSpace(assertion.FactId) || !seenFactIds.Add(assertion.FactId))
            {
                issues.Add(new ValidationIssue(
                    "invalid-fact-assertion",
                    "The answer contains a missing or duplicate fact ID.",
                    assertion.FactId));
                continue;
            }

            if (!facts.TryGetValue(assertion.FactId, out var matches) || matches.Length != 1)
            {
                issues.Add(new ValidationIssue(
                    "unknown-fact",
                    "The answer references a fact that is not uniquely present in the Context Package.",
                    assertion.FactId));
                continue;
            }

            var fact = matches[0];
            if (!JsonElement.DeepEquals(assertion.ExactValue, fact.ExactSourceValue))
            {
                issues.Add(new ValidationIssue(
                    "unsupported-fact-value",
                    "The answer changes the exact value recorded in its compiled fact.",
                    assertion.FactId));
            }

            if (assertion.EvidenceIds.Count == 0 ||
                assertion.EvidenceIds.Distinct(StringComparer.Ordinal).Any(evidenceId =>
                    !fact.EvidenceIds.Contains(evidenceId, StringComparer.Ordinal)))
            {
                issues.Add(new ValidationIssue(
                    "unknown-fact-evidence",
                    "The answer cites evidence that is not attached to its compiled fact.",
                    assertion.FactId));
            }

            if (assertion.SourceIds.Count == 0 ||
                assertion.SourceIds.Distinct(StringComparer.Ordinal).Any(sourceId =>
                    !fact.CitationIds.Contains(sourceId, StringComparer.Ordinal)))
            {
                issues.Add(new ValidationIssue(
                    "unknown-fact-source",
                    "The answer cites a source that is not attached to its compiled fact.",
                    assertion.FactId));
            }
        }
    }

    private static void ValidateApplicationContextAssertions(
        IReadOnlyList<AnswerApplicationContextAssertion> assertions,
        ContextPackage context,
        ICollection<ValidationIssue> issues)
    {
        var participations = context.ApplicationParticipation
            .Where(participation => !string.IsNullOrWhiteSpace(participation.CandidateId))
            .GroupBy(participation => participation.CandidateId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        var seenCandidateIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var assertion in assertions)
        {
            if (string.IsNullOrWhiteSpace(assertion.CandidateId) ||
                !seenCandidateIds.Add(assertion.CandidateId))
            {
                issues.Add(new ValidationIssue(
                    "invalid-application-context-assertion",
                    "The answer contains a missing or duplicate application-context candidate ID.",
                    assertion.CandidateId));
                continue;
            }

            if (!participations.TryGetValue(assertion.CandidateId, out var matches) || matches.Length != 1)
            {
                issues.Add(new ValidationIssue(
                    "unknown-application-context",
                    "The answer references application participation that is not uniquely present in the Context Package.",
                    assertion.CandidateId));
                continue;
            }

            var participation = matches[0];
            if (assertion.EvidenceIds.Count == 0 ||
                assertion.EvidenceIds.Distinct(StringComparer.Ordinal).Any(evidenceId =>
                    !participation.EvidenceIds.Contains(evidenceId, StringComparer.Ordinal)))
            {
                issues.Add(new ValidationIssue(
                    "unknown-application-context-evidence",
                    "The answer cites evidence that is not attached to its application-context candidate.",
                    assertion.CandidateId));
            }

            if (assertion.SourceIds.Count == 0 ||
                assertion.SourceIds.Distinct(StringComparer.Ordinal).Any(sourceId =>
                    !participation.CitationIds.Contains(sourceId, StringComparer.Ordinal)))
            {
                issues.Add(new ValidationIssue(
                    "unknown-application-context-source",
                    "The answer cites a source that is not attached to its application-context candidate.",
                    assertion.CandidateId));
            }
        }
    }

    private static void ValidateSourceEvidenceAssertions(
        IReadOnlyList<AnswerSourceEvidenceAssertion> assertions,
        ContextPackage context,
        AuthorizationScope authorization,
        ICollection<ValidationIssue> issues)
    {
        var passages = context.SourceEvidencePassages
            .Where(passage => !string.IsNullOrWhiteSpace(passage.PassageId))
            .GroupBy(passage => passage.PassageId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        var seenPassageIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var assertion in assertions)
        {
            if (string.IsNullOrWhiteSpace(assertion.PassageId) ||
                !seenPassageIds.Add(assertion.PassageId))
            {
                issues.Add(new ValidationIssue(
                    "invalid-source-evidence-assertion",
                    "The answer contains a missing or duplicate source passage ID."));
                continue;
            }

            if (!passages.TryGetValue(assertion.PassageId, out var matches) || matches.Length != 1)
            {
                issues.Add(new ValidationIssue(
                    "unknown-source-evidence",
                    "The answer references a source passage that is not uniquely present in the Context Package."));
                continue;
            }

            var passage = matches[0];
            if (string.IsNullOrWhiteSpace(assertion.Explanation) ||
                ContainsUnsupportedIdentifier(assertion.Explanation, GetIdentifiers([passage])))
            {
                issues.Add(new ValidationIssue(
                    "unsupported-source-evidence-claim",
                    "The source-evidence explanation contains an empty or unsupported engineering identifier.",
                    assertion.PassageId));
            }

            if (!string.Equals(passage.InvestigationId, context.InvestigationId, StringComparison.Ordinal) ||
                !string.Equals(passage.AuthorizationDecisionId, authorization.DecisionId, StringComparison.Ordinal))
            {
                issues.Add(new ValidationIssue(
                    "unauthorized-source-evidence",
                    "The answer references source evidence outside the current investigation authorization.",
                    assertion.PassageId));
            }

            if (assertion.EvidenceIds.Count == 0 ||
                assertion.EvidenceIds.Distinct(StringComparer.Ordinal).Any(evidenceId =>
                    !passage.EvidenceIds.Contains(evidenceId, StringComparer.Ordinal)))
            {
                issues.Add(new ValidationIssue(
                    "unknown-source-evidence",
                    "The answer cites evidence that is not attached to its compiled source passage.",
                    assertion.PassageId));
            }

            if (assertion.SourceIds.Count == 0 ||
                assertion.SourceIds.Distinct(StringComparer.Ordinal).Any(sourceId =>
                    !string.Equals(sourceId, passage.PassageId, StringComparison.Ordinal)))
            {
                issues.Add(new ValidationIssue(
                    "unknown-source-evidence-source",
                    "The answer cites a source that is not the compiled passage identifier.",
                    assertion.PassageId));
            }
        }
    }

    private static HashSet<string> GetIdentifiers(IEnumerable<SourceEvidencePassage> passages)
    {
        var identifiers = new HashSet<string>(StringComparer.Ordinal);
        foreach (var passage in passages)
        {
            AddIdentifier(identifiers, passage.PassageId);
            AddIdentifier(identifiers, passage.ParentRecordId);
            AddIdentifier(identifiers, passage.SourceRecordId);
            foreach (var entityId in passage.CanonicalEntityIds)
            {
                AddIdentifier(identifiers, entityId);
            }
        }

        return identifiers;
    }

    private static HashSet<string> GetIdentifiers(ContextPackage context)
    {
        var identifiers = GetIdentifiers(context.Claims);
        foreach (var fact in context.EngineeringFacts)
        {
            AddIdentifier(identifiers, fact.FactId);
            AddIdentifier(identifiers, fact.SubjectId ?? "");
            AddIdentifier(identifiers, fact.SourceEntityId);
            AddIdentifier(identifiers, fact.SourceNativeId ?? "");
        }

        foreach (var participation in context.ApplicationParticipation)
        {
            AddIdentifier(identifiers, participation.CandidateId);
            foreach (var entityId in participation.CanonicalEntityIds)
            {
                AddIdentifier(identifiers, entityId);
            }
        }

        return identifiers;
    }

    private static HashSet<string> GetIdentifiers(IEnumerable<ImpactClaim> claims)
    {
        var identifiers = new HashSet<string>(StringComparer.Ordinal);
        foreach (var claim in claims)
        {
            AddIdentifier(identifiers, claim.ClaimId);
            foreach (var entityId in claim.EntityIds)
            {
                AddIdentifier(identifiers, entityId);
            }

            foreach (var relationshipId in claim.RelationshipIds)
            {
                AddIdentifier(identifiers, relationshipId);
            }
        }

        return identifiers;
    }

    private static void AddIdentifier(HashSet<string> identifiers, string identifier)
    {
        if (!string.IsNullOrWhiteSpace(identifier))
        {
            identifiers.Add(identifier);
        }
    }

    private static bool ContainsUnsupportedIdentifier(string text, HashSet<string> supportedIdentifiers)
    {
        var tokenStart = -1;
        for (var index = 0; index <= text.Length; index++)
        {
            if (index < text.Length && IsIdentifierCharacter(text[index]))
            {
                if (tokenStart < 0)
                {
                    tokenStart = index;
                }

                continue;
            }

            if (tokenStart < 0)
            {
                continue;
            }

            var token = text.AsSpan(tokenStart, index - tokenStart);
            if (IsEngineeringIdentifier(token) && !supportedIdentifiers.Contains(token.ToString()))
            {
                return true;
            }

            tokenStart = -1;
        }

        return false;
    }

    private static bool IsIdentifierCharacter(char value) =>
        IsAsciiLetter(value) || char.IsAsciiDigit(value) || value is '-' or '_';

    private static bool IsEngineeringIdentifier(ReadOnlySpan<char> token)
    {
        if (token.Length < 3 || !IsAsciiLetter(token[0]))
        {
            return false;
        }

        var hasDigit = false;
        var hasSeparator = false;
        foreach (var character in token)
        {
            hasDigit |= char.IsAsciiDigit(character);
            hasSeparator |= character is '-' or '_';
        }

        // Avoid treating ordinary words or standalone numbers as engineering identifiers.
        return hasDigit && hasSeparator;
    }

    private static bool IsAsciiLetter(char value) =>
        value is >= 'A' and <= 'Z' or >= 'a' and <= 'z';

    private static bool SameRequestContext(RuntimeRequestContext left, RuntimeRequestContext right) =>
        string.Equals(left.RequestId, right.RequestId, StringComparison.Ordinal) &&
        string.Equals(left.TraceId, right.TraceId, StringComparison.Ordinal) &&
        string.Equals(left.ParentRequestId, right.ParentRequestId, StringComparison.Ordinal) &&
        string.Equals(left.ConversationId, right.ConversationId, StringComparison.Ordinal);

    private static IEnumerable<string> GetSourceIds(
        Lattice.AI.Runtime.Contracts.Evidence.EvidenceSourceReference source)
    {
        if (!string.IsNullOrWhiteSpace(source.CitationId))
        {
            yield return source.CitationId;
        }

        if (!string.IsNullOrWhiteSpace(source.ProvenanceId))
        {
            yield return source.ProvenanceId;
        }

        if (!string.IsNullOrWhiteSpace(source.RecordId))
        {
            yield return source.RecordId;
        }

        if (!string.IsNullOrWhiteSpace(source.EvidenceId))
        {
            yield return source.EvidenceId;
        }
    }
}
