using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Tests.ContextCompilation;

public sealed class ContextCompilerTests
{
    [Fact]
    public void Compile_PreservesStableClaimEvidencePathAndChainReferences()
    {
        var evidence = Evidence();
        var result = new ContextCompiler().Compile(Input(evidence));
        var package = Assert.IsType<ContextPackage>(result.Package);

        Assert.Equal(CompilationDisposition.Ready, result.Disposition);
        Assert.Contains(package.Claims, claim => claim.ClaimId == "chain-1");
        Assert.Contains(package.Claims, claim => claim.ClaimId == "path:path-1");
        Assert.Contains(package.Claims, claim => claim.ClaimId == "relationship:relationship-1");
        var chainClaim = package.Claims.Single(claim => claim.ClaimId == "chain-1");
        Assert.Equal("PLM Brain explanation", chainClaim.Statement);
        Assert.Equal("PLM Brain rationale", chainClaim.Rationale);
        Assert.Equal(0.875, chainClaim.Confidence);
        Assert.Equal(new[] { "relationship-1" }, chainClaim.RelationshipIds);
        Assert.All(package.Claims, claim =>
            Assert.All(claim.EvidenceIds, id => Assert.Contains(package.Sources, source => source.EvidenceId == id)));
        Assert.Equal("path-1", evidence.Paths.Single().PathId);
        Assert.Equal("chain-1", evidence.Chains.Single().ChainId);
        Assert.Equal(0.875, evidence.Chains.Single().Confidence);
    }

    [Fact]
    public void Compile_DeduplicatesIdenticalEvidenceSourcesByStableId()
    {
        var evidence = Evidence() with
        {
            Sources = [Source("evidence-1"), Source("evidence-1")]
        };

        var package = Assert.IsType<ContextPackage>(new ContextCompiler().Compile(Input(evidence)).Package);

        Assert.Single(package.Sources);
        Assert.Equal("evidence-1", package.Sources[0].EvidenceId);
    }

    [Fact]
    public void Compile_OmitsClaimsWithPartialProvenance()
    {
        var evidence = Evidence() with
        {
            Sources = [Source("evidence-1") with { ProvenanceId = "" }]
        };

        var package = Assert.IsType<ContextPackage>(new ContextCompiler().Compile(Input(evidence)).Package);

        Assert.Empty(package.Claims);
        Assert.Contains(package.Omissions, omission =>
            omission.ClaimId == "chain-1" && omission.Reason.Contains("complete source provenance", StringComparison.Ordinal));
        Assert.Empty(package.Sources);
    }

    [Fact]
    public void Compile_OmitsClaimsWhenEvidenceIdHasConflictingSources()
    {
        var evidence = Evidence() with
        {
            Sources = [Source("evidence-1"), Source("evidence-1") with { RecordId = "different-record" }]
        };

        var package = Assert.IsType<ContextPackage>(new ContextCompiler().Compile(Input(evidence)).Package);

        Assert.Empty(package.Claims);
        Assert.Contains(package.Omissions, omission =>
            omission.ClaimId == "chain-1" && omission.Reason.Contains("conflicting", StringComparison.Ordinal));
        Assert.Empty(package.Sources);
    }

    [Fact]
    public void Compile_DeniesEvidenceFromAnotherInvestigation()
    {
        var result = new ContextCompiler().Compile(Input(Evidence() with { InvestigationId = "investigation-2" }));

        Assert.Equal(CompilationDisposition.Denied, result.Disposition);
        Assert.Null(result.Package);
    }

    [Fact]
    public void Compile_DeniesEvidenceFromAnotherAuthorizationDecision()
    {
        var result = new ContextCompiler().Compile(Input(Evidence() with { AuthorizationDecisionId = "decision-2" }));

        Assert.Equal(CompilationDisposition.Denied, result.Disposition);
        Assert.Null(result.Package);
    }

    [Fact]
    public void Compile_ReportsClaimOmissionsForEachBudgetLimit()
    {
        var evidence = Evidence();
        var compiler = new ContextCompiler();
        var claimBudget = compiler.Compile(Input(evidence, new ContextBudget(0, 10, 10_000)));
        var evidenceBudget = compiler.Compile(Input(evidence, new ContextBudget(10, 0, 10_000)));
        var tokenBudget = compiler.Compile(Input(evidence, new ContextBudget(10, 10, 1)));

        Assert.Empty(Assert.IsType<ContextPackage>(claimBudget.Package).Claims);
        Assert.Contains(Assert.IsType<ContextPackage>(claimBudget.Package).Omissions,
            omission => omission.Reason.Contains("claim count", StringComparison.Ordinal));
        Assert.Contains(Assert.IsType<ContextPackage>(evidenceBudget.Package).Omissions,
            omission => omission.Reason.Contains("evidence-item count", StringComparison.Ordinal));
        Assert.Contains(Assert.IsType<ContextPackage>(tokenBudget.Package).Omissions,
            omission => omission.Reason.Contains("estimated-token budget", StringComparison.Ordinal));

        foreach (var package in new[]
                 {
                     Assert.IsType<ContextPackage>(claimBudget.Package),
                     Assert.IsType<ContextPackage>(evidenceBudget.Package),
                     Assert.IsType<ContextPackage>(tokenBudget.Package)
                 })
        {
            Assert.All(package.Omissions, omission =>
                Assert.DoesNotContain(package.Claims, claim => claim.ClaimId == omission.ClaimId));
        }
    }

    [Fact]
    public void Compile_PreservesRequestCorrelationAndCreatesStablePackageId()
    {
        var input = Input(Evidence());
        var first = Assert.IsType<ContextPackage>(new ContextCompiler().Compile(input).Package);
        var second = Assert.IsType<ContextPackage>(new ContextCompiler().Compile(input).Package);

        Assert.Same(input.RequestContext, first.RequestContext);
        Assert.Equal(input.RequestContext.RequestId, first.RequestContext.RequestId);
        Assert.Equal(input.RequestContext.TraceId, first.RequestContext.TraceId);
        Assert.Equal(first.PackageId, second.PackageId);
    }

    [Fact]
    public void Compile_DeniesEvidenceWithMismatchedRequestCorrelation()
    {
        var result = new ContextCompiler().Compile(Input(Evidence() with { TraceId = "other-trace" }));

        Assert.Equal(CompilationDisposition.Denied, result.Disposition);
        Assert.Null(result.Package);
    }

    private static ContextCompilationInput Input(
        EvidenceRetrievalResult evidence,
        ContextBudget? budget = null) =>
        new(
            RequestContext(),
            "investigation-1",
            new ResolvedEntity("plm", "Part", "part-1", "Part 1"),
            new ImpactScope(new HashSet<string>(StringComparer.Ordinal), 3, new HashSet<string>(StringComparer.Ordinal), null),
            new AuthorizationScope(
                "tenant-1",
                "subject-1",
                "policy-1",
                "decision-1",
                new HashSet<string>(["investigation:read-impact-evidence"], StringComparer.Ordinal),
                DateTimeOffset.UtcNow.AddMinutes(1)),
            evidence,
            budget ?? new ContextBudget(10, 10, 10_000));

    private static EvidenceRetrievalResult Evidence() =>
        new(
            "investigation-1",
            [
                new RelationshipEvidence(
                    "relationship-1",
                    "part-1",
                    "part-2",
                    "depends-on",
                    "PLM Brain relationship explanation",
                    ["evidence-1"])
            ],
            [
                new ImpactPathEvidence(
                    "path-1",
                    ["part-1", "part-2"],
                    ["relationship-1"],
                    Meanings: ["PLM Brain path meaning"])
            ],
            [
                new ImpactChainEvidence(
                    "chain-1",
                    "part-1",
                    "part-2",
                    ["relationship-1"],
                    [new ImpactPathStep("relationship-1", "part-1", "part-2", "forward", "depends-on", "meaning")],
                    ["evidence-1"],
                    [],
                    "PLM Brain explanation",
                    0.875,
                    "PLM Brain rationale",
                    "active",
                    "strong")
            ],
            [Source("evidence-1")],
            "source-v1",
            "ontology-v1",
            "decision-1",
            "request-1",
            "trace-1");

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
            Authority: "source-authoritative",
            Provider: "plm");

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "trace-1", "parent-1", "conversation-1");
}
