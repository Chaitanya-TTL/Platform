using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.Validation;

namespace Lattice.AI.Runtime.Tests.Validation;

public sealed class AnswerValidatorTests
{
    [Fact]
    public void Validate_AcceptsMoreThanTwentyFiveClaimsWhenEachIsSupported()
    {
        var claims = Enumerable.Range(1, 30)
            .Select(index => new ImpactClaim(
                $"claim-{index}",
                $"R-123 affects P-{index}.",
                ["R-123", $"P-{index}"],
                [$"relationship-{index}"],
                [$"evidence-{index}"],
                null))
            .ToArray();
        var context = Context() with
        {
            Claims = claims,
            Sources = Enumerable.Range(1, 30)
                .Select(index => Source($"evidence-{index}", $"citation-{index}"))
                .ToArray()
        };
        var candidate = new AnswerCandidate(
            "The supported relationships affect 30 parts.",
            claims.Select((claim, index) => new AnswerImpact(
                claim.ClaimId,
                claim.Statement,
                claim.EvidenceIds,
                [$"citation-{index + 1}"]))
                .ToArray(),
            []);

        var result = Validate(candidate, context, Authorization(), RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
        Assert.Equal(30, result.AssertionOutcomes.Count);
        Assert.All(result.AssertionOutcomes, assertion => Assert.True(assertion.Supported));
    }

    [Fact]
    public void Validate_AcceptsClaimsAndSourcesPresentInAuthorizedContext()
    {
        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-1"]),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
        var assertion = Assert.Single(result.AssertionOutcomes);
        Assert.Equal("impact", assertion.AssertionType);
        Assert.Equal("claim-1", assertion.AssertionId);
        Assert.True(assertion.Supported);
        Assert.Equal(["evidence-1"], assertion.EvidenceIds);
        Assert.Equal(["citation-1"], assertion.CitationIds);
        Assert.Empty(assertion.IssueCodes);
    }

    [Fact]
    public void Validate_RejectsUnknownClaimIds()
    {
        var result = Validate(
            Candidate("unknown-claim", ["evidence-1"], ["citation-1"]),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unknown-claim");
        var assertion = Assert.Single(result.AssertionOutcomes);
        Assert.False(assertion.Supported);
        Assert.Contains("unknown-claim", assertion.IssueCodes);
    }

    [Fact]
    public void Validate_RejectsEvidenceNotAttachedToClaim()
    {
        var result = Validate(
            Candidate("claim-1", ["unknown-evidence"], ["citation-1"]),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unknown-evidence");
    }

    [Fact]
    public void Validate_RejectsSourceIdsNotAttachedToCitedEvidence()
    {
        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["unknown-source"]),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unknown-source");
    }

    [Fact]
    public void Validate_AcceptsACompiledSourcePassageCitationAlongsideGraphEvidence()
    {
        var context = Context() with
        {
            SourceEvidencePassages = [SourcePassage()]
        };

        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-1", "SYNTH-PASSAGE-001"]),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Validate_AcceptsExactFactAssertionsCitingOnlyTheirCompiledFactSources()
    {
        var fact = Fact();
        var context = Context() with { EngineeringFacts = [fact] };
        var answer = new AnswerCandidate("The part weighs 2.5 kg.", [], [])
        {
            Facts =
            [
                new AnswerFactAssertion(
                    fact.FactId,
                    fact.ExactSourceValue,
                    fact.EvidenceIds,
                    fact.CitationIds)
            ]
        };

        var result = Validate(answer, context, Authorization(), RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Validate_AcceptsStandaloneSourceEvidenceWithItsCompiledPassageCitation()
    {
        var passage = SourcePassage();
        var context = Context() with
        {
            Claims = [],
            Sources = [],
            SourceEvidencePassages = [passage]
        };
        var answer = new AnswerCandidate("The source describes the requirement.", [], [])
        {
            SourceEvidence =
            [
                new AnswerSourceEvidenceAssertion(
                    passage.PassageId,
                    "The source describes the requirement.",
                    passage.EvidenceIds,
                    [passage.PassageId])
            ]
        };

        var result = Validate(answer, context, Authorization(), RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Validate_AcceptsHistoricalPassageWhenAnswerKeepsItsTemporalQualification()
    {
        var passage = SourcePassage() with
        {
            Freshness = "stale",
            SourceTimestamp = "2024-01-02T03:04:05Z"
        };
        var context = Context() with
        {
            Claims = [],
            Sources = [],
            SourceEvidencePassages = [passage]
        };
        var answer = new AnswerCandidate("The historical source recorded the requirement.", [], [])
        {
            SourceEvidence =
            [
                new AnswerSourceEvidenceAssertion(
                    passage.PassageId,
                    "The historical source recorded the requirement.",
                    passage.EvidenceIds,
                    [passage.PassageId])
            ]
        };

        var result = Validate(answer, context, Authorization(), RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Validate_RejectsStandaloneSourceEvidenceThatCitesUnboundEvidence()
    {
        var passage = SourcePassage();
        var context = Context() with { SourceEvidencePassages = [passage] };
        var answer = new AnswerCandidate("The source describes the requirement.", [], [])
        {
            SourceEvidence =
            [
                new AnswerSourceEvidenceAssertion(
                    passage.PassageId,
                    "The source describes the requirement.",
                    ["unbound-evidence"],
                    [passage.PassageId])
            ]
        };

        var result = Validate(answer, context, Authorization(), RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unknown-source-evidence");
    }

    [Fact]
    public void Validate_RejectsFactAssertionsUsingGraphOnlyCitationsOrChangedValues()
    {
        var fact = Fact();
        var context = Context() with { EngineeringFacts = [fact] };
        var answer = new AnswerCandidate("The part weighs 3 kg.", [], [])
        {
            Facts =
            [
                new AnswerFactAssertion(
                    fact.FactId,
                    JsonDocument.Parse("\"3.0\"").RootElement.Clone(),
                    fact.EvidenceIds,
                    ["citation-1"])
            ]
        };

        var result = Validate(answer, context, Authorization(), RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unsupported-fact-value");
        Assert.Contains(result.Issues, issue => issue.Code == "unknown-fact-source");
    }

    [Fact]
    public void Validate_AcceptsApplicationContextCitationsWithoutPromotingThemToImpacts()
    {
        var participation = Participation();
        var context = Context() with { ApplicationParticipation = [participation] };
        var answer = new AnswerCandidate("The part is represented in Windchill.", [], [])
        {
            ApplicationContexts =
            [
                new AnswerApplicationContextAssertion(
                    participation.CandidateId,
                    participation.EvidenceIds,
                    participation.CitationIds)
            ]
        };

        var result = Validate(answer, context, Authorization(), RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Validate_RejectsSourcePassageCitationsOutsideCurrentAuthorization()
    {
        var context = Context() with
        {
            SourceEvidencePassages =
            [
                SourcePassage() with { AuthorizationDecisionId = "decision-other" }
            ]
        };

        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-1", "SYNTH-PASSAGE-001"]),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unauthorized-source");
    }

    [Fact]
    public void Validate_RejectsEvidenceAttachedToAnotherClaim()
    {
        var context = Context() with
        {
            Claims =
            [
                new ImpactClaim("claim-1", "Claim one.", [], [], ["evidence-1"], null),
                new ImpactClaim("claim-2", "Claim two.", [], [], ["evidence-2"], null)
            ],
            Sources = [Source("evidence-1"), Source("evidence-2", "citation-2")]
        };

        var result = Validate(
            Candidate("claim-1", ["evidence-2"], ["citation-2"]),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "unknown-evidence" && issue.ClaimId == "claim-1");
    }

    [Fact]
    public void Validate_RejectsValidSourceFromUncitedEvidence()
    {
        var context = Context() with
        {
            Claims =
            [
                new ImpactClaim("claim-1", "Claim one.", [], [], ["evidence-1"], null),
                new ImpactClaim("claim-2", "Claim two.", [], [], ["evidence-2"], null)
            ],
            Sources = [Source("evidence-1"), Source("evidence-2", "citation-2")]
        };

        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-2"]),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "unknown-source" && issue.ClaimId == "claim-1");
    }

    [Fact]
    public void Validate_RejectsEmptyExplanation()
    {
        var result = Validate(
            new AnswerCandidate(
                "The item affects a downstream part.",
                [new AnswerImpact("claim-1", " ", ["evidence-1"], ["citation-1"])],
                []),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "empty-explanation" && issue.ClaimId == "claim-1");
    }

    [Theory]
    [InlineData("COMPONENT-999 is affected.")]
    [InlineData("The path uses REL-999.")]
    public void Validate_RejectsIdentifiersNotPresentInReferencedClaim(string explanation)
    {
        var result = Validate(
            new AnswerCandidate(
                "The item affects a downstream part.",
                [new AnswerImpact("claim-1", explanation, ["evidence-1"], ["citation-1"])],
                []),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "unsupported-identifier" && issue.ClaimId == "claim-1");
    }

    [Fact]
    public void Validate_RejectsIdentifiersNotPresentInContextSummary()
    {
        var result = Validate(
            new AnswerCandidate(
                "REQ-999 is affected.",
                [new AnswerImpact("claim-1", "Supported impact.", ["evidence-1"], ["citation-1"])],
                []),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unsupported-identifier");
    }

    [Fact]
    public void Validate_RejectsIdentifierAvailableOnlyOnAnotherClaim()
    {
        var context = Context() with
        {
            Claims =
            [
                new ImpactClaim(
                    "claim-1",
                    "R-123 affects P-1.",
                    ["R-123", "P-1"],
                    ["relationship-1"],
                    ["evidence-1"],
                    null),
                new ImpactClaim(
                    "claim-2",
                    "COMPONENT-999 is downstream.",
                    ["COMPONENT-999"],
                    ["REL-999"],
                    ["evidence-2"],
                    null)
            ],
            Sources = [Source("evidence-1"), Source("evidence-2", "citation-2")]
        };

        var result = Validate(
            new AnswerCandidate(
                "The item affects a downstream part.",
                [new AnswerImpact("claim-1", "COMPONENT-999 is affected.", ["evidence-1"], ["citation-1"])],
                []),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "unsupported-identifier" && issue.ClaimId == "claim-1");
    }

    [Fact]
    public void Validate_AcceptsIdentifiersPresentInSummaryPackageAndReferencedClaim()
    {
        var result = Validate(
            new AnswerCandidate(
                "R-123 affects P-1.",
                [new AnswerImpact(
                    "claim-1",
                    "P-1 is affected through relationship-1.",
                    ["evidence-1"],
                    ["citation-1"])],
                []),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Validate_DoesNotTreatOrdinaryWordsOrNumbersAsIdentifiers()
    {
        var result = Validate(
            new AnswerCandidate(
                "The change affects 2 parts.",
                [new AnswerImpact(
                    "claim-1",
                    "The first part has 3 downstream connections.",
                    ["evidence-1"],
                    ["citation-1"])],
                []),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Validate_RejectsModelProvidedWarnings()
    {
        var result = Validate(
            new AnswerCandidate(
                "The item affects a downstream part.",
                [new AnswerImpact("claim-1", "Supported impact.", ["evidence-1"], ["citation-1"])],
                ["Unverified assertion about a missing component."]),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unsupported-warning");
    }

    [Fact]
    public void Validate_RejectsClaimOmittedByContextBudget()
    {
        var context = Context() with
        {
            Omissions = [new ContextOmission("claim-2", "Claim omitted because the maximum claim count was reached.")]
        };

        var result = Validate(
            Candidate("claim-2", ["evidence-1"], ["citation-1"]),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "unknown-claim" && issue.ClaimId == "claim-2");
    }

    [Fact]
    public void Validate_RejectsMismatchedInvestigationId()
    {
        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-1"]),
            Context(),
            Authorization(),
            RequestContext(),
            "investigation-2");

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "investigation-mismatch");
    }

    [Fact]
    public void Validate_RejectsEvidenceBoundToAnotherAuthorizationDecision()
    {
        var context = Context() with
        {
            Sources = [Source("evidence-1") with { AuthorizationDecisionId = "decision-other" }]
        };

        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-1"]),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code is "unauthorized-source" or "unauthorized-evidence");
    }

    [Fact]
    public void Validate_RejectsSourcesOutsideRequestedSourceScope()
    {
        var context = Context() with
        {
            Scope = new ImpactScope(
                new HashSet<string>(StringComparer.Ordinal),
                3,
                new HashSet<string>(["windchill"], StringComparer.Ordinal),
                null)
        };

        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-1"]),
            context,
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "source-out-of-scope");
    }

    [Fact]
    public void Validate_AbstainsWhenThereAreNoEvidenceBackedImpacts()
    {
        var result = Validate(
            new AnswerCandidate("No supported impacts.", [], []),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Abstain, result.Disposition);
    }

    private static AnswerCandidate Candidate(
        string claimId,
        IReadOnlyList<string> evidenceIds,
        IReadOnlyList<string> sourceIds) =>
        new(
            "The item affects a downstream part.",
            [new AnswerImpact(claimId, "Supported impact.", evidenceIds, sourceIds)],
            []);

    private static ValidationResult Validate(
        AnswerCandidate answer,
        ContextPackage context,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext,
        string investigationId = "investigation-1") =>
        new AnswerValidator().Validate(answer, context, authorization, requestContext, investigationId);

    private static ContextPackage Context() =>
        new(
            RequestContext(),
            "investigation-1",
            "package-1",
            "context-v1",
            "compiler-v1",
            "decision-1",
            new ResolvedEntity("plm", "Requirement", "R-123", "Requirement R-123"),
            new ImpactScope(
                new HashSet<string>(StringComparer.Ordinal),
                3,
                new HashSet<string>(["plm"], StringComparer.Ordinal),
                null),
            [
                new ImpactClaim(
                    "claim-1",
                    "R-123 affects P-1.",
                    ["R-123", "P-1"],
                    ["relationship-1"],
                    ["evidence-1"],
                    null)
            ],
            [Source("evidence-1")],
            []);

    private static EngineeringFactEvidence Fact() =>
        new(
            "1.0",
            "fact-1",
            "investigation-1",
            1,
            "Windchill",
            "WT-PART-1",
            "Part",
            "part.weight",
            "weight",
            "Weight",
            EngineeringFactRole.Metric,
            JsonDocument.Parse("\"2.5\"").RootElement.Clone(),
            EngineeringFactValueType.Quantity,
            EngineeringFactValueType.Quantity,
            null,
            null,
            "kg",
            null,
            1,
            [],
            DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
            null,
            null,
            null,
            null,
            null,
            EngineeringFactFreshness.Current,
            EngineeringFactCompleteness.Complete,
            EngineeringFactDerivationStatus.Raw,
            null,
            [],
            ["fact-evidence-1"],
            ["fact-citation-1"],
            true,
            EngineeringFactAuthority.SourceAuthoritative,
            new EngineeringFactProvenance(
                "Windchill",
                "windchill-synthetic",
                "WT-PART-1",
                "A",
                "execution-1",
                "WT-PART-1",
                null,
                DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
                EngineeringFactAuthority.SourceAuthoritative),
            "decision-1");

    private static ApplicationParticipationEvidence Participation() =>
        new(
            "1.0",
            "participation-1",
            "investigation-1",
            1,
            "Windchill",
            ["R-123"],
            "gather-intelligence",
            SourceOperationStatus.Partial,
            EngineeringFactCompleteness.Partial,
            ["participation-evidence-1"],
            ["participation-citation-1"],
            EngineeringFactAuthority.SourceAuthoritative,
            new EngineeringFactProvenance(
                "Windchill",
                "windchill-synthetic",
                "WT-PART-1",
                "A",
                "execution-1",
                "WT-PART-1",
                null,
                DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
                EngineeringFactAuthority.SourceAuthoritative),
            "decision-1");

    private static EvidenceSourceReference Source(string evidenceId, string citationId = "citation-1") =>
        new(
            evidenceId,
            "relationship",
            "plm",
            "record-1",
            "revision-1",
            null,
            null,
            "provenance-1",
            "decision-1",
            CitationId: citationId,
            Authority: "source-authoritative",
            Provider: "plm");

    private static SourceEvidencePassage SourcePassage() =>
        new(
            "SYNTH-PASSAGE-001",
            "SYNTH-RECORD-001",
            "investigation-1",
            1,
            "Windchill",
            "SYNTH-NATIVE-RECORD-001",
            ["R-123"],
            "revision-1",
            "requirements[0].description",
            "Synthetic source-authored description.",
            ["SYNTH-EVIDENCE-001"],
            "SYNTH-PROVENANCE-001",
            "decision-1",
            "current",
            "hybrid",
            0.75,
            "source-index-v1",
            "synthetic-embedding-v1");

    private static AuthorizationScope Authorization() =>
        new(
            "tenant-1",
            "subject-1",
            "policy-v1",
            "decision-1",
            new HashSet<string>(["investigation:read-impact-evidence"], StringComparer.Ordinal),
            DateTimeOffset.UtcNow.AddMinutes(1));

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "trace-1", null, "conversation-1");
}
