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
    private const string SchemaVersion = "context-v3";
    private const string CompilerVersion = "compiler-v3";
    private const string ReadImpactEvidenceGrant = "investigation:read-impact-evidence";

    public ContextCompilationResult Compile(ContextCompilationInput input)
    {
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(input.RequestContext);
        ArgumentNullException.ThrowIfNull(input.Scope);
        ArgumentNullException.ThrowIfNull(input.Authorization);
        ArgumentNullException.ThrowIfNull(input.Evidence);
        ArgumentNullException.ThrowIfNull(input.Budget);
        ArgumentException.ThrowIfNullOrWhiteSpace(input.InvestigationId);

        if (input.Budget.MaxEstimatedContextTokens < 0 ||
            input.Scope.MaxHops is < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(input), "The context-stage token budget and maximum hops cannot be negative.");
        }

        var evidence = input.Evidence;
        if (!string.Equals(input.InvestigationId, evidence.InvestigationId, StringComparison.Ordinal))
        {
            return Denied(input, "The requested investigation does not match the evidence investigation.", "INVESTIGATION_MISMATCH");
        }

        if (!string.Equals(input.Authorization.DecisionId, evidence.AuthorizationDecisionId, StringComparison.Ordinal))
        {
            return Denied(input, "The authorization decision does not match the evidence.", "AUTHORIZATION_MISMATCH");
        }

        if (!input.Authorization.Grants.Contains(ReadImpactEvidenceGrant))
        {
            return Denied(input, "The authorization decision does not grant impact-evidence access.", "AUTHORIZATION_DENIED");
        }

        if (!string.Equals(input.RequestContext.RequestId, evidence.RequestId, StringComparison.Ordinal) ||
            !string.Equals(input.RequestContext.TraceId, evidence.TraceId, StringComparison.Ordinal))
        {
            return Denied(input, "The evidence request or trace correlation does not match the request context.", "REQUEST_CORRELATION_MISMATCH");
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
                (input.Subject is not null &&
                 !string.Equals(path.EntityIds[0], input.Subject.CanonicalId, StringComparison.Ordinal)))
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
                (input.Subject is not null &&
                 !string.Equals(chain.SourceEntityId, input.Subject.CanonicalId, StringComparison.Ordinal)))
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

            acceptedClaims.Add(claim);
            selectedEvidenceIds.UnionWith(claim.EvidenceIds);
        }

        var packageSources = selectedEvidenceIds
            .Order(StringComparer.Ordinal)
            .Select(id => usableSources[id])
            .ToArray();
        var omittedFacts = new Dictionary<string, string>(StringComparer.Ordinal);
        var acceptedFacts = new List<EngineeringFactEvidence>();
        if (input.FactEvidence is { } factEvidence)
        {
            var resultBindingFailure = GetFactEvidenceResultBindingFailureReason(factEvidence, input);
            if (resultBindingFailure is not null)
            {
                foreach (var fact in factEvidence.Facts ?? Array.Empty<EngineeringFactEvidence>())
                {
                    OmitFact(fact?.FactId, $"Fact retrieval result was rejected: {resultBindingFailure}");
                }

                if (factEvidence.Facts is not { Count: > 0 })
                {
                    OmitFact(null, $"Fact retrieval result was rejected: {resultBindingFailure}");
                }
            }
            else if (factEvidence.Facts is null)
            {
                OmitFact(null, "Fact omitted because the retrieval result did not contain a fact list.");
            }
            else
            {
                var factsById = factEvidence.Facts
                    .Where(fact => !string.IsNullOrWhiteSpace(fact?.FactId))
                    .GroupBy(fact => fact.FactId, StringComparer.Ordinal);
                var uniqueFacts = new List<EngineeringFactEvidence>();
                foreach (var group in factsById)
                {
                    var sameIdFacts = group.ToArray();
                    if (sameIdFacts.Skip(1).Any(other => !SameEngineeringFact(sameIdFacts[0], other)))
                    {
                        foreach (var fact in sameIdFacts)
                        {
                            OmitFact(fact.FactId, "Fact omitted because its stable ID has conflicting values or provenance.");
                        }

                        continue;
                    }

                    uniqueFacts.Add(sameIdFacts[0]);
                }

                foreach (var fact in factEvidence.Facts.Where(fact => string.IsNullOrWhiteSpace(fact?.FactId)))
                {
                    OmitFact(null, "Fact omitted because its stable fact ID is missing.");
                }

                var validFacts = new List<EngineeringFactEvidence>();
                var approvedEntityIds = acceptedClaims
                    .SelectMany(claim => claim.EntityIds)
                    .ToHashSet(StringComparer.Ordinal);
                if (input.Subject is { } factSubject)
                {
                    approvedEntityIds.Add(factSubject.CanonicalId);
                }
                foreach (var fact in uniqueFacts)
                {
                    var factBindingFailure = GetFactBindingFailureReason(fact, factEvidence, input, approvedEntityIds);
                    if (factBindingFailure is not null)
                    {
                        OmitFact(fact.FactId, $"Fact was rejected: {factBindingFailure}");
                        continue;
                    }

                    validFacts.Add(fact);
                }

                foreach (var identityGroup in validFacts.GroupBy(FactIdentity, StringComparer.Ordinal))
                {
                    var identityFacts = identityGroup.ToArray();
                    if (identityFacts.Skip(1).Any(other => !SameFactValue(identityFacts[0], other)))
                    {
                        foreach (var fact in identityFacts)
                        {
                            OmitFact(fact.FactId, "Fact omitted because the same source field and scope have conflicting exact values.");
                        }
                    }
                }

                foreach (var fact in validFacts
                             .Where(fact => !omittedFacts.ContainsKey(fact.FactId))
                             .OrderBy(fact => fact.FactId, StringComparer.Ordinal))
                {
                    acceptedFacts.Add(fact);
                }
            }
        }

        var omittedParticipation = new Dictionary<string, string>(StringComparer.Ordinal);
        var acceptedParticipation = new List<ApplicationParticipationEvidence>();
        if (input.ApplicationContext is { } applicationContext)
        {
            if (!IsApplicationContextResultBoundToInput(applicationContext, input))
            {
                foreach (var participation in applicationContext.Participations ?? Array.Empty<ApplicationParticipationEvidence>())
                {
                    OmitParticipation(
                        participation?.CandidateId,
                        "Application participation omitted because its retrieval result binding did not match the current context.");
                }

                if (applicationContext.Participations is not { Count: > 0 })
                {
                    OmitParticipation(
                        null,
                        "Application participation omitted because its retrieval result binding did not match the current context.");
                }
            }
            else if (applicationContext.Participations is null)
            {
                OmitParticipation(null, "Application participation omitted because the retrieval result did not contain a participation list.");
            }
            else
            {
                var approvedEntityIds = acceptedClaims
                    .SelectMany(claim => claim.EntityIds)
                    .ToHashSet(StringComparer.Ordinal);
                if (input.Subject is { } applicationSubject)
                {
                    approvedEntityIds.Add(applicationSubject.CanonicalId);
                }
                var participationsById = applicationContext.Participations
                    .Where(participation => !string.IsNullOrWhiteSpace(participation?.CandidateId))
                    .GroupBy(participation => participation.CandidateId, StringComparer.Ordinal);
                var uniqueParticipations = new List<ApplicationParticipationEvidence>();
                foreach (var group in participationsById)
                {
                    var sameIdParticipations = group.ToArray();
                    if (sameIdParticipations.Skip(1).Any(other =>
                            !SameApplicationParticipation(sameIdParticipations[0], other)))
                    {
                        foreach (var participation in sameIdParticipations)
                        {
                            OmitParticipation(
                                participation.CandidateId,
                                "Application participation omitted because its stable ID has conflicting source context.");
                        }

                        continue;
                    }

                    uniqueParticipations.Add(sameIdParticipations[0]);
                }

                foreach (var participation in applicationContext.Participations
                             .Where(participation => string.IsNullOrWhiteSpace(participation?.CandidateId)))
                {
                    OmitParticipation(null, "Application participation omitted because its stable candidate ID is missing.");
                }

                foreach (var participation in uniqueParticipations
                             .Where(participation =>
                                 !omittedParticipation.ContainsKey(participation.CandidateId))
                             .OrderBy(participation => participation.CandidateId, StringComparer.Ordinal))
                {
                    if (!HasCompleteParticipationBinding(
                            participation,
                            applicationContext,
                            input,
                            approvedEntityIds))
                    {
                        OmitParticipation(
                            participation.CandidateId,
                            "Application participation omitted because its identity, source lineage, citation, or authorization binding is incomplete.");
                        continue;
                    }

                    acceptedParticipation.Add(participation);
                }
            }
        }

        var omittedPassages = new Dictionary<string, string>(StringComparer.Ordinal);
        var acceptedPassages = new List<SourceEvidencePassage>();
        if (input.SourceEvidence is { } sourceEvidence)
        {
            if (sourceEvidence.Passages is null)
            {
                OmitSourcePassage(
                    "source-evidence-result",
                    "Source evidence was omitted because the retrieval result did not contain a passage list.");
            }
            else if (!IsSourceEvidenceResultBoundToInput(sourceEvidence, input))
            {
                foreach (var passage in sourceEvidence.Passages)
                {
                    OmitSourcePassage(
                        passage?.PassageId,
                        "Source passage omitted because the retrieval result binding did not match the current context.");
                }

                if (sourceEvidence.Passages.Count == 0)
                {
                    OmitSourcePassage(
                        "source-evidence-result",
                        "Source evidence was omitted because the retrieval result binding did not match the current context.");
                }
            }
            else
            {
                var graphSourceIdentifiers = packageSources
                    .SelectMany(source => new[]
                    {
                        source.EvidenceId,
                        source.CitationId,
                        source.ProvenanceId,
                        source.RecordId
                    })
                    .Where(identifier => !string.IsNullOrWhiteSpace(identifier))
                    .ToHashSet(StringComparer.Ordinal);
                var identifiedPassages = new List<SourceEvidencePassage>();
                foreach (var passage in sourceEvidence.Passages)
                {
                    if (passage is null)
                    {
                        OmitSourcePassage(
                            "source-evidence-result",
                            "Source passage omitted because its source identity and provenance are incomplete.");
                    }
                    else if (string.IsNullOrWhiteSpace(passage.PassageId))
                    {
                        OmitSourcePassage(
                            "source-evidence-result",
                            "Source passage omitted because its stable passage ID is missing.");
                    }
                    else
                    {
                        identifiedPassages.Add(passage);
                    }
                }

                foreach (var passageGroup in identifiedPassages
                             .GroupBy(passage => passage.PassageId, StringComparer.Ordinal))
                {
                    var sameIdPassages = passageGroup.ToArray();
                    if (sameIdPassages.Skip(1).Any(other => !SamePassageContent(sameIdPassages[0], other)))
                    {
                        OmitSourcePassage(
                            sameIdPassages[0].PassageId,
                            "Source passage omitted because its stable ID has conflicting source content or provenance.");
                        continue;
                    }

                    if (graphSourceIdentifiers.Contains(sameIdPassages[0].PassageId))
                    {
                        OmitSourcePassage(
                            sameIdPassages[0].PassageId,
                            "Source passage omitted because its stable ID conflicts with an authoritative graph source ID.");
                        continue;
                    }

                    var passage = sameIdPassages.FirstOrDefault(candidate =>
                        HasCompleteSourcePassageProvenance(candidate) &&
                        double.IsFinite(candidate.RetrievalScore)) ?? sameIdPassages[0];
                    if (!IsSourcePassageBoundToInput(passage, sourceEvidence, input))
                    {
                        OmitSourcePassage(
                            passage.PassageId,
                            "Source passage omitted because its investigation, snapshot, or authorization binding does not match.");
                        continue;
                    }

                    if (!HasCompleteSourcePassageProvenance(passage))
                    {
                        OmitSourcePassage(
                            passage.PassageId,
                            "Source passage omitted because its source identity or provenance is incomplete.");
                        continue;
                    }

                    if (!double.IsFinite(passage.RetrievalScore))
                    {
                        OmitSourcePassage(
                            passage.PassageId,
                            "Source passage omitted because its retrieval score cannot be serialized.");
                        continue;
                    }

                    acceptedPassages.Add(passage);
                    if (sameIdPassages.Length > 1)
                    {
                        OmitSourcePassage(
                            passage.PassageId,
                            "Duplicate source passage omitted; an identical passage is already included.");
                    }
                }
            }
        }

        var sourceEvidenceDiagnostics = input.SourceEvidence is { } sourceEvidenceResult &&
            IsSourceEvidenceResultBoundToInput(sourceEvidenceResult, input)
                ? sourceEvidenceResult.Diagnostics
                : null;
        var omissions = omittedClaims
            .OrderBy(pair => pair.Key, StringComparer.Ordinal)
            .Select(pair => new ContextOmission(pair.Key, pair.Value))
            .Concat(omittedFacts
                .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => new ContextOmission(pair.Key, pair.Value)
                {
                    Kind = ContextOmissionKind.EngineeringFact
                }))
            .Concat(omittedParticipation
                .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => new ContextOmission(pair.Key, pair.Value)
                {
                    Kind = ContextOmissionKind.ApplicationParticipation
                }))
            .Concat(omittedPassages
                .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => new ContextOmission(pair.Key, pair.Value)
                {
                    Kind = ContextOmissionKind.SourceEvidencePassage
                }))
            .OrderBy(omission => omission.ClaimId, StringComparer.Ordinal)
            .ToArray();
        var package = new ContextPackage(
            input.RequestContext,
            input.InvestigationId,
            CreatePackageId(
                input,
                acceptedClaims,
                packageSources,
                acceptedFacts,
                acceptedParticipation,
                acceptedPassages,
                sourceEvidenceDiagnostics),
            SchemaVersion,
            CompilerVersion,
            input.Authorization.DecisionId,
            input.Subject,
            input.Scope,
            acceptedClaims,
            packageSources,
            omissions)
        {
            SourceEvidencePassages = Array.AsReadOnly(acceptedPassages.ToArray()),
            EngineeringFacts = Array.AsReadOnly(acceptedFacts.ToArray()),
            ApplicationParticipation = Array.AsReadOnly(acceptedParticipation.ToArray()),
            SourceEvidenceDiagnostics = sourceEvidenceDiagnostics
        };

        var plan = CreateApprovedPlan(package, input.Budget.MaxEstimatedContextTokens);
        package = plan.Ledger;
        var disposition = plan.OversizedCandidateIds.Count > 0
            ? CompilationDisposition.ContextWindowExceeded
            : acceptedClaims.Count > 0 ||
              acceptedFacts.Count > 0 ||
              acceptedParticipation.Count > 0 ||
              acceptedPassages.Count > 0
            ? CompilationDisposition.Ready
            : candidates.Count == 0 && omissions.Length == 0
                ? CompilationDisposition.Empty
                : CompilationDisposition.InsufficientEvidence;
        return new ContextCompilationResult(
            package,
            disposition,
            plan.OversizedCandidateIds
                .Select(candidateId => $"Candidate '{candidateId}' cannot fit in the configured model context window.")
                .ToArray())
        {
            ApprovedPlan = plan,
            CandidateDecisions = BuildCandidateDecisions(input, package)
        };

        void OmitSourcePassage(string? passageId, string reason)
        {
            var omissionId = string.IsNullOrWhiteSpace(passageId)
                ? "source-evidence-result"
                : passageId;
            omittedPassages.TryAdd(omissionId, reason);
        }

        void OmitFact(string? factId, string reason)
        {
            var omissionId = string.IsNullOrWhiteSpace(factId) ? "engineering-fact-result" : factId;
            omittedFacts.TryAdd(omissionId, reason);
        }

        void OmitParticipation(string? candidateId, string reason)
        {
            var omissionId = string.IsNullOrWhiteSpace(candidateId)
                ? "application-participation-result"
                : candidateId;
            omittedParticipation.TryAdd(omissionId, reason);
        }
    }

    private static ContextCompilationResult Denied(
        ContextCompilationInput input,
        string diagnostic,
        string reasonCode)
    {
        var emptyPackage = new ContextPackage(
            input.RequestContext,
            input.InvestigationId,
            "denied",
            SchemaVersion,
            CompilerVersion,
            input.Authorization.DecisionId,
            input.Subject,
            input.Scope,
            [],
            [],
            []);
        return new ContextCompilationResult(null, CompilationDisposition.Denied, [diagnostic])
        {
            CandidateDecisions = BuildCandidateDecisions(input, emptyPackage, diagnostic, reasonCode)
        };
    }

    private static IReadOnlyList<ContextCandidateDecision> BuildCandidateDecisions(
        ContextCompilationInput input,
        ContextPackage package,
        string? globalRejectionReason = null,
        string? globalRejectionCode = null)
    {
        var decisions = new List<ContextCandidateDecision>();
        var sourceGroups = input.Evidence.Sources
            .Where(source => !string.IsNullOrWhiteSpace(source.EvidenceId))
            .GroupBy(source => source.EvidenceId, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);

        void Add(
            string candidateType,
            string candidateId,
            string? sourceApplication,
            string? authority,
            string? freshness,
            IReadOnlyList<string> citationIds,
            IReadOnlyList<string> evidenceIds,
            string? provenance,
            bool approved,
            ContextOmissionKind? omissionKind = null,
            string? omissionId = null,
            string? fallbackReason = null,
            string? fallbackReasonCode = null)
        {
            var omission = package.Omissions.FirstOrDefault(item =>
                (omissionKind is null || item.Kind == omissionKind) &&
                string.Equals(item.ClaimId, omissionId ?? candidateId, StringComparison.Ordinal));
            var reason = approved
                ? null
                : omission?.Reason ?? globalRejectionReason ?? fallbackReason ??
                    "The compiler did not record a candidate-specific rejection reason.";
            var reasonCode = approved
                ? null
                : omission is not null
                    ? "COMPILER_REJECTION"
                    : globalRejectionCode ?? fallbackReasonCode ?? "NO_COMPILER_OMISSION_RECORDED";
            decisions.Add(new ContextCandidateDecision(
                candidateType,
                candidateId,
                sourceApplication,
                authority,
                freshness,
                citationIds,
                evidenceIds,
                provenance,
                approved,
                reasonCode,
                reason));
        }

        foreach (var relationship in input.Evidence.Relationships)
        {
            var claimId = $"relationship:{relationship.RelationshipId}";
            var sources = input.Evidence.Sources
                .Where(source => relationship.EvidenceIds.Contains(source.EvidenceId, StringComparer.Ordinal))
                .ToArray();
            Add(
                "Graph",
                claimId,
                JoinDistinct(sources.Select(source => source.SourceSystem)),
                JoinDistinct(sources.Select(source => source.Authority)),
                null,
                relationship.CitationIds ?? Array.Empty<string>(),
                relationship.EvidenceIds,
                JoinDistinct(sources.Select(source => source.ProvenanceId)),
                package.Claims.Any(claim => string.Equals(claim.ClaimId, claimId, StringComparison.Ordinal)),
                omissionId: claimId);
        }

        foreach (var path in input.Evidence.Paths)
        {
            var claimId = $"path:{path.PathId}";
            var pathEvidenceIds = input.Evidence.Relationships
                .Where(relationship => path.RelationshipIds.Contains(relationship.RelationshipId, StringComparer.Ordinal))
                .SelectMany(relationship => relationship.EvidenceIds)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            var sources = input.Evidence.Sources
                .Where(source => pathEvidenceIds.Contains(source.EvidenceId, StringComparer.Ordinal))
                .ToArray();
            Add(
                "Graph",
                claimId,
                JoinDistinct(sources.Select(source => source.SourceSystem)),
                JoinDistinct(sources.Select(source => source.Authority)),
                null,
                path.CitationIds ?? Array.Empty<string>(),
                pathEvidenceIds,
                JoinDistinct(sources.Select(source => source.ProvenanceId)),
                package.Claims.Any(claim => string.Equals(claim.ClaimId, claimId, StringComparison.Ordinal)),
                omissionId: claimId);
        }

        foreach (var chain in input.Evidence.Chains)
        {
            var sources = input.Evidence.Sources
                .Where(source => chain.SupportingEvidenceIds.Contains(source.EvidenceId, StringComparer.Ordinal))
                .ToArray();
            Add(
                "Graph",
                chain.ChainId,
                JoinDistinct(sources.Select(source => source.SourceSystem)),
                JoinDistinct(sources.Select(source => source.Authority)),
                null,
                chain.CitationIds,
                chain.SupportingEvidenceIds,
                JoinDistinct(sources.Select(source => source.ProvenanceId)),
                package.Claims.Any(claim => string.Equals(claim.ClaimId, chain.ChainId, StringComparison.Ordinal)),
                omissionId: chain.ChainId);
        }

        foreach (var source in input.Evidence.Sources)
        {
            var approved = package.Sources.Any(candidate =>
                string.Equals(candidate.EvidenceId, source.EvidenceId, StringComparison.Ordinal));
            string? fallbackReason = null;
            string? fallbackReasonCode = null;
            if (!approved)
            {
                if (!sourceGroups.TryGetValue(source.EvidenceId, out var group) ||
                    group.Any(candidate => !HasCompleteProvenance(candidate, input.Authorization.DecisionId)))
                {
                    fallbackReason = "The source record lacks complete provenance or current authorization binding.";
                    fallbackReasonCode = "NO_PROVENANCE";
                }
                else if (group.Skip(1).Any(candidate => !SameSource(group[0], candidate)))
                {
                    fallbackReason = "Conflicting source records share this evidence ID.";
                    fallbackReasonCode = "DUPLICATE_CANDIDATE";
                }
                else if (!IsSourceInScope(source, input.Scope))
                {
                    fallbackReason = "The source record is outside the requested source scope.";
                    fallbackReasonCode = "OUT_OF_SCOPE";
                }
                else
                {
                    fallbackReason = "No approved graph claim references this source record.";
                    fallbackReasonCode = "NOT_REFERENCED_BY_APPROVED_CLAIM";
                }
            }

            Add(
                "Source",
                source.EvidenceId,
                source.SourceSystem,
                source.Authority,
                source.ObservedAt?.ToString("O"),
                source.CitationId is null ? Array.Empty<string>() : [source.CitationId],
                [source.EvidenceId],
                source.ProvenanceId,
                approved,
                fallbackReason: fallbackReason,
                fallbackReasonCode: fallbackReasonCode);
        }

        foreach (var fact in input.FactEvidence?.Facts ?? Array.Empty<EngineeringFactEvidence>())
        {
            Add(
                "Fact",
                fact.FactId,
                fact.SourceApplication,
                fact.SourceAuthority.ToString(),
                fact.Freshness.ToString(),
                fact.CitationIds,
                fact.EvidenceIds,
                FormatProvenance(fact.Provenance),
                package.EngineeringFacts.Any(candidate =>
                    string.Equals(candidate.FactId, fact.FactId, StringComparison.Ordinal)),
                ContextOmissionKind.EngineeringFact);
        }

        foreach (var participation in input.ApplicationContext?.Participations ?? Array.Empty<ApplicationParticipationEvidence>())
        {
            Add(
                "Digest",
                participation.CandidateId,
                participation.SourceApplication,
                participation.SourceAuthority.ToString(),
                null,
                participation.CitationIds,
                participation.EvidenceIds,
                FormatProvenance(participation.Provenance),
                package.ApplicationParticipation.Any(candidate =>
                    string.Equals(candidate.CandidateId, participation.CandidateId, StringComparison.Ordinal)),
                ContextOmissionKind.ApplicationParticipation);
        }

        foreach (var passage in input.SourceEvidence?.Passages ?? Array.Empty<SourceEvidencePassage>())
        {
            Add(
                "Evidence",
                passage.PassageId,
                passage.SourceApplication,
                null,
                passage.Freshness,
                passage.CitationIds,
                passage.EvidenceIds,
                passage.ProvenanceId,
                package.SourceEvidencePassages.Any(candidate =>
                    string.Equals(candidate.PassageId, passage.PassageId, StringComparison.Ordinal)),
                ContextOmissionKind.SourceEvidencePassage);
        }

        return decisions;

        static string? JoinDistinct(IEnumerable<string?> values)
        {
            var distinctValues = values
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            return distinctValues.Length == 0 ? null : string.Join(",", distinctValues);
        }

        static string FormatProvenance(EngineeringFactProvenance provenance) =>
            string.Join(
                ";",
                new[]
                {
                    $"provider={provenance.Provider}",
                    $"source={provenance.Source}",
                    $"nativeId={provenance.NativeId}",
                    $"nativeRevision={provenance.NativeRevision}",
                    $"executionId={provenance.SourceExecutionId}",
                    $"artifact={provenance.ArtifactReference}",
                    $"authority={provenance.Authority}"
                }.Where(value => !value.EndsWith("=", StringComparison.Ordinal)));
    }

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

    private static bool IsSourceEvidenceResultBoundToInput(
        SourceEvidenceRetrievalResult result,
        ContextCompilationInput input) =>
        !string.IsNullOrWhiteSpace(result.InvestigationId) &&
        string.Equals(result.InvestigationId, input.InvestigationId, StringComparison.Ordinal) &&
        result.SnapshotRevision >= 0 &&
        !string.IsNullOrWhiteSpace(result.SourceVersion) &&
        !string.IsNullOrWhiteSpace(result.AuthorizationDecisionId) &&
        string.Equals(result.AuthorizationDecisionId, input.Authorization.DecisionId, StringComparison.Ordinal) &&
        string.Equals(result.RequestId, input.RequestContext.RequestId, StringComparison.Ordinal) &&
        string.Equals(result.TraceId, input.RequestContext.TraceId, StringComparison.Ordinal);

    private static string? GetFactEvidenceResultBindingFailureReason(
        FactEvidenceRetrievalResult result,
        ContextCompilationInput input)
    {
        if (string.IsNullOrWhiteSpace(result.InvestigationId) ||
            !string.Equals(result.InvestigationId, input.InvestigationId, StringComparison.Ordinal))
            return "investigation ID does not match the active investigation";
        if (result.SnapshotRevision < 0)
            return "snapshot revision is missing or invalid";
        if (string.IsNullOrWhiteSpace(result.SourceVersion) ||
            !string.Equals(result.SourceVersion, input.Evidence.SourceVersion, StringComparison.Ordinal))
            return "source version does not match the graph retrieval result";
        if (string.IsNullOrWhiteSpace(result.OntologyVersion) ||
            !string.Equals(result.OntologyVersion, input.Evidence.OntologyVersion, StringComparison.Ordinal))
            return "ontology version does not match the graph retrieval result";
        if (!string.Equals(result.AuthorizationDecisionId, input.Authorization.DecisionId, StringComparison.Ordinal))
            return "authorization decision does not match the active decision";
        if (!string.Equals(result.RequestId, input.RequestContext.RequestId, StringComparison.Ordinal))
            return "request ID does not match the active request";
        if (!string.Equals(result.TraceId, input.RequestContext.TraceId, StringComparison.Ordinal))
            return "trace ID does not match the active trace";
        return null;
    }

    private static bool IsApplicationContextResultBoundToInput(
        ApplicationContextRetrievalResult result,
        ContextCompilationInput input) =>
        !string.IsNullOrWhiteSpace(result.InvestigationId) &&
        string.Equals(result.InvestigationId, input.InvestigationId, StringComparison.Ordinal) &&
        result.SnapshotRevision >= 0 &&
        !string.IsNullOrWhiteSpace(result.SourceVersion) &&
        string.Equals(result.SourceVersion, input.Evidence.SourceVersion, StringComparison.Ordinal) &&
        !string.IsNullOrWhiteSpace(result.OntologyVersion) &&
        string.Equals(result.OntologyVersion, input.Evidence.OntologyVersion, StringComparison.Ordinal) &&
        string.Equals(result.AuthorizationDecisionId, input.Authorization.DecisionId, StringComparison.Ordinal) &&
        string.Equals(result.RequestId, input.RequestContext.RequestId, StringComparison.Ordinal) &&
        string.Equals(result.TraceId, input.RequestContext.TraceId, StringComparison.Ordinal);

    private static string? GetFactBindingFailureReason(
        EngineeringFactEvidence fact,
        FactEvidenceRetrievalResult result,
        ContextCompilationInput input,
        IReadOnlySet<string> approvedEntityIds)
    {
        if (!string.Equals(fact.ContractVersion, "1.0", StringComparison.Ordinal))
            return "contract version is unsupported";
        if (string.IsNullOrWhiteSpace(fact.FactId))
            return "stable fact ID is missing";
        if (!string.Equals(fact.InvestigationId, input.InvestigationId, StringComparison.Ordinal))
            return "investigation ID does not match the active investigation";
        if (fact.SnapshotRevision != result.SnapshotRevision ||
            (fact.InvestigationRevision is not null && fact.InvestigationRevision != result.SnapshotRevision))
            return "snapshot revision does not match the fact retrieval result";
        if (fact.SubjectId is not { Length: > 0 } subjectId ||
            (!approvedEntityIds.Contains(subjectId) &&
             !(result.AuthoritativeEntityIds ?? Array.Empty<string>())
                 .Contains(fact.SourceEntityId, StringComparer.Ordinal)))
            return "subject entity is not part of the approved context or authoritative retrieval result";
        if (string.IsNullOrWhiteSpace(fact.SourceApplication))
            return "source application is missing";
        if (string.IsNullOrWhiteSpace(fact.SourceEntityId))
            return "source entity ID is missing";
        if (string.IsNullOrWhiteSpace(fact.CanonicalEntityKind))
            return "canonical entity kind is missing";
        if (string.IsNullOrWhiteSpace(fact.FieldId))
            return "source field ID is missing";
        if (string.IsNullOrWhiteSpace(fact.SourceFieldName))
            return "source field name is missing";
        if (fact.ExactSourceValue.ValueKind == JsonValueKind.Undefined)
            return "exact source value is missing";
        if (!string.Equals(fact.AuthorizationDecisionId, input.Authorization.DecisionId, StringComparison.Ordinal))
            return "authorization decision does not match the active decision";
        if (fact.EvidenceIds is not { Count: > 0 } ||
            fact.EvidenceIds.Any(string.IsNullOrWhiteSpace))
            return "evidence IDs are missing or invalid";
        if (!fact.CitationEligible)
            return "citation eligibility is false";
        if (fact.CitationIds is not { Count: > 0 } ||
            fact.CitationIds.Any(string.IsNullOrWhiteSpace))
            return "citation IDs are missing or invalid";
        if (!HasCompleteFactProvenance(fact))
            return "source provenance is missing or inconsistent with the fact";
        return null;
    }

    private static bool HasCompleteFactProvenance(EngineeringFactEvidence fact) =>
        fact.Provenance is not null &&
        !string.IsNullOrWhiteSpace(fact.Provenance.Source) &&
        string.Equals(fact.Provenance.Source, fact.SourceApplication, StringComparison.OrdinalIgnoreCase) &&
        !string.IsNullOrWhiteSpace(fact.Provenance.Provider) &&
        !string.IsNullOrWhiteSpace(fact.Provenance.NativeId) &&
        fact.Provenance.Authority == fact.SourceAuthority;

    private static bool HasCompleteParticipationBinding(
        ApplicationParticipationEvidence participation,
        ApplicationContextRetrievalResult result,
        ContextCompilationInput input,
        IReadOnlySet<string> approvedEntityIds) =>
        string.Equals(participation.ContractVersion, "1.0", StringComparison.Ordinal) &&
        !string.IsNullOrWhiteSpace(participation.CandidateId) &&
        string.Equals(participation.InvestigationId, input.InvestigationId, StringComparison.Ordinal) &&
        participation.SnapshotRevision == result.SnapshotRevision &&
        !string.IsNullOrWhiteSpace(participation.SourceApplication) &&
        !string.IsNullOrWhiteSpace(participation.SourceOperation) &&
        Enum.IsDefined(participation.SourceOperationStatus) &&
        participation.CanonicalEntityIds is { Count: > 0 } &&
        participation.CanonicalEntityIds.All(entityId =>
            !string.IsNullOrWhiteSpace(entityId) &&
            (approvedEntityIds.Contains(entityId) ||
             (result.AuthoritativeEntityIds ?? Array.Empty<string>())
                 .Contains(entityId, StringComparer.Ordinal))) &&
        participation.EvidenceIds is { Count: > 0 } &&
        participation.EvidenceIds.All(evidenceId => !string.IsNullOrWhiteSpace(evidenceId)) &&
        participation.CitationIds is { Count: > 0 } &&
        participation.CitationIds.All(citationId => !string.IsNullOrWhiteSpace(citationId)) &&
        string.Equals(
            participation.AuthorizationDecisionId,
            input.Authorization.DecisionId,
            StringComparison.Ordinal) &&
        HasCompleteParticipationProvenance(participation);

    private static bool HasCompleteParticipationProvenance(ApplicationParticipationEvidence participation) =>
        participation.Provenance is not null &&
        !string.IsNullOrWhiteSpace(participation.Provenance.Source) &&
        string.Equals(
            participation.Provenance.Source,
            participation.SourceApplication,
            StringComparison.OrdinalIgnoreCase) &&
        !string.IsNullOrWhiteSpace(participation.Provenance.Provider) &&
        !string.IsNullOrWhiteSpace(participation.Provenance.NativeId) &&
        participation.Provenance.Authority == participation.SourceAuthority;

    private static bool SameEngineeringFact(
        EngineeringFactEvidence left,
        EngineeringFactEvidence right) =>
        string.Equals(JsonSerializer.Serialize(left), JsonSerializer.Serialize(right), StringComparison.Ordinal);

    private static string FactIdentity(EngineeringFactEvidence fact) =>
        JsonSerializer.Serialize(new
        {
            fact.SourceApplication,
            fact.SourceEntityId,
            fact.SourceNativeId,
            fact.CanonicalEntityKind,
            fact.FieldId,
            Dimensions = fact.Dimensions
                .OrderBy(dimension => dimension.DimensionId, StringComparer.Ordinal),
            fact.ObservedAt,
            fact.EffectiveAt,
            fact.ValidFrom,
            fact.ValidTo,
            fact.Provenance.NativeRevision
        });

    private static bool SameFactValue(EngineeringFactEvidence left, EngineeringFactEvidence right) =>
        JsonElement.DeepEquals(left.ExactSourceValue, right.ExactSourceValue) &&
        left.SourceValueType == right.SourceValueType &&
        left.ValueType == right.ValueType &&
        NullableJsonElementDeepEquals(left.NormalizedValue, right.NormalizedValue) &&
        left.NormalizedValueType == right.NormalizedValueType &&
        string.Equals(left.Unit, right.Unit, StringComparison.Ordinal) &&
        string.Equals(left.Currency, right.Currency, StringComparison.Ordinal) &&
        left.Precision == right.Precision &&
        left.SourceAuthority == right.SourceAuthority &&
        left.Freshness == right.Freshness &&
        left.Completeness == right.Completeness &&
        left.DerivationStatus == right.DerivationStatus &&
        string.Equals(left.DerivationRuleId, right.DerivationRuleId, StringComparison.Ordinal) &&
        left.TransformationTrace.SequenceEqual(right.TransformationTrace);

    private static bool NullableJsonElementDeepEquals(JsonElement? left, JsonElement? right) =>
        left is null && right is null ||
        left is { } leftValue && right is { } rightValue &&
        JsonElement.DeepEquals(leftValue, rightValue);

    private static bool SameApplicationParticipation(
        ApplicationParticipationEvidence left,
        ApplicationParticipationEvidence right) =>
        string.Equals(JsonSerializer.Serialize(left), JsonSerializer.Serialize(right), StringComparison.Ordinal);

    private static ApprovedContextPlan CreateApprovedPlan(ContextPackage ledger, int maxEstimatedContextTokens)
    {
        var candidates = ledger.Claims
            .OrderBy(claim => claim.ClaimId, StringComparer.Ordinal)
            .Select(claim => new StageItem($"claim:{claim.ClaimId}", Claim: claim))
            .Concat(ledger.EngineeringFacts
                .OrderBy(fact => fact.FactId, StringComparer.Ordinal)
                .Select(fact => new StageItem($"fact:{fact.FactId}", Fact: fact)))
            .Concat(ledger.ApplicationParticipation
                .OrderBy(participation => participation.CandidateId, StringComparer.Ordinal)
                .Select(participation => new StageItem(
                    $"application:{participation.CandidateId}",
                    Participation: participation)))
            .Concat(ledger.SourceEvidencePassages
                .OrderBy(passage => passage.PassageId, StringComparer.Ordinal)
                .Select(passage => new StageItem($"passage:{passage.PassageId}", Passage: passage)))
            .ToArray();
        var items = new List<StageItem>(candidates.Length);
        foreach (var candidate in candidates)
        {
            if (candidate.Passage is { } passage &&
                EstimateContextPackage(CreateStagePackage(ledger, [candidate], 1)) > maxEstimatedContextTokens)
            {
                items.AddRange(SplitOversizedPassage(passage, ledger, maxEstimatedContextTokens));
            }
            else
            {
                items.Add(candidate);
            }
        }

        var stages = new List<ContextStage>();
        var oversizedCandidateIds = new List<string>();
        var current = new List<StageItem>();
        foreach (var item in items)
        {
            var candidateStage = current.Append(item).ToArray();
            var candidatePackage = CreateStagePackage(ledger, candidateStage, stages.Count + 1);
            var candidateTokens = EstimateContextPackage(candidatePackage);
            if (candidateTokens <= maxEstimatedContextTokens)
            {
                current.Add(item);
                continue;
            }

            if (current.Count > 0)
            {
                AddStage(current);
                current.Clear();
            }

            var singlePackage = CreateStagePackage(ledger, [item], stages.Count + 1);
            var singleTokens = EstimateContextPackage(singlePackage);
            if (singleTokens > maxEstimatedContextTokens)
            {
                oversizedCandidateIds.Add(item.CandidateId);
                continue;
            }

            current.Add(item);
        }

        if (current.Count > 0)
        {
            AddStage(current);
        }

        var approvedLedger = ledger with
        {
            SourceEvidencePassages = Array.AsReadOnly(items
                .Where(item => item.Passage is not null)
                .Select(item => item.Passage!)
                .ToArray())
        };
        return new ApprovedContextPlan(
            approvedLedger,
            Array.AsReadOnly(stages.ToArray()),
            Array.AsReadOnly(oversizedCandidateIds.ToArray()));

        void AddStage(IReadOnlyList<StageItem> stageItems)
        {
            var sequence = stages.Count + 1;
            var stagePackage = CreateStagePackage(ledger, stageItems, sequence);
            stages.Add(new ContextStage(
                sequence,
                Array.AsReadOnly(stageItems.Select(stageItem => stageItem.CandidateId).ToArray()),
                stagePackage,
                EstimateContextPackage(stagePackage)));
        }
    }

    private static ContextPackage CreateStagePackage(
        ContextPackage ledger,
        IReadOnlyList<StageItem> items,
        int sequence)
    {
        var evidenceIds = items
            .SelectMany(item => item.Claim?.EvidenceIds ?? item.Fact?.EvidenceIds ??
                item.Participation?.EvidenceIds ?? item.Passage?.EvidenceIds ?? Array.Empty<string>())
            .ToHashSet(StringComparer.Ordinal);
        return ledger with
        {
            PackageId = $"{ledger.PackageId}:stage:{sequence}",
            Claims = Array.AsReadOnly(items.Where(item => item.Claim is not null).Select(item => item.Claim!).ToArray()),
            Sources = Array.AsReadOnly(ledger.Sources
                .Where(source => evidenceIds.Contains(source.EvidenceId))
                .ToArray()),
            Omissions = Array.Empty<ContextOmission>(),
            EngineeringFacts = Array.AsReadOnly(items.Where(item => item.Fact is not null).Select(item => item.Fact!).ToArray()),
            ApplicationParticipation = Array.AsReadOnly(items
                .Where(item => item.Participation is not null)
                .Select(item => item.Participation!)
                .ToArray()),
            SourceEvidencePassages = Array.AsReadOnly(items
                .Where(item => item.Passage is not null)
                .Select(item => item.Passage!)
                .ToArray())
        };
    }

    private static IReadOnlyList<StageItem> SplitOversizedPassage(
        SourceEvidencePassage passage,
        ContextPackage ledger,
        int maxEstimatedContextTokens)
    {
        var pending = new Stack<string>();
        var chunks = new List<string>();
        pending.Push(passage.Text);
        while (pending.TryPop(out var text))
        {
            var conservativeId = $"{passage.PassageId}:segment:{int.MaxValue}";
            var candidatePassage = passage with
            {
                PassageId = conservativeId,
                Text = text,
                SegmentIndex = int.MaxValue,
                SegmentCount = int.MaxValue
            };
            var candidate = new StageItem($"passage:{candidatePassage.PassageId}", Passage: candidatePassage);
            if (EstimateContextPackage(CreateStagePackage(ledger, [candidate], 1)) <= maxEstimatedContextTokens)
            {
                chunks.Add(text);
                continue;
            }

            var splitIndex = text.Length / 2;
            if (splitIndex == 0)
            {
                chunks.Add(text);
                continue;
            }

            if (char.IsHighSurrogate(text[splitIndex - 1]) &&
                char.IsLowSurrogate(text[splitIndex]))
            {
                splitIndex++;
            }

            pending.Push(text[splitIndex..]);
            pending.Push(text[..splitIndex]);
        }

        if (chunks.Count == 1 && string.Equals(chunks[0], passage.Text, StringComparison.Ordinal))
        {
            return [new StageItem($"passage:{passage.PassageId}", Passage: passage)];
        }

        var segmentCount = chunks.Count;
        return chunks.Select((text, index) =>
        {
            var segmentIndex = index + 1;
            var segment = passage with
            {
                PassageId = $"{passage.PassageId}:segment:{segmentIndex}",
                Text = text,
                SegmentIndex = segmentIndex,
                SegmentCount = segmentCount
            };
            return new StageItem($"passage:{segment.PassageId}", Passage: segment);
        }).ToArray();
    }

    private static int EstimateContextPackage(ContextPackage package) =>
        EstimateTokens(JsonSerializer.Serialize(package));

    private static bool IsSourcePassageBoundToInput(
        SourceEvidencePassage passage,
        SourceEvidenceRetrievalResult result,
        ContextCompilationInput input) =>
        string.Equals(passage.InvestigationId, input.InvestigationId, StringComparison.Ordinal) &&
        passage.SnapshotRevision == result.SnapshotRevision &&
        string.Equals(passage.AuthorizationDecisionId, input.Authorization.DecisionId, StringComparison.Ordinal) &&
        string.Equals(passage.AuthorizationDecisionId, result.AuthorizationDecisionId, StringComparison.Ordinal);

    private static bool HasCompleteSourcePassageProvenance(SourceEvidencePassage passage) =>
        !string.IsNullOrWhiteSpace(passage.PassageId) &&
        !string.IsNullOrWhiteSpace(passage.ParentRecordId) &&
        !string.IsNullOrWhiteSpace(passage.InvestigationId) &&
        !string.IsNullOrWhiteSpace(passage.SourceApplication) &&
        !string.IsNullOrWhiteSpace(passage.SourceRecordId) &&
        !string.IsNullOrWhiteSpace(passage.Location) &&
        !string.IsNullOrWhiteSpace(passage.Text) &&
        passage.CanonicalEntityIds is { Count: > 0 } &&
        passage.CanonicalEntityIds.All(entityId => !string.IsNullOrWhiteSpace(entityId)) &&
        passage.EvidenceIds is { Count: > 0 } &&
        passage.EvidenceIds.All(evidenceId => !string.IsNullOrWhiteSpace(evidenceId)) &&
        !string.IsNullOrWhiteSpace(passage.ProvenanceId) &&
        !string.IsNullOrWhiteSpace(passage.AuthorizationDecisionId) &&
        !string.IsNullOrWhiteSpace(passage.RetrievalMethod);

    private static bool SamePassageContent(SourceEvidencePassage left, SourceEvidencePassage right) =>
        string.Equals(
            CreatePassageContentKey(left),
            CreatePassageContentKey(right),
            StringComparison.Ordinal);

    private static string CreatePassageContentKey(SourceEvidencePassage passage) =>
        JsonSerializer.Serialize(new
        {
            passage.ParentRecordId,
            passage.InvestigationId,
            passage.SnapshotRevision,
            passage.SourceApplication,
            passage.SourceRecordId,
            CanonicalEntityIds = passage.CanonicalEntityIds?
                .Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal),
            passage.SourceRevision,
            passage.Location,
            passage.DeepLink,
            passage.Text,
            EvidenceIds = passage.EvidenceIds?
                .Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal),
            passage.ProvenanceId,
            passage.AuthorizationDecisionId,
            passage.Freshness,
            passage.SourceFieldName,
            CitationIds = passage.CitationIds?
                .Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal),
            passage.SourceTimestamp,
            passage.CapturedAt,
            passage.EffectiveAt,
            passage.ValidFrom,
            passage.ValidTo,
            passage.SnapshotLifecycle,
            passage.SnapshotCompleteness,
            passage.SegmentIndex,
            passage.SegmentCount,
            SourceExtractionStatuses = passage.SourceExtractionStatuses?
                .Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal),
            SourceOperations = passage.SourceOperations
                .OrderBy(operation => operation.Operation, StringComparer.Ordinal)
                .ThenBy(operation => operation.Status, StringComparer.Ordinal)
        });

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

    // UTF-8 bytes divided by four is a heuristic estimate, not tokenizer output.
    private static int EstimateTokens(string value) =>
        Math.Max(1, (Encoding.UTF8.GetByteCount(value) + 3) / 4);

    private sealed record StageItem(
        string CandidateId,
        ImpactClaim? Claim = null,
        EngineeringFactEvidence? Fact = null,
        ApplicationParticipationEvidence? Participation = null,
        SourceEvidencePassage? Passage = null);

    private static string CreatePackageId(
        ContextCompilationInput input,
        IReadOnlyList<ImpactClaim> claims,
        IReadOnlyList<EvidenceSourceReference> sources,
        IReadOnlyList<EngineeringFactEvidence> engineeringFacts,
        IReadOnlyList<ApplicationParticipationEvidence> applicationParticipation,
        IReadOnlyList<SourceEvidencePassage> sourceEvidencePassages,
        SourceEvidenceRetrievalDiagnostics? sourceEvidenceDiagnostics)
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
            Sources = sources,
            EngineeringFacts = engineeringFacts,
            ApplicationParticipation = applicationParticipation,
            SourceEvidencePassages = sourceEvidencePassages,
            SourceEvidenceDiagnostics = sourceEvidenceDiagnostics
        });
        var digest = SHA256.HashData(material);
        return $"context-{Convert.ToHexString(digest.AsSpan(0, 12)).ToLowerInvariant()}";
    }
}
