using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Validation;

public sealed class AnswerValidator(TimeProvider? timeProvider = null) : IAnswerValidator
{
    private const string ReadImpactEvidenceGrant = "investigation:read-impact-evidence";

    public ValidationResult Validate(
        AnswerCandidate answer,
        ContextPackage context,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext)
    {
        ArgumentNullException.ThrowIfNull(answer);
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(requestContext);

        var issues = new List<ValidationIssue>();
        if (string.IsNullOrWhiteSpace(answer.Summary))
        {
            issues.Add(new ValidationIssue("empty-summary", "The answer summary is empty."));
        }
        else if (ContainsUnsupportedIdentifier(answer.Summary, GetIdentifiers(context.Claims)))
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

        if (answer.Impacts.Count == 0)
        {
            return new ValidationResult(
                issues.Count == 0 ? ValidationDisposition.Abstain : ValidationDisposition.Reject,
                issues.Append(new ValidationIssue(
                    "no-supported-impacts",
                    "The answer contains no evidence-backed impact claims.")).ToArray());
        }

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
                if (!allowedSourceIds.Contains(sourceId))
                {
                    issues.Add(new ValidationIssue(
                        "unknown-source",
                        "The answer references a source that is not attached to its cited evidence.",
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

        return issues.Count == 0
            ? new ValidationResult(ValidationDisposition.Accept, Array.Empty<ValidationIssue>())
            : new ValidationResult(ValidationDisposition.Reject, issues);
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
