using System.Text.Json;
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
    public void Compile_PreservesEveryAuthorizedClaimAcrossTheModelContextBudget()
    {
        var relationships = Enumerable.Range(1, 30)
            .Select(index => new RelationshipEvidence(
                $"relationship-{index}",
                "part-1",
                $"part-{index + 1}",
                "depends-on",
                $"PLM Brain relationship explanation {index}.",
                [$"evidence-{index}"]))
            .ToArray();
        var evidence = Evidence() with
        {
            Relationships = relationships,
            Paths = [],
            Chains = [],
            Sources = Enumerable.Range(1, 30)
                .Select(index => Source($"evidence-{index}"))
                .ToArray()
        };

        var result = new ContextCompiler().Compile(Input(
            evidence,
            new ContextBudget(800)));
        var package = Assert.IsType<ContextPackage>(result.Package);
        var plan = Assert.IsType<ApprovedContextPlan>(result.ApprovedPlan);

        Assert.Equal(30, package.Claims.Count);
        Assert.Empty(package.Omissions);
        Assert.Empty(plan.OversizedCandidateIds);
        Assert.True(plan.Stages.Count > 1);
        Assert.Equal(
            package.Claims.Select(claim => $"claim:{claim.ClaimId}").Order(StringComparer.Ordinal),
            plan.Stages.SelectMany(stage => stage.CandidateIds).Order(StringComparer.Ordinal));
        Assert.All(plan.Stages, stage =>
        {
            Assert.True(stage.EstimatedContextTokens <= 800);
            Assert.All(stage.Package.Claims, claim =>
                Assert.All(claim.EvidenceIds, evidenceId =>
                    Assert.Contains(stage.Package.Sources, source => source.EvidenceId == evidenceId)));
        });
    }

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
        Assert.All(result.CandidateDecisions, decision =>
        {
            Assert.False(decision.Approved);
            Assert.Equal("INVESTIGATION_MISMATCH", decision.ReasonCode);
            Assert.Contains("investigation does not match", decision.Reason, StringComparison.Ordinal);
        });
    }

    [Fact]
    public void Compile_DeniesEvidenceFromAnotherAuthorizationDecision()
    {
        var result = new ContextCompiler().Compile(Input(Evidence() with { AuthorizationDecisionId = "decision-2" }));

        Assert.Equal(CompilationDisposition.Denied, result.Disposition);
        Assert.Null(result.Package);
    }

    [Fact]
    public void Compile_ReportsCandidatesThatCannotFitInAnyContextStage()
    {
        var evidence = Evidence();
        var result = new ContextCompiler().Compile(Input(evidence, new ContextBudget(1)));
        var package = Assert.IsType<ContextPackage>(result.Package);
        var plan = Assert.IsType<ApprovedContextPlan>(result.ApprovedPlan);

        Assert.Equal(CompilationDisposition.ContextWindowExceeded, result.Disposition);
        Assert.Equal(3, package.Claims.Count);
        Assert.Empty(package.Omissions);
        Assert.Empty(plan.Stages);
        Assert.Equal(3, plan.OversizedCandidateIds.Count);
        Assert.Equal(plan.OversizedCandidateIds, result.Diagnostics
            .Select(diagnostic => diagnostic.Split('\'')[1]));
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

    [Fact]
    public void Compile_AddsCurrentSourcePassagesWithoutChangingAuthoritativeGraphClaims()
    {
        var sourcePassage = Passage() with { RetrievalScore = -3.5 };
        var compiler = new ContextCompiler();
        var result = compiler.Compile(Input(Evidence(), sourceEvidence: SourceEvidence([sourcePassage])));
        var package = Assert.IsType<ContextPackage>(result.Package);
        var changedPackage = Assert.IsType<ContextPackage>(compiler.Compile(Input(
            Evidence(),
            sourceEvidence: SourceEvidence([sourcePassage with { Text = "Changed source text." }]))).Package);

        Assert.Equal(CompilationDisposition.Ready, result.Disposition);
        Assert.Equal("context-v3", package.SchemaVersion);
        Assert.Equal("compiler-v3", package.CompilerVersion);
        Assert.Equal(3, package.Claims.Count);
        Assert.Equal(1, package.SourceEvidencePassages.Count);
        Assert.Equal(sourcePassage, package.SourceEvidencePassages[0]);
        Assert.NotEqual(package.PackageId, changedPackage.PackageId);
        Assert.Empty(package.Omissions);
    }

    [Fact]
    public void Compile_ApprovesSourceEvidenceWhenNoGraphClaimsAreAvailable()
    {
        var evidenceWithoutGraphClaims = Evidence() with
        {
            Relationships = Array.Empty<RelationshipEvidence>(),
            Paths = Array.Empty<ImpactPathEvidence>(),
            Chains = Array.Empty<ImpactChainEvidence>()
        };

        var result = new ContextCompiler().Compile(Input(
            evidenceWithoutGraphClaims,
            sourceEvidence: SourceEvidence([Passage()])));

        var package = Assert.IsType<ContextPackage>(result.Package);
        Assert.Equal(CompilationDisposition.Ready, result.Disposition);
        Assert.Empty(package.Claims);
        Assert.Single(package.SourceEvidencePassages);
        Assert.Contains(
            "passage:SYNTH-PASSAGE-001",
            Assert.Single(Assert.IsType<ApprovedContextPlan>(result.ApprovedPlan).Stages).CandidateIds);
    }

    [Fact]
    public void Compile_ApprovesFactsAndParticipationAlongsideGraphAndPassageWithoutPromotingRelationships()
    {
        var result = new ContextCompiler().Compile(Input(
            Evidence(),
            sourceEvidence: SourceEvidence([Passage()]),
            factEvidence: FactEvidence([Fact()]),
            applicationContext: ApplicationContext([Participation()])));
        var package = Assert.IsType<ContextPackage>(result.Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Equal("2.5", Assert.Single(package.EngineeringFacts)
            .ExactSourceValue.GetString());
        var participation = Assert.Single(package.ApplicationParticipation);
        Assert.Equal(SourceOperationStatus.Partial, participation.SourceOperationStatus);
        Assert.Contains("part-1", participation.CanonicalEntityIds);
        Assert.DoesNotContain(package.Claims, claim => claim.ClaimId == participation.CandidateId);
        Assert.Single(package.SourceEvidencePassages);
        Assert.Contains(result.CandidateDecisions, decision =>
            decision.CandidateType == "Graph" &&
            decision.CandidateId == "relationship:relationship-1" &&
            decision.Approved &&
            decision.Reason is null);
        Assert.Contains(result.CandidateDecisions, decision =>
            decision.CandidateType == "Fact" &&
            decision.CandidateId == "fact-1" &&
            decision.Approved);
        Assert.Contains(result.CandidateDecisions, decision =>
            decision.CandidateType == "Digest" &&
            decision.CandidateId == "participation-1" &&
            decision.Approved);
        Assert.Contains(result.CandidateDecisions, decision =>
            decision.CandidateType == "Evidence" &&
            decision.CandidateId == "SYNTH-PASSAGE-001" &&
            decision.Approved);
    }

    [Fact]
    public void Compile_ApprovesCandidatesBoundToPlmBrainEntitiesWithoutRelationshipsOrResolvedSubject()
    {
        var factEvidence = FactEvidence([Fact() with { SubjectId = "investigation-subject" }]) with
        {
            AuthoritativeEntityIds = ["WT-PART-1"]
        };
        var applicationContext = ApplicationContext([
            Participation() with { CanonicalEntityIds = ["orphan-entity"] }
        ]) with
        {
            AuthoritativeEntityIds = ["orphan-entity"]
        };
        var graphEvidence = Evidence() with
        {
            Relationships = [],
            Paths = [],
            Chains = []
        };
        var input = Input(
            graphEvidence,
            factEvidence: factEvidence,
            applicationContext: applicationContext) with
        {
            Subject = null
        };

        var package = Assert.IsType<ContextPackage>(new ContextCompiler().Compile(input).Package);

        Assert.Empty(package.Claims);
        Assert.Single(package.EngineeringFacts);
        Assert.Single(package.ApplicationParticipation);
        Assert.Empty(package.Omissions);
    }

    [Fact]
    public void Compile_ComparativeEvidenceVariantsPreserveGraphAndKeepEvidenceTypesDistinct()
    {
        var compiler = new ContextCompiler();
        var graph = Evidence();
        var fact = Fact();
        var passage = Passage();
        var participation = Participation();
        var plmOnly = Assert.IsType<ContextPackage>(compiler.Compile(Input(graph)).Package);
        var plmWithFacts = Assert.IsType<ContextPackage>(compiler.Compile(Input(
            graph,
            factEvidence: FactEvidence([fact]))).Package);
        var plmWithRag = Assert.IsType<ContextPackage>(compiler.Compile(Input(
            graph,
            sourceEvidence: SourceEvidence([passage]))).Package);
        var combined = Assert.IsType<ContextPackage>(compiler.Compile(Input(
            graph,
            sourceEvidence: SourceEvidence([passage]),
            factEvidence: FactEvidence([fact]),
            applicationContext: ApplicationContext([participation]))).Package);

        var expectedGraphClaims = plmOnly.Claims.Select(claim => claim.ClaimId).ToArray();
        Assert.Equal(expectedGraphClaims, plmWithFacts.Claims.Select(claim => claim.ClaimId));
        Assert.Equal(expectedGraphClaims, plmWithRag.Claims.Select(claim => claim.ClaimId));
        Assert.Equal(expectedGraphClaims, combined.Claims.Select(claim => claim.ClaimId));
        Assert.Empty(plmOnly.EngineeringFacts);
        Assert.Single(plmWithFacts.EngineeringFacts);
        Assert.Empty(plmWithFacts.SourceEvidencePassages);
        Assert.Empty(plmWithRag.EngineeringFacts);
        Assert.Single(plmWithRag.SourceEvidencePassages);
        Assert.Equal("2.5", Assert.Single(combined.EngineeringFacts).ExactSourceValue.GetString());
        Assert.Equal(["fact-citation-1"], combined.EngineeringFacts.Single().CitationIds);
        Assert.Single(combined.SourceEvidencePassages);
        Assert.Equal(["participation-1"], combined.ApplicationParticipation
            .Select(candidate => candidate.CandidateId));
        Assert.DoesNotContain(combined.Claims, claim => claim.ClaimId == participation.CandidateId);
    }

    [Theory]
    [InlineData("revision")]
    [InlineData("decision")]
    [InlineData("investigation")]
    [InlineData("request")]
    public void Compile_OmitsFactsWithMismatchedBindingsAndPreservesGraphClaims(string mismatch)
    {
        var result = FactEvidence([Fact()]) with
        {
            SnapshotRevision = mismatch == "revision" ? 2 : 1,
            AuthorizationDecisionId = mismatch == "decision" ? "decision-other" : "decision-1",
            InvestigationId = mismatch == "investigation" ? "investigation-2" : "investigation-1",
            RequestId = mismatch == "request" ? "request-other" : "request-1"
        };
        var compilation = new ContextCompiler().Compile(Input(
            Evidence(),
            factEvidence: result));
        var package = Assert.IsType<ContextPackage>(compilation.Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Empty(package.EngineeringFacts);
        Assert.Contains(package.Omissions, omission =>
            omission.Kind == ContextOmissionKind.EngineeringFact);
        var decision = Assert.Single(compilation.CandidateDecisions, candidate =>
            candidate.CandidateType == "Fact" && candidate.CandidateId == "fact-1");
        Assert.False(decision.Approved);
        Assert.Equal("COMPILER_REJECTION", decision.ReasonCode);
        Assert.Contains(
            mismatch == "revision"
                ? "snapshot revision does not match the fact retrieval result"
                : mismatch switch
                {
                    "decision" => "authorization decision does not match the active decision",
                    "investigation" => "investigation ID does not match the active investigation",
                    "request" => "request ID does not match the active request",
                    _ => throw new ArgumentOutOfRangeException(nameof(mismatch))
                },
            decision.Reason,
            StringComparison.Ordinal);
    }

    [Fact]
    public void Compile_OmitsConflictingFactValuesWithoutDroppingIndependentGraphClaims()
    {
        var facts = FactEvidence(
        [
            Fact("fact-1"),
            Fact("fact-2") with
            {
                ExactSourceValue = JsonDocument.Parse("\"3.0\"").RootElement.Clone(),
                EvidenceIds = ["fact-evidence-2"],
                CitationIds = ["fact-citation-2"]
            }
        ]);
        var package = Assert.IsType<ContextPackage>(new ContextCompiler().Compile(Input(
            Evidence(),
            factEvidence: facts)).Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Empty(package.EngineeringFacts);
        Assert.Equal(2, package.Omissions.Count(omission =>
            omission.Kind == ContextOmissionKind.EngineeringFact));
    }

    [Fact]
    public void Compile_OmitsPassageWhoseIdConflictsWithAnIncludedGraphSourceId()
    {
        var graphEvidence = Evidence() with
        {
            Sources = Evidence().Sources
                .Select(source => source.EvidenceId == "evidence-1"
                    ? source with { CitationId = "SYNTH-PASSAGE-001" }
                    : source)
                .ToArray()
        };

        var package = Assert.IsType<ContextPackage>(
            new ContextCompiler().Compile(Input(
                graphEvidence,
                sourceEvidence: SourceEvidence([Passage()]))).Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Empty(package.SourceEvidencePassages);
        Assert.Contains(package.Omissions, omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage &&
            omission.ClaimId == "SYNTH-PASSAGE-001" &&
            omission.Reason.Contains("conflicts", StringComparison.Ordinal));
    }

    [Fact]
    public void Compile_DoesNotCreateGraphClaimsFromSourcePassages()
    {
        var graphEvidence = Evidence() with
        {
            Relationships = [],
            Paths = [],
            Chains = [],
            Sources = []
        };

        var result = new ContextCompiler().Compile(Input(
            graphEvidence,
            sourceEvidence: SourceEvidence([Passage()])));
        var package = Assert.IsType<ContextPackage>(result.Package);

        Assert.Equal(CompilationDisposition.Ready, result.Disposition);
        Assert.Empty(package.Claims);
        Assert.Single(package.SourceEvidencePassages);
    }

    [Theory]
    [InlineData("investigation")]
    [InlineData("decision")]
    [InlineData("request")]
    [InlineData("trace")]
    [InlineData("snapshot")]
    [InlineData("version")]
    public void Compile_OmitsSourceEvidenceWithMismatchedResultBindingWithoutDroppingGraphClaims(string mismatch)
    {
        var sourceEvidence = SourceEvidence([Passage()]) with
        {
            InvestigationId = mismatch == "investigation" ? "investigation-2" : "investigation-1",
            AuthorizationDecisionId = mismatch == "decision" ? "decision-2" : "decision-1",
            RequestId = mismatch == "request" ? "request-2" : "request-1",
            TraceId = mismatch == "trace" ? "trace-2" : "trace-1",
            SnapshotRevision = mismatch == "snapshot" ? -1 : 1,
            SourceVersion = mismatch == "version" ? "" : "source-evidence-v1"
        };

        var package = Assert.IsType<ContextPackage>(
            new ContextCompiler().Compile(Input(Evidence(), sourceEvidence: sourceEvidence)).Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Empty(package.SourceEvidencePassages);
        Assert.Contains(package.Omissions, omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage &&
            omission.ClaimId == "SYNTH-PASSAGE-001" &&
            omission.Reason.Contains("binding", StringComparison.Ordinal));
    }

    [Fact]
    public void Compile_OmitsPassagesWithMismatchedInvestigationOrAuthorizationDecision()
    {
        var passages = new[]
        {
            Passage("SYNTH-PASSAGE-INVESTIGATION") with { InvestigationId = "investigation-2" },
            Passage("SYNTH-PASSAGE-DECISION") with { AuthorizationDecisionId = "decision-2" }
        };

        var package = Assert.IsType<ContextPackage>(
            new ContextCompiler().Compile(Input(Evidence(), sourceEvidence: SourceEvidence(passages))).Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Empty(package.SourceEvidencePassages);
        Assert.Equal(2, package.Omissions.Count(omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage));
    }

    [Fact]
    public void Compile_OmitsPassagesWithoutCompleteSourceProvenance()
    {
        var incompletePassage = Passage() with
        {
            CanonicalEntityIds = [],
            SourceRecordId = "",
            EvidenceIds = [],
            ProvenanceId = ""
        };

        var package = Assert.IsType<ContextPackage>(
            new ContextCompiler().Compile(Input(
                Evidence(),
                sourceEvidence: SourceEvidence([incompletePassage]))).Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Empty(package.SourceEvidencePassages);
        Assert.Contains(package.Omissions, omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage &&
            omission.Reason.Contains("provenance", StringComparison.Ordinal));
    }

    [Fact]
    public void Compile_PreservesBoundProjectionDiagnosticsWhenTheSnapshotHasNoPassages()
    {
        var diagnostics = new SourceEvidenceRetrievalDiagnostics(
            "partial",
            "partial",
            new SourceEvidenceProjectionDiagnostics(
                246,
                0,
                new Dictionary<string, int> { ["sap"] = 0 },
                new Dictionary<string, int> { ["missingFieldLineage"] = 3 },
                new Dictionary<string, int> { ["partial"] = 1 }));
        var sourceEvidence = SourceEvidence([]) with { Diagnostics = diagnostics };

        var result = new ContextCompiler().Compile(Input(Evidence(), sourceEvidence: sourceEvidence));
        var package = Assert.IsType<ContextPackage>(result.Package);

        Assert.Equal(diagnostics, package.SourceEvidenceDiagnostics);
        Assert.Empty(package.SourceEvidencePassages);
    }

    [Fact]
    public void Compile_PreservesStaleAndUnknownPassagesButRejectsMismatchedSnapshotPassages()
    {
        var passages = new[]
        {
            Passage("SYNTH-PASSAGE-CURRENT") with { RetrievalScore = -3.5 },
            Passage("SYNTH-PASSAGE-STALE") with { Freshness = "stale" },
            Passage("SYNTH-PASSAGE-UNKNOWN") with { Freshness = "unknown" },
            Passage("SYNTH-PASSAGE-OTHER-REVISION") with { SnapshotRevision = 2 },
            Passage("SYNTH-PASSAGE-NONFINITE-SCORE") with { RetrievalScore = double.PositiveInfinity }
        };

        var package = Assert.IsType<ContextPackage>(
            new ContextCompiler().Compile(Input(Evidence(), sourceEvidence: SourceEvidence(passages))).Package);

        Assert.Equal(3, package.Claims.Count);
        Assert.Equal(
            ["SYNTH-PASSAGE-CURRENT", "SYNTH-PASSAGE-STALE", "SYNTH-PASSAGE-UNKNOWN"],
            package.SourceEvidencePassages.Select(passage => passage.PassageId));
        Assert.Equal(2, package.Omissions.Count(omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage));
        Assert.Contains(package.SourceEvidencePassages, passage =>
            passage.PassageId == "SYNTH-PASSAGE-STALE" && passage.Freshness == "stale");
        Assert.Contains(package.Omissions, omission =>
            omission.ClaimId == "SYNTH-PASSAGE-NONFINITE-SCORE" &&
            omission.Reason.Contains("cannot be serialized", StringComparison.Ordinal));
    }

    [Fact]
    public void Compile_DeduplicatesIdenticalPassagesAndOmitsConflictingStablePassageIds()
    {
        var repeatedPassage = Passage("SYNTH-PASSAGE-DUPLICATE");
        var conflictingPassage = repeatedPassage with { Text = "Conflicting passage text." };
        var sourceEvidence = SourceEvidence(
        [
            repeatedPassage,
            repeatedPassage,
            Passage("SYNTH-PASSAGE-CONFLICT"),
            conflictingPassage with { PassageId = "SYNTH-PASSAGE-CONFLICT" }
        ]);

        var package = Assert.IsType<ContextPackage>(
            new ContextCompiler().Compile(Input(Evidence(), sourceEvidence: sourceEvidence)).Package);

        Assert.Equal(["SYNTH-PASSAGE-DUPLICATE"], package.SourceEvidencePassages
            .Select(passage => passage.PassageId));
        Assert.Contains(package.Omissions, omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage &&
            omission.ClaimId == "SYNTH-PASSAGE-DUPLICATE" &&
            omission.Reason.Contains("duplicate", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(package.Omissions, omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage &&
            omission.ClaimId == "SYNTH-PASSAGE-CONFLICT" &&
            omission.Reason.Contains("conflicting", StringComparison.Ordinal));
        Assert.Equal(3, package.Claims.Count);
    }

    [Fact]
    public void Compile_PreservesEquivalentPassagesWithDifferentStableIds()
    {
        var first = Passage("SYNTH-PASSAGE-FIRST");
        var duplicate = first with { PassageId = "SYNTH-PASSAGE-SECOND" };

        var package = Assert.IsType<ContextPackage>(
            new ContextCompiler().Compile(Input(
                Evidence(),
                sourceEvidence: SourceEvidence([first, duplicate]))).Package);

        Assert.Equal(["SYNTH-PASSAGE-FIRST", "SYNTH-PASSAGE-SECOND"], package.SourceEvidencePassages
            .Select(passage => passage.PassageId));
        Assert.DoesNotContain(package.Omissions, omission =>
            omission.Kind == ContextOmissionKind.SourceEvidencePassage &&
            omission.ClaimId == "SYNTH-PASSAGE-SECOND");
    }

    [Fact]
    public void Compile_StagesPassagesWithoutDroppingAuthorizedGraphClaims()
    {
        var result = new ContextCompiler().Compile(Input(
            Evidence(),
            new ContextBudget(1_000),
            SourceEvidence([Passage() with { Text = new string('x', 4_000) }])));
        var package = Assert.IsType<ContextPackage>(result.Package);
        var plan = Assert.IsType<ApprovedContextPlan>(result.ApprovedPlan);

        Assert.Equal(3, package.Claims.Count);
        Assert.True(package.SourceEvidencePassages.Count > 1);
        Assert.Empty(plan.OversizedCandidateIds);
        Assert.Equal(
            new string('x', 4_000),
            string.Concat(package.SourceEvidencePassages
                .OrderBy(passage => passage.SegmentIndex)
                .Select(passage => passage.Text)));
        Assert.Equal(
            package.Claims.Select(claim => $"claim:{claim.ClaimId}")
                .Concat(package.SourceEvidencePassages.Select(passage => $"passage:{passage.PassageId}"))
                .Order(StringComparer.Ordinal),
            plan.Stages.SelectMany(stage => stage.CandidateIds).Order(StringComparer.Ordinal));
        Assert.Empty(package.Omissions);
    }

    [Fact]
    public void Compile_StagesEveryApplicationPassageAndPreservesItsCitation()
    {
        var applications = new[] { "Codebeamer", "Configit", "SAP", "Teamcenter", "Windchill" };
        var passages = applications.Select((application, index) =>
        {
            var passageId = $"SYNTH-PASSAGE-APPLICATION-{index}";
            return Passage(passageId) with
            {
                SourceApplication = application,
                SourceRecordId = $"SYNTH-NATIVE-{index}",
                Text = new string((char)('a' + index), 2_000),
                EvidenceIds = [$"SYNTH-EVIDENCE-{index}"],
                CitationIds = [$"SYNTH-CITATION-{index}"],
                SourceFieldName = "description",
                SourceTimestamp = "2026-11-18T10:00:00Z"
            };
        }).ToArray();

        var result = new ContextCompiler().Compile(Input(
            Evidence(),
            new ContextBudget(800),
            SourceEvidence(passages)));
        var package = Assert.IsType<ContextPackage>(result.Package);
        var plan = Assert.IsType<ApprovedContextPlan>(result.ApprovedPlan);
        var stagedPassages = plan.Stages
            .SelectMany(stage => stage.Package.SourceEvidencePassages)
            .ToArray();

        Assert.True(plan.Stages.Count > 1);
        Assert.Equal(passages.Length, stagedPassages.Select(passage => passage.SourceRecordId).Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(applications.Order(StringComparer.Ordinal),
            package.SourceEvidencePassages.Select(passage => passage.SourceApplication)
                .Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal));
        foreach (var original in passages)
        {
            var segments = stagedPassages
                .Where(passage => passage.SourceRecordId == original.SourceRecordId)
                .OrderBy(passage => passage.SegmentIndex)
                .ToArray();
            Assert.Equal(original.Text, string.Concat(segments.Select(passage => passage.Text)));
            Assert.Equal(segments.Length, segments[0].SegmentCount);
            Assert.All(segments, passage =>
            {
                Assert.NotEmpty(passage.CitationIds);
                Assert.Equal("description", passage.SourceFieldName);
                Assert.Equal("2026-11-18T10:00:00Z", passage.SourceTimestamp);
                Assert.Equal(segments.Length, passage.SegmentCount);
            });
        }
    }

    private static ContextCompilationInput Input(
        EvidenceRetrievalResult evidence,
        ContextBudget? budget = null,
        SourceEvidenceRetrievalResult? sourceEvidence = null,
        FactEvidenceRetrievalResult? factEvidence = null,
        ApplicationContextRetrievalResult? applicationContext = null) =>
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
            budget ?? new ContextBudget(10_000),
            sourceEvidence,
            factEvidence,
            applicationContext);

    private static SourceEvidenceRetrievalResult SourceEvidence(
        IReadOnlyList<SourceEvidencePassage> passages) =>
        new("investigation-1", 1, "source-evidence-v1", "decision-1", "request-1", "trace-1", passages);

    private static FactEvidenceRetrievalResult FactEvidence(
        IReadOnlyList<EngineeringFactEvidence> facts) =>
        new("investigation-1", 1, "source-v1", "ontology-v1", "decision-1", "request-1", "trace-1", facts);

    private static ApplicationContextRetrievalResult ApplicationContext(
        IReadOnlyList<ApplicationParticipationEvidence> participations) =>
        new("investigation-1", 1, "source-v1", "ontology-v1", "decision-1", "request-1", "trace-1", participations);

    private static EngineeringFactEvidence Fact(string factId = "fact-1") =>
        new(
            "1.0",
            factId,
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
            "decision-1")
        {
            SubjectId = "part-1",
            SourceNativeId = "WT-PART-1"
        };

    private static ApplicationParticipationEvidence Participation() =>
        new(
            "1.0",
            "participation-1",
            "investigation-1",
            1,
            "Windchill",
            ["part-1"],
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

    private static SourceEvidencePassage Passage(string passageId = "SYNTH-PASSAGE-001") =>
        new(
            passageId,
            "SYNTH-RECORD-001",
            "investigation-1",
            1,
            "Windchill",
            "SYNTH-NATIVE-RECORD-001",
            ["part-1"],
            "revision-1",
            "requirements[0].description",
            "Synthetic source-authored description with engineering detail.",
            ["SYNTH-EVIDENCE-001"],
            "SYNTH-PROVENANCE-001",
            "decision-1",
            "current",
            "hybrid",
            0.75,
            "source-index-v1",
            "synthetic-embedding-v1");

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
