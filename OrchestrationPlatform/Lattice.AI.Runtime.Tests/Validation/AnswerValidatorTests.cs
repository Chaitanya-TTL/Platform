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
    public void Validate_AcceptsClaimsAndSourcesPresentInAuthorizedContext()
    {
        var result = Validate(
            Candidate("claim-1", ["evidence-1"], ["citation-1"]),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Accept, result.Disposition);
        Assert.Empty(result.Issues);
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
