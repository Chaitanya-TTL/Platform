using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.ContextCompilation;

public sealed class ContextCompiler : IContextCompiler
{
    private const string SchemaVersion = "context-v1";
    private const string CompilerVersion = "compiler-v1";
    private const string ReadImpactEvidenceGrant = "investigation:read-impact-evidence";

    public ContextCompilationResult Compile(ContextCompilationInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(input.RequestContext);
        ArgumentNullException.ThrowIfNull(input.Subject);
        ArgumentNullException.ThrowIfNull(input.Scope);
        ArgumentNullException.ThrowIfNull(input.Authorization);
        ArgumentNullException.ThrowIfNull(input.Evidence);
        ArgumentNullException.ThrowIfNull(input.Budget);
        ArgumentException.ThrowIfNullOrWhiteSpace(input.InvestigationId);

        if (input.Budget.MaxClaims < 0 ||
            input.Budget.MaxEvidenceItems < 0 ||
            input.Budget.MaxEstimatedTokens < 0 ||
            input.Scope.MaxHops is < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(input), "Context budgets and maximum hops cannot be negative.");
        }

        var evidence = input.Evidence;
        if (!string.Equals(input.InvestigationId, evidence.InvestigationId, StringComparison.Ordinal))
        {
            return Denied("The requested investigation does not match the evidence investigation.");
        }

        if (!string.Equals(input.Authorization.DecisionId, evidence.AuthorizationDecisionId, StringComparison.Ordinal))
        {
            return Denied("The authorization decision does not match the evidence.");
        }

        if (!input.Authorization.Grants.Contains(ReadImpactEvidenceGrant))
        {
            return Denied("The authorization decision does not grant impact-evidence access.");
        }

        if (!string.Equals(input.RequestContext.RequestId, evidence.RequestId, StringComparison.Ordinal) ||
            !string.Equals(input.RequestContext.TraceId, evidence.TraceId, StringComparison.Ordinal))
        {
            return Denied("The evidence request or trace correlation does not match the request context.");
        }

        var sourceGroups = evidence.Sources
            .Where(source => !string.IsNullOrWhiteSpace(source.EvidenceId))
            .GroupBy(source => source.EvidenceId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        var usableSources = new Dictionary<string, EvidenceSourceReference>(StringComparer.Ordinal);
        var conflictingEvidenceIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var (evidenceId, sourceGroup) in sourceGroups)
        {
            var first = sourceGroup[0];
            if (sourceGroup.Any(source => !SameSource(first, source)))
            {
                conflictingEvidenceIds.Add(evidenceId);
                continue;
            }

            if (HasCompleteProvenance(first, input.Authorization.DecisionId))
            {
                usableSources.Add(evidenceId, first);
            }
        }

        var allowedRelationships = evidence.Relationships
            .Where(relationship => IsRelationshipInScope(relationship, input.Scope, usableSources))
            .GroupBy(relationship => relationship.RelationshipId, StringComparer.Ordinal)
            .Where(group => group.Select(RelationshipKey).Distinct(StringComparer.Ordinal).Count() == 1)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);

        var candidates = new Dictionary<string, ImpactClaim>(StringComparer.Ordinal);
        var candidateErrors = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var relationship in allowedRelationships.Values)
        {
            if (string.IsNullOrWhiteSpace(relationship.Explanation))
            {
                continue;
            }

            AddCandidate(
                new ImpactClaim(
                    $"relationship:{relationship.RelationshipId}",
                    relationship.Explanation,
                    [relationship.SourceEntityId, relationship.TargetEntityId],
                    [relationship.RelationshipId],
                    relationship.EvidenceIds.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray(),
                    null),
                candidates,
                candidateErrors);
        }

        foreach (var pathGroup in evidence.Paths
                     .Where(path => !string.IsNullOrWhiteSpace(path.PathId))
                     .GroupBy(path => path.PathId, StringComparer.Ordinal)
                     .OrderBy(group => group.Key, StringComparer.Ordinal))
        {
            var path = pathGroup.First();
            var claimId = $"path:{path.PathId}";
            if (pathGroup.Any(other => !SamePath(path, other)))
            {
                candidateErrors[claimId] = "Conflicting impact paths share the same stable path ID.";
                continue;
            }

            if (!IsPathInScope(path.RelationshipIds, allowedRelationships, input.Scope) ||
                path.ImpactEligible == false ||
                path.EntityIds.Count == 0 ||
                !string.Equals(path.EntityIds[0], input.Subject.CanonicalId, StringComparison.Ordinal))
            {
                continue;
            }

            var meanings = (path.Meanings ?? Array.Empty<string>())
                .Where(meaning => !string.IsNullOrWhiteSpace(meaning))
                .ToArray();
            if (meanings.Length == 0)
            {
                meanings = (path.Steps ?? Array.Empty<ImpactPathStep>())
                    .Select(step => step.Meaning)
                    .Where(meaning => !string.IsNullOrWhiteSpace(meaning))
                    .ToArray();
            }

            var statement = string.Join(Environment.NewLine, meanings);
            if (string.IsNullOrWhiteSpace(statement))
            {
                continue;
            }

            var evidenceIds = path.RelationshipIds
                .Where(allowedRelationships.ContainsKey)
                .SelectMany(id => allowedRelationships[id].EvidenceIds)
                .Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal)
                .ToArray();

            AddCandidate(
                new ImpactClaim(
                    claimId,
                    statement,
                    path.EntityIds.Distinct(StringComparer.Ordinal).ToArray(),
                    path.RelationshipIds.Distinct(StringComparer.Ordinal).ToArray(),
                    evidenceIds,
                    null),
                candidates,
                candidateErrors);
        }

        foreach (var chainGroup in evidence.Chains
                     .Where(chain => !string.IsNullOrWhiteSpace(chain.ChainId))
                     .GroupBy(chain => chain.ChainId, StringComparer.Ordinal)
                     .OrderBy(group => group.Key, StringComparer.Ordinal))
        {
            var chain = chainGroup.First();
            var claimId = chain.ChainId;
            if (chainGroup.Any(other => !SameChain(chain, other)))
            {
                candidateErrors[claimId] = "Conflicting impact chains share the same stable chain ID.";
                continue;
            }

            if (!IsPathInScope(chain.RelationshipIds, allowedRelationships, input.Scope) ||
                !string.Equals(chain.SourceEntityId, input.Subject.CanonicalId, StringComparison.Ordinal))
            {
                continue;
            }

            if (!double.IsFinite(chain.Confidence) || chain.Confidence is < 0 or > 1)
            {
                candidateErrors[claimId] = "The authoritative impact chain has invalid confidence metadata.";
                continue;
            }

            var evidenceIds = chain.SupportingEvidenceIds
                .Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal)
                .ToArray();
            AddCandidate(
                new ImpactClaim(
                    claimId,
                    chain.EngineeringExplanation,
                    [chain.SourceEntityId, chain.ImpactedEntityId],
                    chain.RelationshipIds.Distinct(StringComparer.Ordinal).ToArray(),
                    evidenceIds,
                    chain.ImpactRationale,
                    chain.Confidence),
                candidates,
                candidateErrors);
        }

        var omittedClaims = new Dictionary<string, string>(candidateErrors, StringComparer.Ordinal);
        var acceptedClaims = new List<ImpactClaim>();
        var selectedEvidenceIds = new HashSet<string>(StringComparer.Ordinal);
        var estimatedTokens = EstimatePackageMetadata(input.RequestContext, input.InvestigationId, input.Subject);

        foreach (var (claimId, claim) in candidates.OrderBy(pair => pair.Key, StringComparer.Ordinal))
        {
            if (claim.EvidenceIds.Count == 0)
            {
                omittedClaims[claimId] = "No complete source provenance is available for this claim.";
                continue;
            }

            var unavailableEvidenceId = claim.EvidenceIds.FirstOrDefault(id =>
                !usableSources.ContainsKey(id) ||
                conflictingEvidenceIds.Contains(id) ||
                !IsSourceInScope(usableSources[id], input.Scope));
            if (unavailableEvidenceId is not null)
            {
                var reason = conflictingEvidenceIds.Contains(unavailableEvidenceId)
                    ? $"Evidence '{unavailableEvidenceId}' has conflicting source records."
                    : $"Evidence '{unavailableEvidenceId}' lacks complete source provenance or is out of scope.";
                omittedClaims[claimId] = reason;
                continue;
            }

            if (acceptedClaims.Count >= input.Budget.MaxClaims)
            {
                omittedClaims[claimId] = "Claim omitted because the maximum claim count was reached.";
                continue;
            }

            var additionalEvidenceIds = claim.EvidenceIds
                .Where(id => !selectedEvidenceIds.Contains(id))
                .ToArray();
            if (selectedEvidenceIds.Count + additionalEvidenceIds.Length > input.Budget.MaxEvidenceItems)
            {
                omittedClaims[claimId] = "Claim omitted because the maximum evidence-item count would be exceeded.";
                continue;
            }

            var claimTokenCost = EstimateClaim(claim) +
                                 additionalEvidenceIds.Sum(id => EstimateSource(usableSources[id]));
            if (estimatedTokens + claimTokenCost > input.Budget.MaxEstimatedTokens)
            {
                omittedClaims[claimId] = "Claim omitted because the estimated-token budget would be exceeded.";
                continue;
            }

            acceptedClaims.Add(claim);
            selectedEvidenceIds.UnionWith(additionalEvidenceIds);
            estimatedTokens += claimTokenCost;
        }

        var packageSources = selectedEvidenceIds
            .Order(StringComparer.Ordinal)
            .Select(id => usableSources[id])
            .ToArray();
        var omissions = omittedClaims
            .OrderBy(pair => pair.Key, StringComparer.Ordinal)
            .Select(pair => new ContextOmission(pair.Key, pair.Value))
            .ToArray();
        var package = new ContextPackage(
            input.RequestContext,
            input.InvestigationId,
            CreatePackageId(input, acceptedClaims, packageSources),
            SchemaVersion,
            CompilerVersion,
            input.Authorization.DecisionId,
            input.Subject,
            input.Scope,
            acceptedClaims,
            packageSources,
            omissions);

        var disposition = acceptedClaims.Count > 0
            ? CompilationDisposition.Ready
            : candidates.Count == 0 && omissions.Length == 0
                ? CompilationDisposition.Empty
                : CompilationDisposition.InsufficientEvidence;
        return new ContextCompilationResult(package, disposition, Array.Empty<string>());
    }

    private static ContextCompilationResult Denied(string diagnostic) =>
        new(null, CompilationDisposition.Denied, [diagnostic]);

    private static bool HasCompleteProvenance(
        EvidenceSourceReference source,
        string expectedDecisionId) =>
        !string.IsNullOrWhiteSpace(source.EvidenceId) &&
        !string.IsNullOrWhiteSpace(source.SourceType) &&
        !string.IsNullOrWhiteSpace(source.SourceSystem) &&
        !string.IsNullOrWhiteSpace(source.RecordId) &&
        !string.IsNullOrWhiteSpace(source.ProvenanceId) &&
        !string.IsNullOrWhiteSpace(source.Provider) &&
        !string.IsNullOrWhiteSpace(source.Authority) &&
        string.Equals(source.AuthorizationDecisionId, expectedDecisionId, StringComparison.Ordinal);

    private static bool SameSource(EvidenceSourceReference left, EvidenceSourceReference right) =>
        left == right;

    private static bool IsRelationshipInScope(
        RelationshipEvidence relationship,
        ImpactScope scope,
        IReadOnlyDictionary<string, EvidenceSourceReference> sources)
    {
        if (scope.RelationshipTypes.Count > 0 &&
            !scope.RelationshipTypes.Contains("*") &&
            !scope.RelationshipTypes.Contains(relationship.RelationshipType))
        {
            return false;
        }

        if (scope.SourceSystems.Count == 0)
        {
            return true;
        }

        return relationship.EvidenceIds.Any(id =>
            sources.TryGetValue(id, out var source) && IsSourceInScope(source, scope));
    }

    private static bool IsSourceInScope(EvidenceSourceReference source, ImpactScope scope) =>
        scope.SourceSystems.Count == 0 ||
        scope.SourceSystems.Contains(source.SourceSystem) ||
        (source.Provider is not null && scope.SourceSystems.Contains(source.Provider));

    private static bool IsPathInScope(
        IReadOnlyList<string> relationshipIds,
        IReadOnlyDictionary<string, RelationshipEvidence> relationships,
        ImpactScope scope) =>
        (scope.MaxHops is null || relationshipIds.Count <= scope.MaxHops.Value) &&
        relationshipIds.Count > 0 &&
        relationshipIds.All(relationships.ContainsKey);

    private static void AddCandidate(
        ImpactClaim claim,
        IDictionary<string, ImpactClaim> candidates,
        IDictionary<string, string> errors)
    {
        if (candidates.TryGetValue(claim.ClaimId, out var existing))
        {
            if (!SameClaim(existing, claim))
            {
                candidates.Remove(claim.ClaimId);
                errors[claim.ClaimId] = "Conflicting claims share the same stable claim ID.";
            }

            return;
        }

        if (!errors.ContainsKey(claim.ClaimId))
        {
            candidates.Add(claim.ClaimId, claim);
        }
    }

    private static bool SameClaim(ImpactClaim left, ImpactClaim right) =>
        string.Equals(left.Statement, right.Statement, StringComparison.Ordinal) &&
        string.Equals(left.Rationale, right.Rationale, StringComparison.Ordinal) &&
        left.EntityIds.SequenceEqual(right.EntityIds, StringComparer.Ordinal) &&
        left.RelationshipIds.SequenceEqual(right.RelationshipIds, StringComparer.Ordinal) &&
        left.EvidenceIds.SequenceEqual(right.EvidenceIds, StringComparer.Ordinal) &&
        left.Confidence == right.Confidence;

    private static bool SamePath(ImpactPathEvidence left, ImpactPathEvidence right) =>
        left.PathId == right.PathId &&
        left.EntityIds.SequenceEqual(right.EntityIds, StringComparer.Ordinal) &&
        left.RelationshipIds.SequenceEqual(right.RelationshipIds, StringComparer.Ordinal) &&
        (left.Meanings ?? Array.Empty<string>()).SequenceEqual(
            right.Meanings ?? Array.Empty<string>(),
            StringComparer.Ordinal) &&
        left.ImpactEligible == right.ImpactEligible;

    private static bool SameChain(ImpactChainEvidence left, ImpactChainEvidence right) =>
        left.ChainId == right.ChainId &&
        left.SourceEntityId == right.SourceEntityId &&
        left.ImpactedEntityId == right.ImpactedEntityId &&
        left.RelationshipIds.SequenceEqual(right.RelationshipIds, StringComparer.Ordinal) &&
        left.SupportingEvidenceIds.SequenceEqual(right.SupportingEvidenceIds, StringComparer.Ordinal) &&
        left.CitationIds.SequenceEqual(right.CitationIds, StringComparer.Ordinal) &&
        left.EngineeringExplanation == right.EngineeringExplanation &&
        left.Confidence.Equals(right.Confidence) &&
        left.ImpactRationale == right.ImpactRationale &&
        left.Status == right.Status &&
        left.Strength == right.Strength;

    private static string RelationshipKey(RelationshipEvidence relationship) =>
        JsonSerializer.Serialize(relationship);

    private static int EstimatePackageMetadata(
        RuntimeRequestContext requestContext,
        string investigationId,
        ResolvedEntity subject) =>
        EstimateTokens(string.Join(
            "\n",
            requestContext.RequestId,
            requestContext.TraceId,
            investigationId,
            subject.System,
            subject.EntityType,
            subject.CanonicalId,
            subject.DisplayName));

    private static int EstimateClaim(ImpactClaim claim) =>
        EstimateTokens(string.Join(
            "\n",
            claim.ClaimId,
            claim.Statement,
            claim.Rationale,
            string.Join("\n", claim.EntityIds),
            string.Join("\n", claim.RelationshipIds),
            string.Join("\n", claim.EvidenceIds),
            claim.Confidence?.ToString("R", CultureInfo.InvariantCulture)));

    private static int EstimateSource(EvidenceSourceReference source) =>
        EstimateTokens(string.Join(
            "\n",
            source.EvidenceId,
            source.SourceType,
            source.SourceSystem,
            source.RecordId,
            source.Revision,
            source.Location,
            source.DeepLink,
            source.ProvenanceId,
            source.AuthorizationDecisionId,
            source.CitationId,
            source.Authority,
            source.Provider,
            source.ObservedAt?.ToString("O", CultureInfo.InvariantCulture)));

    private static int EstimateTokens(string value) =>
        Math.Max(1, (Encoding.UTF8.GetByteCount(value) + 3) / 4);

    private static string CreatePackageId(
        ContextCompilationInput input,
        IReadOnlyList<ImpactClaim> claims,
        IReadOnlyList<EvidenceSourceReference> sources)
    {
        var material = JsonSerializer.SerializeToUtf8Bytes(new
        {
            input.InvestigationId,
            input.RequestContext.RequestId,
            input.RequestContext.TraceId,
            input.Authorization.DecisionId,
            input.Evidence.SourceVersion,
            input.Evidence.OntologyVersion,
            input.Subject,
            input.Scope,
            Claims = claims,
            Sources = sources
        });
        var digest = SHA256.HashData(material);
        return $"context-{Convert.ToHexString(digest.AsSpan(0, 12)).ToLowerInvariant()}";
    }
}
