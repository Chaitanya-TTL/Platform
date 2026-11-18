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
        var result = new AnswerValidator().Validate(
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
        var result = new AnswerValidator().Validate(
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
        var result = new AnswerValidator().Validate(
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
        var result = new AnswerValidator().Validate(
            Candidate("claim-1", ["evidence-1"], ["unknown-source"]),
            Context(),
            Authorization(),
            RequestContext());

        Assert.Equal(ValidationDisposition.Reject, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "unknown-source");
    }

    [Fact]
    public void Validate_RejectsEvidenceBoundToAnotherAuthorizationDecision()
    {
        var context = Context() with
        {
            Sources = [Source("evidence-1") with { AuthorizationDecisionId = "decision-other" }]
        };

        var result = new AnswerValidator().Validate(
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

        var result = new AnswerValidator().Validate(
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
        var result = new AnswerValidator().Validate(
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

    private static EvidenceSourceReference Source(string evidenceId) =>
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
            CitationId: "citation-1",
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
