using System.Text;
using System.Text.Json;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.SourceEvidence;
using Lattice.AI.Runtime.Telemetry;
using Lattice.AI.Runtime.Validation;

namespace Lattice.AI.Runtime.Evaluation;

public sealed class EngineeringImpactEvaluationRunner : IEngineeringImpactEvaluationRunner
{
    private const string ReportSchemaVersion = "engineering-impact-evaluation-report/v3";
    private const string EvaluationScope =
        "Deterministic synthetic fixture reference-integrity regression; semantic support and live-model quality are not evaluated.";
    private const int MaximumDatasetBytes = 10 * 1024 * 1024;
    private const int MaximumLineBytes = 1024 * 1024;
    private const int MaximumCaseCount = 1000;
    private const string ResolveGrant = "investigation:resolve-entity";
    private const string ReadEvidenceGrant = "investigation:read-impact-evidence";
    private static readonly DateTimeOffset EvaluationNow = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private static readonly HashSet<string> UnsupportedClaimIssueCodes = new(StringComparer.Ordinal)
    {
        "unknown-claim",
        "unknown-evidence",
        "unknown-source",
        "missing-provenance-reference",
        "unauthorized-source",
        "unauthorized-evidence",
        "invalid-source-id",
        "duplicate-answer-claim"
    };
    private static readonly HashSet<string> SupportedAuthorizationScenarios = new(StringComparer.Ordinal)
    {
        "allowed",
        "denied",
        "expired",
        "revoked",
        "missing-investigation",
        "investigation-mismatch"
    };
    private static readonly HashSet<string> SupportedEvidenceModes = new(StringComparer.Ordinal)
    {
        "direct",
        "multi-hop",
        "empty",
        "missing-provenance",
        "budget-pressure",
        "evidence-investigation-mismatch"
    };

    public async Task<EngineeringImpactEvaluationReport> RunAsync(
        string datasetPath,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(datasetPath);
        cancellationToken.ThrowIfCancellationRequested();

        var root = Path.GetFullPath(datasetPath);
        if (!Directory.Exists(root))
        {
            throw new DirectoryNotFoundException($"Evaluation dataset directory '{root}' does not exist.");
        }

        var manifest = ReadManifest(ResolveDatasetFile(root, "manifest.json", "manifest.json"));
        var casePath = ResolveDatasetFile(root, manifest.CasesFile, "manifest casesFile");
        var fixturePaths = manifest.FixtureFiles.ToDictionary(
            path => path,
            path => ResolveDatasetFile(root, path, "manifest fixtureFiles"),
            StringComparer.Ordinal);
        var fixtures = fixturePaths.ToDictionary(
            pair => pair.Key,
            pair => ReadFixture(pair.Value),
            StringComparer.Ordinal);
        var cases = ReadCases(casePath, fixturePaths.Keys.ToHashSet(StringComparer.Ordinal));

        if (cases.Count != manifest.CaseCount)
        {
            throw new InvalidDataException(
                $"Manifest caseCount is {manifest.CaseCount}, but {cases.Count} JSONL cases were loaded.");
        }

        if (cases.Count > MaximumCaseCount)
        {
            throw new InvalidDataException($"Evaluation datasets cannot contain more than {MaximumCaseCount} cases.");
        }

        var results = new List<EngineeringImpactEvaluationCaseResult>(cases.Count);
        foreach (var evaluationCase in cases)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var caseFixture = fixtures[evaluationCase.FixtureFile];
            if (!string.Equals(caseFixture.InvestigationId, evaluationCase.InvestigationId, StringComparison.Ordinal))
            {
                throw new InvalidDataException(
                    $"Case '{evaluationCase.CaseId}' investigationId does not match its fixture.");
            }
            if (evaluationCase.ModelResponseKey is not null &&
                !caseFixture.ModelResponses.ContainsKey(evaluationCase.ModelResponseKey))
            {
                throw new InvalidDataException(
                    $"Case '{evaluationCase.CaseId}' references an unknown fake model response.");
            }

            results.Add(await EvaluateCaseAsync(evaluationCase, caseFixture, cancellationToken).ConfigureAwait(false));
        }

        var sortedResults = results.OrderBy(result => result.CaseId, StringComparer.Ordinal).ToArray();
        var expectedPathCount = sortedResults.Sum(result => result.RequiredPathIds.Count);
        var coveredPathCount = sortedResults.Sum(result => result.CoveredPathIds.Count);
        var expectedLinkCount = sortedResults.Sum(result => result.RequiredLinkIds.Count);
        var coveredLinkCount = sortedResults.Sum(result =>
            result.RequiredLinkIds.Count(linkId => result.ActualLinkIds.Contains(linkId, StringComparer.Ordinal)));
        var unsupportedClaimCount = sortedResults.Sum(result => result.UnsupportedClaimCount);
        var evaluatedModelClaimCount = sortedResults.Sum(result => result.EvaluatedModelClaimCount);
        var intentDetectionAccuracy = CalculateAccuracy(sortedResults, result =>
            string.Equals(result.ExpectedQuestionIntent, result.ActualQuestionIntent, StringComparison.Ordinal));
        var subjectExtractionAccuracy = CalculateAccuracy(sortedResults, result =>
            string.Equals(result.ExpectedExtractedSubjectId, result.ActualExtractedSubjectId, StringComparison.Ordinal));
        var clarificationAccuracy = CalculateAccuracy(sortedResults, result =>
            result.ExpectedClarificationRequired == result.ActualClarificationRequired);
        var scopePolicyAccuracy = CalculateAccuracy(sortedResults, ScopePolicyMatches);
        var dispositionAccuracy = CalculateAccuracy(sortedResults, result =>
            result.ExpectedDisposition == result.ActualDisposition);
        var relationshipCoverage = CalculateCoverage(sortedResults, result =>
            result.RequiredRelationshipIds, result => result.ActualRelationshipIds);
        var pathCoverageRate = CalculateCoverage(sortedResults, result =>
            result.RequiredPathIds, result => result.CoveredPathIds);
        var chainCoverage = CalculateCoverage(sortedResults, result =>
            result.RequiredChainIds, result => result.ActualChainIds);
        var evidenceCoverage = CalculateCoverage(sortedResults, result =>
            result.RequiredEvidenceIds, result => result.ActualEvidenceIds);
        var sourceCoverage = CalculateCoverage(sortedResults, result =>
            result.RequiredSourceIds, result => result.ActualSourceIds);
        var unsupportedReferenceAttempts = sortedResults
            .Where(result => result.ExpectedUnsupportedReferenceRejected == true)
            .ToArray();
        var unsupportedReferenceRejectionRate = new EvaluationRate(
            unsupportedReferenceAttempts.Count(result => result.ActualUnsupportedReferenceRejected == true),
            unsupportedReferenceAttempts.Length,
            unsupportedReferenceAttempts.Length == 0
                ? null
                : (double)unsupportedReferenceAttempts.Count(result => result.ActualUnsupportedReferenceRejected == true) /
                  unsupportedReferenceAttempts.Length);
        var omissionBehaviorAccuracy = CalculateAccuracy(sortedResults, result =>
            SameIds(result.ExpectedOmittedClaimIds, result.ActualOmittedClaimIds));
        var authorizationLeakageCount = sortedResults.Count(result =>
            result.AuthorizationDenied && (result.EvidenceRetrievalCalls > 0 || result.ModelCalls > 0));
        var modelJsonParseSuccessCount = sortedResults.Count(result =>
            result.ModelCalls > 0 && result.ActualModelJsonParseSucceeded == true);
        var modelJsonParseFailureCount = sortedResults.Count(result =>
            result.ModelCalls > 0 && result.ActualModelJsonParseSucceeded == false);
        var dispositionCounts = Enum.GetNames<AnswerDisposition>()
            .Order(StringComparer.Ordinal)
            .ToDictionary(
                disposition => disposition,
                disposition => sortedResults.Count(result =>
                    string.Equals(result.ActualDisposition.ToString(), disposition, StringComparison.Ordinal)),
                StringComparer.Ordinal);
        var metrics = new EngineeringImpactEvaluationMetrics(
            unsupportedClaimCount,
            evaluatedModelClaimCount,
            new EvaluationRate(
                unsupportedClaimCount,
                evaluatedModelClaimCount,
                evaluatedModelClaimCount == 0 ? null : (double)unsupportedClaimCount / evaluatedModelClaimCount),
            expectedPathCount,
            coveredPathCount,
            new EvaluationRate(
                coveredPathCount,
                expectedPathCount,
                expectedPathCount == 0 ? null : (double)coveredPathCount / expectedPathCount),
            expectedLinkCount,
            coveredLinkCount,
            new EvaluationRate(
                coveredLinkCount,
                expectedLinkCount,
                expectedLinkCount == 0 ? null : (double)coveredLinkCount / expectedLinkCount),
            dispositionCounts,
            intentDetectionAccuracy,
            subjectExtractionAccuracy,
            clarificationAccuracy,
            scopePolicyAccuracy,
            dispositionAccuracy,
            relationshipCoverage,
            chainCoverage,
            evidenceCoverage,
            sourceCoverage,
            unsupportedReferenceRejectionRate,
            authorizationLeakageCount,
            modelJsonParseSuccessCount,
            modelJsonParseFailureCount,
            omissionBehaviorAccuracy);

        var requiredCasesPassed = sortedResults
            .Where(result => result.Required)
            .All(result => result.Passed);
        var directCase = cases.Single(evaluationCase => evaluationCase.CaseId == "direct-impact");
        var conversationSequences = await EvaluateConversationSequencesAsync(
            directCase,
            fixtures[directCase.FixtureFile],
            cancellationToken).ConfigureAwait(false);
        var passed = requiredCasesPassed &&
                     conversationSequences.FailedSequenceCount == 0 &&
                     (metrics.PathCoverage.Rate is null ||
                      metrics.PathCoverage.Rate >= manifest.MinimumPathCoverage) &&
                     (metrics.LinkCoverage.Rate is null ||
                      metrics.LinkCoverage.Rate >= manifest.MinimumLinkCoverage) &&
                     metrics.AuthorizationLeakageCount == 0;

        return new EngineeringImpactEvaluationReport(
            ReportSchemaVersion,
            manifest.DatasetId,
            EvaluationScope,
            ReferenceIntegrityEvaluated: true,
            SemanticSupportEvaluated: false,
            LiveModelQualityEvaluated: false,
            passed,
            sortedResults.Length,
            sortedResults.Count(result => result.Passed),
            sortedResults.Count(result => !result.Passed),
            metrics,
            sortedResults,
            conversationSequences);
    }

    private static async Task<ConversationSequenceEvaluationReport> EvaluateConversationSequencesAsync(
        EvaluationCase templateCase,
        EvaluationFixture fixture,
        CancellationToken cancellationToken)
    {
        var cases = new List<ConversationSequenceEvaluationCase>();
        await EvaluateSequenceAsync(
            "supported-explanation-follow-up",
            ["Answer", "Answer"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var second = await AnswerTurnAsync(
                    harness,
                    "Why is it impacted?",
                    "turn-a-2",
                    firstTurn.ContinuationState,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.ContinuationState is null || second.ContinuationState.StateVersion != 2)
                    throw new InvalidOperationException("The successful follow-up did not advance structured state.");
            }).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "ambiguous-subjects-clarify",
            ["Answer", "Clarify"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var ambiguousState = firstTurn.ContinuationState! with
                {
                    CurrentSubjectIds = ["REQ-123", "REQ-999"],
                    CurrentValidatedEntityRefs =
                    [
                        new ValidatedEntityReference("REQ-123", "Requirement", "Codebeamer"),
                        new ValidatedEntityReference("REQ-999", "Requirement", "Codebeamer")
                    ]
                };
                var second = await AnswerTurnAsync(
                    harness,
                    "Explain those.",
                    "turn-b-2",
                    ambiguousState,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.Disposition != AnswerDisposition.Clarify)
                    throw new InvalidOperationException("An ambiguous inherited subject did not clarify.");
            }).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "application-context-filter-preserves-impact",
            ["Answer", "Answer"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var second = await AnswerTurnAsync(
                    harness,
                    "What about only Teamcenter impacts?",
                    "turn-c-2",
                    firstTurn.ContinuationState,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.Disposition != AnswerDisposition.Answer ||
                    !second.Impacts.Select(impact => impact.ClaimId)
                        .SequenceEqual(firstTurn.Impacts.Select(impact => impact.ClaimId), StringComparer.Ordinal))
                    throw new InvalidOperationException(
                        "The application-context follow-up changed the authoritative PLM impact claims.");
            },
            expectedEntityResolutionCalls: 2,
            expectedEvidenceRetrievalCalls: 2).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "expired-state-not-inherited",
            ["Answer", "Clarify"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var expired = firstTurn.ContinuationState! with { ExpiresAt = EvaluationNow.AddSeconds(-1) };
                var second = await AnswerTurnAsync(
                    harness,
                    "Why is it impacted?",
                    "turn-d-2",
                    expired,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.Disposition != AnswerDisposition.Clarify)
                    throw new InvalidOperationException("An expired conversation state was used for a follow-up.");
            }).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "owner-mismatch-not-inherited",
            ["Answer", "Clarify"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var otherOwner = firstTurn.ContinuationState! with { OwnerFingerprint = new string('0', 64) };
                var second = await AnswerTurnAsync(
                    harness,
                    "Why is it impacted?",
                    "turn-e-2",
                    otherOwner,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.Disposition != AnswerDisposition.Clarify)
                    throw new InvalidOperationException("Conversation state from another owner was used.");
            }).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "investigation-mismatch-not-inherited",
            ["Answer", "Clarify"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var otherInvestigation = firstTurn.ContinuationState! with { InvestigationId = "INV-EVAL-OTHER" };
                var second = await AnswerTurnAsync(
                    harness,
                    "Why is it impacted?",
                    "turn-f-2",
                    otherInvestigation,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.Disposition != AnswerDisposition.Clarify)
                    throw new InvalidOperationException("Conversation state from another investigation was used.");
            }).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "deleted-subject-not-reused",
            ["Answer", "Clarify"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var deletedSubject = firstTurn.ContinuationState! with
                {
                    CurrentSubjectIds = ["REQ-404"],
                    CurrentValidatedEntityRefs =
                    [
                        new ValidatedEntityReference("REQ-404", "Requirement", "Codebeamer")
                    ]
                };
                var second = await AnswerTurnAsync(
                    harness,
                    "Why is it impacted?",
                    "turn-g-2",
                    deletedSubject,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.Disposition != AnswerDisposition.Clarify)
                    throw new InvalidOperationException("A missing current subject was answered from stale state.");
            }).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "application-context-filter-replaces-prior-context",
            ["Answer", "Answer"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var priorFilter = firstTurn.ContinuationState! with
                {
                    ApplicationFilters = new ConversationApplicationFilters([], ["Windchill"])
                };
                var second = await AnswerTurnAsync(
                    harness,
                    "What about only Teamcenter impacts?",
                    "turn-h-2",
                    priorFilter,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (second.Disposition != AnswerDisposition.Answer ||
                    !second.Impacts.Select(impact => impact.ClaimId)
                        .SequenceEqual(firstTurn.Impacts.Select(impact => impact.ClaimId), StringComparer.Ordinal))
                    throw new InvalidOperationException(
                        "A new application-context preference changed the authoritative PLM impact claims.");
            },
            expectedEntityResolutionCalls: 2,
            expectedEvidenceRetrievalCalls: 2).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "conversation-A-application-context-prefix",
            ["Answer", "Answer"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var filtered = await AnswerTurnAsync(
                    harness,
                    "What about only Teamcenter impacts?",
                    "turn-conversation-a-2",
                    firstTurn.ContinuationState,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (filtered.Disposition != AnswerDisposition.Answer ||
                    !filtered.Impacts.Select(impact => impact.ClaimId)
                        .SequenceEqual(firstTurn.Impacts.Select(impact => impact.ClaimId), StringComparer.Ordinal))
                    throw new InvalidOperationException(
                        "The conversation application-context preference changed the authoritative PLM impact claims.");
            },
            expectedEntityResolutionCalls: 2,
            expectedEvidenceRetrievalCalls: 2).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "conversation-B-explicit-subject-switch",
            ["Answer", "Clarify", "Answer"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var changedSubject = await AnswerTurnAsync(
                    harness,
                    "What is impacted if Requirement R-456 changes?",
                    "turn-conversation-b-2",
                    firstTurn.ContinuationState,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (changedSubject.Disposition != AnswerDisposition.Clarify)
                    throw new InvalidOperationException("An unresolved explicit subject switch was not clarified.");
                var returnedSubject = await AnswerTurnAsync(
                    harness,
                    "What is impacted if Requirement R-123 changes?",
                    "turn-conversation-b-3",
                    null,
                    null,
                    cancellationToken);
                if (returnedSubject.Disposition != AnswerDisposition.Answer ||
                    returnedSubject.ContinuationState?.CurrentSubjectIds.SingleOrDefault() != "REQ-123")
                    throw new InvalidOperationException("The explicit return to R-123 did not resolve as a fresh impact turn.");
            },
            expectedEntityResolutionCalls: 3,
            expectedEvidenceRetrievalCalls: 2).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "conversation-C-clarification-response",
            ["Answer", "Answer"],
            "What is impacted?",
            async (harness, _) =>
            {
                var clarified = await AnswerTurnAsync(
                    harness,
                    "I meant Requirement R-123.",
                    "turn-conversation-c-2",
                    null,
                    null,
                    cancellationToken);
                if (clarified.Disposition != AnswerDisposition.Answer)
                    throw new InvalidOperationException("An explicit clarification response did not resolve as a fresh impact turn.");
            },
            expectedEntityResolutionCalls: 1,
            expectedEvidenceRetrievalCalls: 2).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "conversation-D-ambiguous-parts",
            ["Answer", "Clarify"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                var ambiguousParts = firstTurn.ContinuationState! with
                {
                    CurrentValidatedEntityRefs =
                    [
                        new ValidatedEntityReference("PART-1", "Part", "Windchill"),
                        new ValidatedEntityReference("PART-2", "Part", "Teamcenter")
                    ]
                };
                var clarification = await AnswerTurnAsync(
                    harness,
                    "Explain those parts.",
                    "turn-conversation-d-2",
                    ambiguousParts,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (clarification.Disposition != AnswerDisposition.Clarify)
                    throw new InvalidOperationException("Plural reference to multiple validated parts did not clarify.");
            },
            expectedEntityResolutionCalls: 1,
            expectedEvidenceRetrievalCalls: 1).ConfigureAwait(false);

        await EvaluateSequenceAsync(
            "conversation-E-source-version-change",
            ["Answer", "Answer"],
            "What is impacted if Requirement R-123 changes?",
            async (harness, firstTurn) =>
            {
                harness.EvidenceSource.NextSourceVersion = "source-v2";
                var followUp = await AnswerTurnAsync(
                    harness,
                    "Why is it impacted?",
                    "turn-conversation-e-2",
                    firstTurn.ContinuationState,
                    firstTurn.ContinuationState?.PreviousTurnId,
                    cancellationToken);
                if (followUp.ContinuationState?.SourceVersion != "source-v2" ||
                    !harness.Telemetry.StateInvalidations.Contains(ConversationStateInvalidationReason.SourceVersionChanged))
                    throw new InvalidOperationException("A fresh source version was not captured and reported after retrieval.");
            },
            expectedEntityResolutionCalls: 2,
            expectedEvidenceRetrievalCalls: 2).ConfigureAwait(false);

        var flattenedDispositions = cases.SelectMany(item => item.ActualDispositions).ToArray();
        return new ConversationSequenceEvaluationReport(
            cases.Count,
            cases.Count(item => item.Passed),
            cases.Count(item => !item.Passed),
            flattenedDispositions.Length,
            cases.Sum(item => Math.Max(0, item.ActualDispositions.Count - 1)),
            cases.Sum(item => item.FollowUpRetrievalCount),
            flattenedDispositions.Count(disposition => disposition == "Clarify"),
            cases.Sum(item => item.StateInvalidations.Count),
            cases.Sum(item => item.ParentTurnCorrelationCount),
            cases);

        async Task EvaluateSequenceAsync(
            string sequenceId,
            IReadOnlyList<string> expectedDispositions,
            string firstQuestion,
            Func<ConversationSequenceHarness, ImpactAnswerResult, Task> execute,
            int? expectedEntityResolutionCalls = null,
            int? expectedEvidenceRetrievalCalls = null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var harness = CreateConversationSequenceHarness(templateCase, fixture, sequenceId);
            var first = await AnswerTurnAsync(
                harness,
                firstQuestion,
                $"turn-{sequenceId}-1",
                null,
                null,
                cancellationToken).ConfigureAwait(false);
            var actualDispositions = new List<string> { first.Disposition.ToString() };
            if (!string.Equals(actualDispositions[0], expectedDispositions[0], StringComparison.Ordinal))
            {
                var reason = $"Expected first disposition {expectedDispositions[0]}, got {actualDispositions[0]}.";
                cases.Add(new ConversationSequenceEvaluationCase(
                    sequenceId,
                    false,
                    expectedDispositions,
                    actualDispositions,
                    harness.Resolver.CallCount,
                    harness.EvidenceSource.CallCount,
                    harness.ModelGateway.CallCount,
                    harness.Telemetry.StateInvalidations.Select(item => item.ToString()).ToArray(),
                    harness.Telemetry.Turns.Count(turn => turn.ParentTurnCorrelated),
                    harness.Telemetry.FollowUpRetrievalCount,
                    reason));
                return;
            }
            string? failureReason = null;
            try
            {
                await execute(harness, first).ConfigureAwait(false);
                actualDispositions = harness.TurnDispositions.Select(disposition => disposition.ToString()).ToList();
                if (!actualDispositions.SequenceEqual(expectedDispositions, StringComparer.Ordinal))
                    failureReason = $"Expected dispositions [{string.Join(", ", expectedDispositions)}], got [{string.Join(", ", actualDispositions)}].";
            }
            catch (Exception exception) when (exception is InvalidOperationException or ArgumentException)
            {
                failureReason = exception.Message;
                actualDispositions = harness.TurnDispositions.Select(disposition => disposition.ToString()).ToList();
                if (actualDispositions.Count == 1) actualDispositions.Add("Failed");
            }

            var expectedEntityCalls = expectedEntityResolutionCalls ?? (sequenceId is "supported-explanation-follow-up" or "deleted-subject-not-reused"
                ? 2
                : 1);
            if (harness.Resolver.CallCount != expectedEntityCalls)
                failureReason ??= $"Expected {expectedEntityCalls} entity resolutions, got {harness.Resolver.CallCount}.";
            var expectedEvidenceCalls = expectedEvidenceRetrievalCalls ?? (sequenceId is "supported-explanation-follow-up"
                ? 2
                : 1);
            if (harness.EvidenceSource.CallCount != expectedEvidenceCalls)
                failureReason ??= $"Expected {expectedEvidenceCalls} evidence retrievals, got {harness.EvidenceSource.CallCount}.";
            if (harness.ModelGateway.CallCount != expectedEvidenceCalls)
                failureReason ??= $"Expected {expectedEvidenceCalls} model calls, got {harness.ModelGateway.CallCount}.";
            cases.Add(new ConversationSequenceEvaluationCase(
                sequenceId,
                failureReason is null,
                expectedDispositions,
                actualDispositions,
                harness.Resolver.CallCount,
                harness.EvidenceSource.CallCount,
                harness.ModelGateway.CallCount,
                harness.Telemetry.StateInvalidations.Select(reason => reason.ToString()).ToArray(),
                harness.Telemetry.Turns.Count(turn => turn.ParentTurnCorrelated),
                harness.Telemetry.FollowUpRetrievalCount,
                failureReason));
        }
    }

    private static ConversationSequenceHarness CreateConversationSequenceHarness(
        EvaluationCase templateCase,
        EvaluationFixture fixture,
        string sequenceId)
    {
        var requestContext = new RuntimeRequestContext(
            $"eval-sequence-{sequenceId}",
            $"eval-sequence-trace-{sequenceId}",
            null,
            $"eval-conversation-{sequenceId}");
        var decisionId = $"eval-decision-{sequenceId}";
        var expiration = EvaluationNow.AddMinutes(1);
        var authorizationScope = new AuthorizationScope(
            "synthetic-tenant",
            "synthetic-evaluator",
            "fixture-policy-v1",
            decisionId,
            new HashSet<string>([ResolveGrant, ReadEvidenceGrant], StringComparer.Ordinal),
            expiration);
        var authorization = new AuthorizationContext(authorizationScope, $"fixture-token-{sequenceId}", expiration);
        var timeProvider = new FixedTimeProvider(EvaluationNow);
        var evidence = BuildEvidence(templateCase, fixture, decisionId, requestContext);
        var resolver = new FixtureEntityResolver(templateCase, fixture);
        var evidenceSource = new FixtureEvidenceSource(evidence, updateRequestContext: true);
        var modelGateway = new FixtureModelGateway(fixture.ModelResponses.GetValueOrDefault("direct"));
        var telemetry = new ConversationSequenceTelemetry();
        var scopePlanner = new RecordingScopePlanner(new ScopePlanner());
        var service = new ImpactAnswerService(
            new QuestionInterpreter(),
            new ConversationTurnInterpreter(timeProvider),
            resolver,
            scopePlanner,
            evidenceSource,
            new EvaluationUnavailableSourceEvidenceRetriever(),
            new Lattice.AI.Runtime.FactEvidence.UnavailableFactEvidenceRetriever(),
            new Lattice.AI.Runtime.ApplicationContext.UnavailableApplicationContextRetriever(),
            new RecordingContextCompiler(new ContextCompiler()),
            new SourceControlledPromptCatalog(),
            new PromptAssembler(),
            modelGateway,
            new AnswerCandidateParser(),
            new AnswerValidator(timeProvider),
            new ModelConfiguration("evaluation-model", "offline-fixture", "deterministic-fake", "offline-fixture", 256, 4096),
            timeProvider,
            telemetry,
            new ConversationStateRetentionOptions { LifetimeSeconds = 3600 });
        return new ConversationSequenceHarness(
            service,
            resolver,
            evidenceSource,
            modelGateway,
            authorization,
            telemetry,
            requestContext,
            requestContext.ConversationId!,
            templateCase.InvestigationId);
    }

    private static async Task<ImpactAnswerResult> AnswerTurnAsync(
        ConversationSequenceHarness harness,
        string question,
        string turnId,
        ConversationState? previousState,
        string? parentTurnId,
        CancellationToken cancellationToken)
    {
        var requestContext = harness.RequestContext with { TurnId = turnId };
        var request = new ImpactAnswerRequest(
            harness.InvestigationId,
            question,
            harness.ConversationId)
        {
            ParentTurnId = parentTurnId,
            PreviousConversationState = previousState
        };
        var result = await harness.Service.AnswerAsync(
            request,
            harness.Authorization,
            requestContext,
            cancellationToken).ConfigureAwait(false);
        harness.TurnDispositions.Add(result.Disposition);
        return result;
    }

    private static async Task<EngineeringImpactEvaluationCaseResult> EvaluateCaseAsync(
        EvaluationCase evaluationCase,
        EvaluationFixture fixture,
        CancellationToken cancellationToken)
    {
        var requestContext = new RuntimeRequestContext(
            $"eval-request-{evaluationCase.CaseId}",
            $"eval-trace-{evaluationCase.CaseId}",
            null,
            $"eval-conversation-{evaluationCase.CaseId}");
        var decisionId = $"eval-decision-{evaluationCase.CaseId}";
        var grants = evaluationCase.AuthorizationScenario == "denied"
            ? new HashSet<string>(StringComparer.Ordinal)
            : new HashSet<string>([ResolveGrant, ReadEvidenceGrant], StringComparer.Ordinal);
        var expiration = evaluationCase.AuthorizationScenario == "expired"
            ? EvaluationNow.AddSeconds(-1)
            : EvaluationNow.AddMinutes(1);
        var authorizationScope = new AuthorizationScope(
            "synthetic-tenant",
            "synthetic-evaluator",
            "fixture-policy-v1",
            decisionId,
            grants,
            expiration);
        var authorization = new AuthorizationContext(authorizationScope, $"fixture-token-{evaluationCase.CaseId}", expiration);
        var timeProvider = new FixedTimeProvider(EvaluationNow);

        var evidenceResult = BuildEvidence(evaluationCase, fixture, decisionId, requestContext);
        var resolver = new FixtureEntityResolver(evaluationCase, fixture);
        var evidenceSource = new FixtureEvidenceSource(evidenceResult);
        var modelGateway = new FixtureModelGateway(fixture.ModelResponses.GetValueOrDefault(evaluationCase.ModelResponseKey ?? string.Empty));
        var questionInterpreter = new QuestionInterpreter();
        var answerRequest = new ImpactAnswerRequest(
            evaluationCase.RequestInvestigationId!,
            evaluationCase.Question,
            requestContext.ConversationId);
        var interpretation = questionInterpreter.Interpret(answerRequest, requestContext);
        var scopePlanner = new RecordingScopePlanner(new ScopePlanner());
        var contextCompiler = new RecordingContextCompiler(new ContextCompiler());
        var service = new ImpactAnswerService(
            questionInterpreter,
            new ConversationTurnInterpreter(),
            resolver,
            scopePlanner,
            evidenceSource,
            new EvaluationUnavailableSourceEvidenceRetriever(),
            new Lattice.AI.Runtime.FactEvidence.UnavailableFactEvidenceRetriever(),
            new Lattice.AI.Runtime.ApplicationContext.UnavailableApplicationContextRetriever(),
            contextCompiler,
            new SourceControlledPromptCatalog(),
            new PromptAssembler(),
            modelGateway,
            new AnswerCandidateParser(),
            new AnswerValidator(timeProvider),
            new ModelConfiguration("evaluation-model", "offline-fixture", "deterministic-fake", "offline-fixture", 256, 4096),
            timeProvider);

        ImpactAnswerResult result;
        try
        {
            result = await service.AnswerAsync(
                answerRequest,
                authorization,
                requestContext,
                cancellationToken).ConfigureAwait(false);
        }
        catch (ArgumentException) when (string.IsNullOrWhiteSpace(evaluationCase.RequestInvestigationId))
        {
            result = new ImpactAnswerResult(
                evaluationCase.InvestigationId,
                requestContext,
                AnswerDisposition.Deny,
                null,
                [],
                [],
                [new ValidationIssue("missing-investigation", "An active investigation is required.")],
                null);
        }

        var actualAuthorizationScenario = resolver.DenialScenario
            ?? (evidenceSource.LastResult is not null &&
                !string.Equals(
                    evidenceSource.LastResult.InvestigationId,
                    evaluationCase.RequestInvestigationId,
                    StringComparison.Ordinal)
                ? "investigation-mismatch"
                : expiration <= EvaluationNow
                    ? "expired"
                    : grants.Count == 0
                        ? "denied"
                        : string.IsNullOrWhiteSpace(evaluationCase.RequestInvestigationId)
                            ? "missing-investigation"
                            : "allowed");

        var actualSubjectId = resolver.ResolvedEntity?.CanonicalId;
        var actualRelationshipIds = new HashSet<string>(StringComparer.Ordinal);
        var actualEntityIds = new HashSet<string>(StringComparer.Ordinal);
        var actualPathIds = new HashSet<string>(StringComparer.Ordinal);
        var actualChainIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var impact in result.Impacts)
        {
            if (impact.ClaimId.StartsWith("relationship:", StringComparison.Ordinal))
            {
                var relationshipId = impact.ClaimId["relationship:".Length..];
                actualRelationshipIds.Add(relationshipId);
                var relationship = fixture.Relationships.FirstOrDefault(item =>
                    string.Equals(item.RelationshipId, relationshipId, StringComparison.Ordinal));
                if (relationship is not null)
                {
                    actualEntityIds.Add(relationship.SourceEntityId);
                    actualEntityIds.Add(relationship.TargetEntityId);
                }
            }
            else if (impact.ClaimId.StartsWith("path:", StringComparison.Ordinal))
            {
                var pathId = impact.ClaimId["path:".Length..];
                actualPathIds.Add(pathId);
                var path = fixture.Paths.FirstOrDefault(item => string.Equals(item.PathId, pathId, StringComparison.Ordinal));
                if (path is not null)
                {
                    actualEntityIds.UnionWith(path.EntityIds);
                    actualRelationshipIds.UnionWith(path.RelationshipIds);
                }
            }
            else
            {
                var chain = fixture.Chains.FirstOrDefault(item =>
                    string.Equals(item.ChainId, impact.ClaimId, StringComparison.Ordinal));
                if (chain is not null)
                {
                    actualChainIds.Add(chain.ChainId);
                    actualEntityIds.Add(chain.SourceEntityId);
                    actualEntityIds.Add(chain.ImpactedEntityId);
                    actualRelationshipIds.UnionWith(chain.RelationshipIds);
                }
            }
        }

        if (actualSubjectId is not null)
        {
            actualEntityIds.Add(actualSubjectId);
        }

        var actualEvidenceIds = result.Impacts
            .SelectMany(impact => impact.EvidenceIds)
            .Concat(result.Sources.Select(source => source.EvidenceId))
            .ToHashSet(StringComparer.Ordinal);
        var actualSourceIds = result.Impacts.SelectMany(impact => impact.SourceIds).ToHashSet(StringComparer.Ordinal);
        var actualSourceRefIds = result.Sources
            .SelectMany(GetSourceReferenceIds)
            .ToHashSet(StringComparer.Ordinal);
        var actualLinkIds = result.Sources
            .Where(source => !string.IsNullOrWhiteSpace(source.DeepLink))
            .Select(source => source.DeepLink!)
            .ToHashSet(StringComparer.Ordinal);
        var coveredPathIds = evaluationCase.Expected.RequiredPathIds
            .Where(actualPathIds.Contains)
            .Order(StringComparer.Ordinal)
            .ToArray();
        var unsupportedClaims = result.Issues
            .Where(issue => UnsupportedClaimIssueCodes.Contains(issue.Code))
            .Select(issue => issue.ClaimId ?? issue.Code)
            .Distinct(StringComparer.Ordinal)
            .Count();
        var modelClaimCount = modelGateway.CallCount == 0 || modelGateway.Content is null
            ? 0
            : CountModelClaims(modelGateway.Content);
        var actualQuestionIntent = interpretation.Type switch
        {
            ImpactQuestionType.EngineeringImpact => "engineering-impact",
            ImpactQuestionType.InvestigationQuestion => "investigation-question",
            _ => "unsupported"
        };
        var actualClarificationRequired = result.Disposition == AnswerDisposition.Clarify;
        var actualScope = scopePlanner.LastResult?.Scope;
        var actualScopeRelationshipTypes = Sorted(actualScope?.RelationshipTypes ?? new HashSet<string>(StringComparer.Ordinal));
        var actualScopeSourceSystems = Sorted(actualScope?.SourceSystems ?? new HashSet<string>(StringComparer.Ordinal));
        var actualOmittedClaimIds = Sorted(contextCompiler.LastResult?.Package?.Omissions
            .Where(omission => omission.Kind == ContextOmissionKind.Claim)
            .Select(omission => omission.ClaimId)
            ?? Enumerable.Empty<string>());
        bool? actualModelJsonParseSucceeded = modelGateway.CallCount == 0
            ? null
            : !result.Issues.Any(issue => string.Equals(issue.Code, "invalid-model-output", StringComparison.Ordinal));
        bool? actualUnsupportedReferenceRejected = modelGateway.CallCount == 0 ||
                                                   evaluationCase.Expected.UnsupportedReferenceRejected is null
            ? null
            : unsupportedClaims > 0;
        var authorizationDenied =
            evaluationCase.AuthorizationScenario is
                "denied" or "expired" or "revoked" or "missing-investigation" or "investigation-mismatch" &&
            !string.Equals(
                evaluationCase.EvidenceMode,
                "evidence-investigation-mismatch",
                StringComparison.Ordinal);
        var failures = new List<string>();
        if (result.Disposition != evaluationCase.Expected.Disposition)
        {
            failures.Add($"Disposition expected {evaluationCase.Expected.Disposition}, got {result.Disposition}.");
        }
        if (!string.Equals(actualAuthorizationScenario, evaluationCase.Expected.AuthorizationScenario, StringComparison.Ordinal))
        {
            failures.Add(
                $"Authorization scenario expected '{evaluationCase.Expected.AuthorizationScenario}', got '{actualAuthorizationScenario}'.");
        }
        if (!string.Equals(actualSubjectId, evaluationCase.Expected.SubjectId, StringComparison.Ordinal))
        {
            failures.Add($"Subject expected '{evaluationCase.Expected.SubjectId ?? "<none>"}', got '{actualSubjectId ?? "<none>"}'.");
        }
        if (!string.Equals(
                interpretation.CandidateEntityId,
                evaluationCase.Expected.ExtractedSubjectId,
                StringComparison.Ordinal))
        {
            failures.Add(
                $"Extracted subject expected '{evaluationCase.Expected.ExtractedSubjectId ?? "<none>"}', got '{interpretation.CandidateEntityId ?? "<none>"}'.");
        }
        if (!string.Equals(actualQuestionIntent, evaluationCase.Expected.QuestionIntent, StringComparison.Ordinal))
        {
            failures.Add(
                $"Question intent expected '{evaluationCase.Expected.QuestionIntent}', got '{actualQuestionIntent}'.");
        }
        if (actualClarificationRequired != evaluationCase.Expected.ClarificationRequired)
        {
            failures.Add(
                $"Clarification expected {evaluationCase.Expected.ClarificationRequired}, got {actualClarificationRequired}.");
        }
        if (actualScope?.MaxHops != evaluationCase.Expected.ScopeMaxHops ||
            !SameIds(actualScopeRelationshipTypes, evaluationCase.Expected.ScopeRelationshipTypes) ||
            !SameIds(actualScopeSourceSystems, evaluationCase.Expected.ScopeSourceSystems))
        {
            failures.Add("The selected scope does not match the annotated bounded Phase 1 scope policy.");
        }
        if (actualModelJsonParseSucceeded != evaluationCase.Expected.ParseSucceeded)
        {
            failures.Add(
                $"Model JSON parse result expected '{evaluationCase.Expected.ParseSucceeded}', got '{actualModelJsonParseSucceeded}'.");
        }
        if (actualUnsupportedReferenceRejected != evaluationCase.Expected.UnsupportedReferenceRejected)
        {
            failures.Add(
                $"Unsupported-reference rejection expected '{evaluationCase.Expected.UnsupportedReferenceRejected}', got '{actualUnsupportedReferenceRejected}'.");
        }
        if (!SameIds(actualOmittedClaimIds, evaluationCase.Expected.ExpectedOmittedClaimIds))
        {
            failures.Add("The omitted claim IDs do not match the annotated context-budget behavior.");
        }
        if (evaluationCase.Expected.OmissionBehaviorCorrect !=
            SameIds(actualOmittedClaimIds, evaluationCase.Expected.ExpectedOmittedClaimIds))
        {
            failures.Add("The annotated omission behavior does not match the actual omitted claim IDs.");
        }

        CompareIds("entity", evaluationCase.Expected.RequiredEntityIds, actualEntityIds, failures);
        CompareForbiddenIds("entity", evaluationCase.Expected.ForbiddenEntityIds, actualEntityIds, failures);
        CompareIds("relationship", evaluationCase.Expected.RequiredRelationshipIds, actualRelationshipIds, failures);
        CompareForbiddenIds("relationship", evaluationCase.Expected.ForbiddenRelationshipIds, actualRelationshipIds, failures);
        CompareIds("evidence", evaluationCase.Expected.RequiredEvidenceIds, actualEvidenceIds, failures);
        CompareForbiddenIds("evidence", evaluationCase.Expected.ForbiddenEvidenceIds, actualEvidenceIds, failures);
        CompareIds("source", evaluationCase.Expected.RequiredSourceIds, actualSourceIds, failures);
        CompareForbiddenIds("source", evaluationCase.Expected.ForbiddenSourceIds, actualSourceIds, failures);
        CompareIds("source reference", evaluationCase.Expected.RequiredSourceRefIds, actualSourceRefIds, failures);
        CompareForbiddenIds("source reference", evaluationCase.Expected.ForbiddenSourceRefIds, actualSourceRefIds, failures);
        CompareIds("link", evaluationCase.Expected.RequiredLinkIds, actualLinkIds, failures);
        CompareForbiddenIds("link", evaluationCase.Expected.ForbiddenLinkIds, actualLinkIds, failures);
        CompareIds("path", evaluationCase.Expected.RequiredPathIds, actualPathIds, failures);

        if (evaluationCase.Expected.NoEvidenceLeakage &&
            (result.Impacts.Count != 0 || result.Sources.Count != 0))
        {
            failures.Add("The case expected no evidence or impact claims in the answer, but evidence was returned.");
        }
        if (evaluationCase.Expected.NoEvidenceAccess && evidenceSource.CallCount != 0)
        {
            failures.Add($"The case expected zero evidence retrieval calls, got {evidenceSource.CallCount}.");
        }
        if (modelGateway.CallCount != evaluationCase.Expected.ModelCalls)
        {
            failures.Add($"Model calls expected {evaluationCase.Expected.ModelCalls}, got {modelGateway.CallCount}.");
        }

        return new EngineeringImpactEvaluationCaseResult(
            evaluationCase.CaseId,
            evaluationCase.Scenario,
            evaluationCase.Required,
            failures.Count == 0,
            failures.Count == 0 ? null : string.Join(" ", failures),
            evaluationCase.InvestigationId,
            evaluationCase.RequestInvestigationId,
            evaluationCase.Expected.ExtractedSubjectId,
            interpretation.CandidateEntityId,
            evaluationCase.Expected.Disposition,
            result.Disposition,
            evaluationCase.Expected.AuthorizationScenario,
            actualAuthorizationScenario,
            evaluationCase.Expected.SubjectId,
            actualSubjectId,
            evaluationCase.Expected.RequiredEntityIds,
            Sorted(actualEntityIds),
            evaluationCase.Expected.ForbiddenEntityIds,
            evaluationCase.Expected.RequiredRelationshipIds,
            Sorted(actualRelationshipIds),
            evaluationCase.Expected.ForbiddenRelationshipIds,
            evaluationCase.Expected.RequiredEvidenceIds,
            Sorted(actualEvidenceIds),
            evaluationCase.Expected.ForbiddenEvidenceIds,
            evaluationCase.Expected.RequiredSourceIds,
            Sorted(actualSourceIds),
            evaluationCase.Expected.ForbiddenSourceIds,
            evaluationCase.Expected.RequiredSourceRefIds,
            Sorted(actualSourceRefIds),
            evaluationCase.Expected.ForbiddenSourceRefIds,
            evaluationCase.Expected.RequiredLinkIds,
            Sorted(actualLinkIds),
            evaluationCase.Expected.ForbiddenLinkIds,
            evaluationCase.Expected.RequiredPathIds,
            coveredPathIds,
            evidenceSource.CallCount,
            modelGateway.CallCount,
            modelClaimCount,
            unsupportedClaims,
            result.Issues.Select(issue => issue.Code).Order(StringComparer.Ordinal).ToArray(),
            evaluationCase.Expected.QuestionIntent,
            actualQuestionIntent,
            evaluationCase.Expected.ClarificationRequired,
            actualClarificationRequired,
            evaluationCase.Expected.ScopeMaxHops,
            actualScope?.MaxHops,
            evaluationCase.Expected.ScopeRelationshipTypes,
            actualScopeRelationshipTypes,
            evaluationCase.Expected.ScopeSourceSystems,
            actualScopeSourceSystems,
            evaluationCase.Expected.RequiredChainIds,
            Sorted(actualChainIds),
            evaluationCase.Expected.ExpectedOmittedClaimIds,
            actualOmittedClaimIds,
            evaluationCase.Expected.ParseSucceeded,
            actualModelJsonParseSucceeded,
            evaluationCase.Expected.UnsupportedReferenceRejected,
            actualUnsupportedReferenceRejected,
            authorizationDenied);
    }

    private static EvidenceRetrievalResult BuildEvidence(
        EvaluationCase evaluationCase,
        EvaluationFixture fixture,
        string decisionId,
        RuntimeRequestContext requestContext)
    {
        var relationships = new List<RelationshipEvidence>();
        var paths = new List<ImpactPathEvidence>();
        var sources = new List<EvidenceSourceReference>();
        var chains = new List<ImpactChainEvidence>();

        switch (evaluationCase.EvidenceMode)
        {
            case "direct":
                relationships.AddRange(fixture.Relationships);
                sources.AddRange(fixture.Sources.Select(item => item with { AuthorizationDecisionId = decisionId }));
                break;
            case "multi-hop":
                relationships.AddRange(fixture.Relationships);
                paths.AddRange(fixture.Paths.Where(item => item.PathId == "PATH-HOP-001"));
                sources.AddRange(fixture.Sources.Select(item => item with { AuthorizationDecisionId = decisionId }));
                break;
            case "empty":
                break;
            case "missing-provenance":
                relationships.AddRange(fixture.Relationships.Where(item => item.RelationshipId == "REL-DIRECT-001"));
                sources.AddRange(fixture.Sources
                    .Where(item => item.EvidenceId == "EVIDENCE-DIRECT-001")
                    .Select(item => item with { ProvenanceId = "", AuthorizationDecisionId = decisionId }));
                break;
            case "budget-pressure":
                relationships.Add(new RelationshipEvidence(
                    "REL-BUDGET-001",
                    fixture.SubjectId,
                    "ENTITY-BUDGET-001",
                    "depends-on",
                    new string('x', 50_000),
                    ["EVIDENCE-BUDGET-001"]));
                sources.Add(new EvidenceSourceReference(
                    "EVIDENCE-BUDGET-001",
                    "relationship",
                    "synthetic-plm",
                    "RECORD-BUDGET-001",
                    "fixture-revision",
                    null,
                    "https://plm.example.test/records/RECORD-BUDGET-001",
                    "PROV-BUDGET-001",
                    decisionId,
                    "CITATION-BUDGET-001",
                    "synthetic-authority",
                    "synthetic-plm"));
                break;
            case "evidence-investigation-mismatch":
                relationships.AddRange(fixture.Relationships.Where(item => item.RelationshipId == "REL-DIRECT-001"));
                sources.AddRange(fixture.Sources
                    .Where(item => item.EvidenceId == "EVIDENCE-DIRECT-001")
                    .Select(item => item with { AuthorizationDecisionId = decisionId }));
                break;
            default:
                throw new InvalidDataException(
                    $"Case '{evaluationCase.CaseId}' has unsupported evidenceMode '{evaluationCase.EvidenceMode}'.");
        }

        var investigationId = evaluationCase.EvidenceMode == "evidence-investigation-mismatch"
            ? "INV-EVAL-OTHER"
            : fixture.InvestigationId;
        return new EvidenceRetrievalResult(
            investigationId,
            relationships,
            paths,
            chains,
            sources,
            fixture.SourceVersion,
            fixture.OntologyVersion,
            decisionId,
            requestContext.RequestId,
            requestContext.TraceId);
    }

    private static int CountModelClaims(string content)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            return document.RootElement.TryGetProperty("impacts", out var impacts) &&
                   impacts.ValueKind == JsonValueKind.Array
                ? impacts.GetArrayLength()
                : 0;
        }
        catch (JsonException)
        {
            return 0;
        }
    }

    private static EvaluationRate CalculateAccuracy(
        IReadOnlyList<EngineeringImpactEvaluationCaseResult> results,
        Func<EngineeringImpactEvaluationCaseResult, bool> matches)
    {
        var correct = results.Count(matches);
        return new EvaluationRate(
            correct,
            results.Count,
            results.Count == 0 ? null : (double)correct / results.Count);
    }

    private static EvaluationRate CalculateCoverage(
        IReadOnlyList<EngineeringImpactEvaluationCaseResult> results,
        Func<EngineeringImpactEvaluationCaseResult, IReadOnlyList<string>> expectedIds,
        Func<EngineeringImpactEvaluationCaseResult, IReadOnlyList<string>> actualIds)
    {
        var expectedCount = 0;
        var coveredCount = 0;
        foreach (var result in results)
        {
            var actual = actualIds(result).ToHashSet(StringComparer.Ordinal);
            foreach (var expectedId in expectedIds(result))
            {
                expectedCount++;
                if (actual.Contains(expectedId))
                {
                    coveredCount++;
                }
            }
        }

        return new EvaluationRate(
            coveredCount,
            expectedCount,
            expectedCount == 0 ? null : (double)coveredCount / expectedCount);
    }

    private static bool ScopePolicyMatches(EngineeringImpactEvaluationCaseResult result) =>
        result.ExpectedScopeMaxHops == result.ActualScopeMaxHops &&
        SameIds(result.ExpectedScopeRelationshipTypes, result.ActualScopeRelationshipTypes) &&
        SameIds(result.ExpectedScopeSourceSystems, result.ActualScopeSourceSystems);

    private static bool SameIds(IEnumerable<string> left, IEnumerable<string> right) =>
        left.Order(StringComparer.Ordinal).SequenceEqual(right.Order(StringComparer.Ordinal), StringComparer.Ordinal);

    private static void CompareIds(
        string idType,
        IReadOnlyList<string> expected,
        IReadOnlySet<string> actual,
        ICollection<string> failures)
    {
        var missing = expected.Where(id => !actual.Contains(id)).Order(StringComparer.Ordinal).ToArray();
        if (missing.Length > 0)
        {
            failures.Add($"Missing required {idType} IDs: {string.Join(", ", missing)}.");
        }
    }

    private static void CompareForbiddenIds(
        string idType,
        IReadOnlyList<string> forbidden,
        IReadOnlySet<string> actual,
        ICollection<string> failures)
    {
        var found = forbidden.Where(actual.Contains).Order(StringComparer.Ordinal).ToArray();
        if (found.Length > 0)
        {
            failures.Add($"Forbidden {idType} IDs were returned: {string.Join(", ", found)}.");
        }
    }

    private static IEnumerable<string> GetSourceReferenceIds(EvidenceSourceReference source)
    {
        yield return source.EvidenceId;
        yield return source.RecordId;
        yield return source.ProvenanceId;
        if (!string.IsNullOrWhiteSpace(source.CitationId))
        {
            yield return source.CitationId;
        }
    }

    private static string[] Sorted(IEnumerable<string> values) =>
        values.Order(StringComparer.Ordinal).ToArray();

    private static Manifest ReadManifest(string manifestPath)
    {
        var root = ParseJsonFile(manifestPath, "manifest");
        EnsureProperties(root,
            ["schemaVersion", "datasetId", "casesFile", "fixtureFiles", "caseCount",
                "minimumPathCoverage", "minimumLinkCoverage"],
            "manifest");
        var schemaVersion = ReadString(root, "schemaVersion");
        if (schemaVersion != "engineering-impact-evals/v1")
        {
            throw new InvalidDataException($"Unsupported evaluation dataset schemaVersion '{schemaVersion}'.");
        }

        var caseCount = ReadInt(root, "caseCount");
        if (caseCount is < 1 or > MaximumCaseCount)
        {
            throw new InvalidDataException($"Manifest caseCount must be between 1 and {MaximumCaseCount}.");
        }

        var fixtureFiles = ReadStringArray(root, "fixtureFiles");
        if (fixtureFiles.Count == 0)
        {
            throw new InvalidDataException("Manifest fixtureFiles must contain at least one path.");
        }

        return new Manifest(
            ReadString(root, "datasetId"),
            ReadString(root, "casesFile"),
            fixtureFiles,
            caseCount,
            ReadRate(root, "minimumPathCoverage"),
            ReadRate(root, "minimumLinkCoverage"));
    }

    private static List<EvaluationCase> ReadCases(string casesPath, IReadOnlySet<string> manifestFixtureFiles)
    {
        var info = new FileInfo(casesPath);
        if (info.Length > MaximumDatasetBytes)
        {
            throw new InvalidDataException($"JSONL case file exceeds the {MaximumDatasetBytes}-byte limit.");
        }

        string text;
        try
        {
            text = File.ReadAllText(casesPath, new UTF8Encoding(false, true));
        }
        catch (DecoderFallbackException exception)
        {
            throw new InvalidDataException("JSONL case file must be valid UTF-8.", exception);
        }

        var cases = new List<EvaluationCase>();
        var caseIds = new HashSet<string>(StringComparer.Ordinal);
        var lines = text.Split('\n');
        for (var index = 0; index < lines.Length; index++)
        {
            var line = lines[index].TrimEnd('\r');
            if (line.Length == 0)
            {
                if (index == lines.Length - 1 && text.EndsWith('\n'))
                {
                    continue;
                }

                throw new InvalidDataException($"JSONL line {index + 1} is blank.");
            }
            if (Encoding.UTF8.GetByteCount(line) > MaximumLineBytes)
            {
                throw new InvalidDataException($"JSONL line {index + 1} exceeds the {MaximumLineBytes}-byte limit.");
            }
            if (cases.Count >= MaximumCaseCount)
            {
                throw new InvalidDataException($"JSONL case count exceeds the {MaximumCaseCount}-case limit.");
            }

            using var document = ParseJson(line, $"JSONL line {index + 1}");
            var root = document.RootElement;
            EnsureProperties(root,
                ["caseId", "scenario", "categories", "required", "fixtureFile", "investigationId",
                    "requestInvestigationId", "question", "evidenceMode", "authorizationScenario",
                    "modelResponseKey", "expect"],
                $"JSONL line {index + 1}");

            var caseId = ReadString(root, "caseId");
            if (!caseIds.Add(caseId))
            {
                throw new InvalidDataException($"JSONL line {index + 1} duplicates caseId '{caseId}'.");
            }

            var fixtureFile = ReadString(root, "fixtureFile");
            if (!manifestFixtureFiles.Contains(fixtureFile))
            {
                throw new InvalidDataException(
                    $"Case '{caseId}' references fixtureFile '{fixtureFile}' that is not listed in the manifest.");
            }

            var expected = ReadExpectation(root.GetProperty("expect"), caseId);
            var requestInvestigationId = ReadNullableString(root, "requestInvestigationId");
            if (requestInvestigationId is not null && string.IsNullOrWhiteSpace(requestInvestigationId))
            {
                requestInvestigationId = null;
            }

            var authorizationScenario = ReadString(root, "authorizationScenario");
            if (!SupportedAuthorizationScenarios.Contains(authorizationScenario))
            {
                throw new InvalidDataException($"Case '{caseId}' has unsupported authorizationScenario '{authorizationScenario}'.");
            }
            var evidenceMode = ReadString(root, "evidenceMode");
            if (!SupportedEvidenceModes.Contains(evidenceMode))
            {
                throw new InvalidDataException($"Case '{caseId}' has unsupported evidenceMode '{evidenceMode}'.");
            }
            var modelResponseKey = ReadNullableString(root, "modelResponseKey");
            if (modelResponseKey is not null && string.IsNullOrWhiteSpace(modelResponseKey))
            {
                throw new InvalidDataException($"Case '{caseId}' modelResponseKey cannot be empty.");
            }
            if (ReadStringArray(root, "categories").Count == 0)
            {
                throw new InvalidDataException($"Case '{caseId}' must include at least one evaluation category.");
            }

            cases.Add(new EvaluationCase(
                caseId,
                ReadString(root, "scenario"),
                ReadBoolean(root, "required"),
                fixtureFile,
                ReadString(root, "investigationId"),
                requestInvestigationId,
                ReadString(root, "question"),
                evidenceMode,
                authorizationScenario,
                modelResponseKey,
                expected));
        }

        if (cases.Count == 0)
        {
            throw new InvalidDataException("JSONL case file must contain at least one case.");
        }

        return cases;
    }

    private static CaseExpectation ReadExpectation(JsonElement element, string caseId)
    {
        EnsureProperties(element,
            ["disposition", "authorizationScenario", "subjectId", "requiredEntityIds", "forbiddenEntityIds",
                "requiredRelationshipIds", "forbiddenRelationshipIds", "requiredEvidenceIds",
                "forbiddenEvidenceIds", "requiredSourceIds", "forbiddenSourceIds", "requiredSourceRefIds",
                "forbiddenSourceRefIds", "requiredLinkIds", "forbiddenLinkIds", "requiredPathIds",
                "noEvidenceLeakage", "noEvidenceAccess", "modelCalls", "questionIntent",
                "clarificationRequired", "scopeMaxHops", "scopeRelationshipTypes", "scopeSourceSystems",
                "parseSucceeded", "unsupportedReferenceRejected", "authorizationLeakageAllowed",
                "omissionBehaviorCorrect", "requiredChainIds", "expectedOmittedClaimIds",
                "extractedSubjectId"],
            $"case '{caseId}' expect");

        if (!Enum.TryParse<AnswerDisposition>(ReadString(element, "disposition"), false, out var disposition))
        {
            throw new InvalidDataException($"Case '{caseId}' has an invalid expected disposition.");
        }

        var expectation = new CaseExpectation(
            disposition,
            ReadString(element, "authorizationScenario"),
            ReadNullableString(element, "subjectId"),
            ReadStringArray(element, "requiredEntityIds"),
            ReadStringArray(element, "forbiddenEntityIds"),
            ReadStringArray(element, "requiredRelationshipIds"),
            ReadStringArray(element, "forbiddenRelationshipIds"),
            ReadStringArray(element, "requiredEvidenceIds"),
            ReadStringArray(element, "forbiddenEvidenceIds"),
            ReadStringArray(element, "requiredSourceIds"),
            ReadStringArray(element, "forbiddenSourceIds"),
            ReadStringArray(element, "requiredSourceRefIds"),
            ReadStringArray(element, "forbiddenSourceRefIds"),
            ReadStringArray(element, "requiredLinkIds"),
            ReadStringArray(element, "forbiddenLinkIds"),
            ReadStringArray(element, "requiredPathIds"),
            ReadBoolean(element, "noEvidenceLeakage"),
            ReadBoolean(element, "noEvidenceAccess"),
            ReadInt(element, "modelCalls"),
            ReadString(element, "questionIntent"),
            ReadBoolean(element, "clarificationRequired"),
            ReadNullableInt(element, "scopeMaxHops"),
            ReadStringArray(element, "scopeRelationshipTypes"),
            ReadStringArray(element, "scopeSourceSystems"),
            ReadNullableBoolean(element, "parseSucceeded"),
            ReadNullableBoolean(element, "unsupportedReferenceRejected"),
            ReadBoolean(element, "authorizationLeakageAllowed"),
            ReadBoolean(element, "omissionBehaviorCorrect"),
            ReadStringArray(element, "requiredChainIds"),
            ReadStringArray(element, "expectedOmittedClaimIds"),
            ReadNullableString(element, "extractedSubjectId"));
        if (!SupportedAuthorizationScenarios.Contains(expectation.AuthorizationScenario))
        {
            throw new InvalidDataException(
                $"Case '{caseId}' has unsupported expected authorizationScenario '{expectation.AuthorizationScenario}'.");
        }
        if (expectation.QuestionIntent is not (
                "engineering-impact" or "investigation-question" or "unsupported"))
        {
            throw new InvalidDataException($"Case '{caseId}' has unsupported questionIntent '{expectation.QuestionIntent}'.");
        }
        if (expectation.ScopeMaxHops is <= 0)
        {
            throw new InvalidDataException($"Case '{caseId}' scopeMaxHops must be positive or null.");
        }
        if (expectation.ModelCalls > 0 && expectation.ParseSucceeded is null)
        {
            throw new InvalidDataException($"Case '{caseId}' must annotate whether invoked model output parses.");
        }
        if (expectation.UnsupportedReferenceRejected is not null && expectation.ModelCalls == 0)
        {
            throw new InvalidDataException(
                $"Case '{caseId}' cannot annotate unsupported-reference rejection without invoking the model.");
        }
        if (expectation.AuthorizationLeakageAllowed)
        {
            throw new InvalidDataException($"Case '{caseId}' cannot allow authorization leakage.");
        }
        if (expectation.NoEvidenceAccess && !expectation.NoEvidenceLeakage)
        {
            throw new InvalidDataException($"Case '{caseId}' cannot require no evidence access without requiring no leakage.");
        }

        EnsureDisjoint(caseId, "entity", expectation.RequiredEntityIds, expectation.ForbiddenEntityIds);
        EnsureDisjoint(caseId, "relationship", expectation.RequiredRelationshipIds, expectation.ForbiddenRelationshipIds);
        EnsureDisjoint(caseId, "evidence", expectation.RequiredEvidenceIds, expectation.ForbiddenEvidenceIds);
        EnsureDisjoint(caseId, "source", expectation.RequiredSourceIds, expectation.ForbiddenSourceIds);
        EnsureDisjoint(caseId, "source reference", expectation.RequiredSourceRefIds, expectation.ForbiddenSourceRefIds);
        EnsureDisjoint(caseId, "link", expectation.RequiredLinkIds, expectation.ForbiddenLinkIds);
        return expectation;
    }

    private static void EnsureDisjoint(
        string caseId,
        string idType,
        IReadOnlyList<string> required,
        IReadOnlyList<string> forbidden)
    {
        var overlap = required.Intersect(forbidden, StringComparer.Ordinal).ToArray();
        if (overlap.Length > 0)
        {
            throw new InvalidDataException(
                $"Case '{caseId}' both requires and forbids {idType} IDs: {string.Join(", ", overlap)}.");
        }
    }

    private static EvaluationFixture ReadFixture(string fixturePath)
    {
        var root = ParseJsonFile(fixturePath, "fixture");
        EnsureProperties(root,
            ["schemaVersion", "investigationId", "subjectId", "sourceVersion", "ontologyVersion",
                "relationships", "paths", "sources", "modelResponses"],
            "fixture");
        if (ReadString(root, "schemaVersion") != "engineering-impact-fixture/v1")
        {
            throw new InvalidDataException("Unsupported engineering-impact fixture schemaVersion.");
        }

        var relationships = ReadObjectArray(root, "relationships", (element, index) =>
        {
            EnsureProperties(element,
                ["relationshipId", "sourceEntityId", "targetEntityId", "relationshipType", "explanation", "evidenceIds"],
                $"fixture relationship {index}");
            return new RelationshipEvidence(
                ReadString(element, "relationshipId"),
                ReadString(element, "sourceEntityId"),
                ReadString(element, "targetEntityId"),
                ReadString(element, "relationshipType"),
                ReadString(element, "explanation", allowEmpty: true),
                ReadStringArray(element, "evidenceIds"));
        });
        var paths = ReadObjectArray(root, "paths", (element, index) =>
        {
            EnsureProperties(element, ["pathId", "entityIds", "relationshipIds", "meanings"], $"fixture path {index}");
            return new ImpactPathEvidence(
                ReadString(element, "pathId"),
                ReadStringArray(element, "entityIds"),
                ReadStringArray(element, "relationshipIds"),
                Meanings: ReadStringArray(element, "meanings"));
        });
        var sources = ReadObjectArray(root, "sources", (element, index) =>
        {
            EnsureProperties(element,
                ["evidenceId", "sourceType", "sourceSystem", "recordId", "revision", "deepLink",
                    "provenanceId", "authorizationDecisionId", "citationId", "authority", "provider"],
                $"fixture source {index}");
            return new EvidenceSourceReference(
                ReadString(element, "evidenceId"),
                ReadString(element, "sourceType"),
                ReadString(element, "sourceSystem"),
                ReadString(element, "recordId"),
                ReadNullableString(element, "revision"),
                null,
                ReadNullableString(element, "deepLink"),
                ReadString(element, "provenanceId"),
                ReadString(element, "authorizationDecisionId"),
                ReadNullableString(element, "citationId"),
                ReadNullableString(element, "authority"),
                ReadNullableString(element, "provider"));
        });
        var modelResponsesElement = root.GetProperty("modelResponses");
        if (modelResponsesElement.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("Fixture modelResponses must be an object.");
        }
        var modelResponses = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var property in modelResponsesElement.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.String ||
                !modelResponses.TryAdd(property.Name, property.Value.GetString()!))
            {
                throw new InvalidDataException($"Fixture modelResponses has an invalid or duplicate key '{property.Name}'.");
            }
        }

        return new EvaluationFixture(
            ReadString(root, "investigationId"),
            ReadString(root, "subjectId"),
            ReadString(root, "sourceVersion"),
            ReadString(root, "ontologyVersion"),
            relationships,
            paths,
            sources,
            [],
            modelResponses);
    }

    private static T[] ReadObjectArray<T>(
        JsonElement element,
        string propertyName,
        Func<JsonElement, int, T> readItem)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException($"Required fixture array '{propertyName}' is missing or invalid.");
        }

        var items = new List<T>();
        var index = 0;
        foreach (var item in value.EnumerateArray())
        {
            items.Add(readItem(item, index++));
        }

        return items.ToArray();
    }

    private static string ResolveDatasetFile(string root, string relativePath, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
        {
            throw new InvalidDataException($"{fieldName} must be a non-empty relative path.");
        }

        var fullPath = Path.GetFullPath(Path.Combine(root, relativePath));
        var relativeToRoot = Path.GetRelativePath(root, fullPath);
        if (relativeToRoot == ".." ||
            relativeToRoot.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal) ||
            Path.IsPathRooted(relativeToRoot))
        {
            throw new InvalidDataException($"{fieldName} must stay within the dataset directory.");
        }
        if (!File.Exists(fullPath))
        {
            throw new InvalidDataException($"{fieldName} file '{relativePath}' does not exist.");
        }

        return fullPath;
    }

    private static JsonElement ParseJsonFile(string path, string description)
    {
        var info = new FileInfo(path);
        if (info.Length > MaximumDatasetBytes)
        {
            throw new InvalidDataException($"{description} file exceeds the {MaximumDatasetBytes}-byte limit.");
        }

        string text;
        try
        {
            text = File.ReadAllText(path, new UTF8Encoding(false, true));
        }
        catch (DecoderFallbackException exception)
        {
            throw new InvalidDataException($"{description} must be valid UTF-8.", exception);
        }

        using var document = ParseJson(text, description);
        return document.RootElement.Clone();
    }

    private static JsonDocument ParseJson(string text, string description)
    {
        try
        {
            var document = JsonDocument.Parse(
                text,
                new JsonDocumentOptions
                {
                    AllowTrailingCommas = false,
                    CommentHandling = JsonCommentHandling.Disallow,
                    MaxDepth = 32
                });
            EnsureUniqueProperties(document.RootElement, description);
            return document;
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException($"{description} contains invalid JSON: {exception.Message}", exception);
        }
    }

    private static void EnsureUniqueProperties(JsonElement element, string description)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name))
                {
                    throw new InvalidDataException($"{description} contains duplicate JSON property '{property.Name}'.");
                }
                EnsureUniqueProperties(property.Value, description);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                EnsureUniqueProperties(item, description);
            }
        }
    }

    private static void EnsureProperties(JsonElement element, IReadOnlyCollection<string> required, string description)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException($"{description} must be a JSON object.");
        }

        var allowed = required.ToHashSet(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!allowed.Contains(property.Name))
            {
                throw new InvalidDataException($"{description} contains unknown field '{property.Name}'.");
            }
            seen.Add(property.Name);
        }

        var missing = required.Where(name => !seen.Contains(name)).ToArray();
        if (missing.Length > 0)
        {
            throw new InvalidDataException($"{description} is missing required field(s): {string.Join(", ", missing)}.");
        }
    }

    private static string ReadString(JsonElement element, string propertyName, bool allowEmpty = false)
    {
        if (!element.TryGetProperty(propertyName, out var value) ||
            value.ValueKind != JsonValueKind.String ||
            (!allowEmpty && string.IsNullOrWhiteSpace(value.GetString())))
        {
            throw new InvalidDataException($"Required string field '{propertyName}' is missing or invalid.");
        }

        return value.GetString()!;
    }

    private static string? ReadNullableString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            throw new InvalidDataException($"Required nullable string field '{propertyName}' is missing.");
        }
        if (value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }
        if (value.ValueKind != JsonValueKind.String)
        {
            throw new InvalidDataException($"Nullable string field '{propertyName}' has an invalid value.");
        }

        return value.GetString();
    }

    private static int? ReadNullableInt(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            throw new InvalidDataException($"Required field '{propertyName}' is missing.");
        }

        if (value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var result))
        {
            throw new InvalidDataException($"Field '{propertyName}' must be an integer or null.");
        }

        return result;
    }

    private static bool? ReadNullableBoolean(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value))
        {
            throw new InvalidDataException($"Required field '{propertyName}' is missing.");
        }

        if (value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        {
            throw new InvalidDataException($"Field '{propertyName}' must be a boolean or null.");
        }

        return value.GetBoolean();
    }

    private static IReadOnlyList<string> ReadStringArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException($"Required array field '{propertyName}' is missing or invalid.");
        }

        var values = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(item.GetString()))
            {
                throw new InvalidDataException($"Array field '{propertyName}' must contain non-empty strings.");
            }
            var itemValue = item.GetString()!;
            if (!seen.Add(itemValue))
            {
                throw new InvalidDataException($"Array field '{propertyName}' contains duplicate value '{itemValue}'.");
            }
            values.Add(itemValue);
        }

        return values;
    }

    private static int ReadInt(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) ||
            value.ValueKind != JsonValueKind.Number ||
            !value.TryGetInt32(out var result) ||
            result < 0)
        {
            throw new InvalidDataException($"Integer field '{propertyName}' is missing or invalid.");
        }

        return result;
    }

    private static bool ReadBoolean(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) ||
            value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        {
            throw new InvalidDataException($"Boolean field '{propertyName}' is missing or invalid.");
        }

        return value.GetBoolean();
    }

    private static double ReadRate(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var value) ||
            value.ValueKind != JsonValueKind.Number ||
            !value.TryGetDouble(out var result) ||
            !double.IsFinite(result) ||
            result is < 0 or > 1)
        {
            throw new InvalidDataException($"Rate field '{propertyName}' must be a finite number between 0 and 1.");
        }

        return result;
    }

    private sealed record Manifest(
        string DatasetId,
        string CasesFile,
        IReadOnlyList<string> FixtureFiles,
        int CaseCount,
        double MinimumPathCoverage,
        double MinimumLinkCoverage);

    private sealed record EvaluationCase(
        string CaseId,
        string Scenario,
        bool Required,
        string FixtureFile,
        string InvestigationId,
        string? RequestInvestigationId,
        string Question,
        string EvidenceMode,
        string AuthorizationScenario,
        string? ModelResponseKey,
        CaseExpectation Expected);

    private sealed record CaseExpectation(
        AnswerDisposition Disposition,
        string AuthorizationScenario,
        string? SubjectId,
        IReadOnlyList<string> RequiredEntityIds,
        IReadOnlyList<string> ForbiddenEntityIds,
        IReadOnlyList<string> RequiredRelationshipIds,
        IReadOnlyList<string> ForbiddenRelationshipIds,
        IReadOnlyList<string> RequiredEvidenceIds,
        IReadOnlyList<string> ForbiddenEvidenceIds,
        IReadOnlyList<string> RequiredSourceIds,
        IReadOnlyList<string> ForbiddenSourceIds,
        IReadOnlyList<string> RequiredSourceRefIds,
        IReadOnlyList<string> ForbiddenSourceRefIds,
        IReadOnlyList<string> RequiredLinkIds,
        IReadOnlyList<string> ForbiddenLinkIds,
        IReadOnlyList<string> RequiredPathIds,
        bool NoEvidenceLeakage,
        bool NoEvidenceAccess,
        int ModelCalls,
        string QuestionIntent,
        bool ClarificationRequired,
        int? ScopeMaxHops,
        IReadOnlyList<string> ScopeRelationshipTypes,
        IReadOnlyList<string> ScopeSourceSystems,
        bool? ParseSucceeded,
        bool? UnsupportedReferenceRejected,
        bool AuthorizationLeakageAllowed,
        bool OmissionBehaviorCorrect,
        IReadOnlyList<string> RequiredChainIds,
        IReadOnlyList<string> ExpectedOmittedClaimIds,
        string? ExtractedSubjectId);

    private sealed record EvaluationFixture(
        string InvestigationId,
        string SubjectId,
        string SourceVersion,
        string OntologyVersion,
        IReadOnlyList<RelationshipEvidence> Relationships,
        IReadOnlyList<ImpactPathEvidence> Paths,
        IReadOnlyList<EvidenceSourceReference> Sources,
        IReadOnlyList<ImpactChainEvidence> Chains,
        IReadOnlyDictionary<string, string> ModelResponses);

    private sealed record ConversationSequenceHarness(
        ImpactAnswerService Service,
        FixtureEntityResolver Resolver,
        FixtureEvidenceSource EvidenceSource,
        FixtureModelGateway ModelGateway,
        AuthorizationContext Authorization,
        ConversationSequenceTelemetry Telemetry,
        RuntimeRequestContext RequestContext,
        string ConversationId,
        string InvestigationId)
    {
        public List<AnswerDisposition> TurnDispositions { get; } = [];
    }

    private sealed class ConversationSequenceTelemetry : IAiRuntimeTelemetry
    {
        public List<ConversationTurnTelemetry> Turns { get; } = [];
        public List<ConversationStateInvalidationReason> StateInvalidations { get; } = [];

        public IRuntimeTelemetryStage StartStage(
            string stage,
            RuntimeRequestContext requestContext,
            string? investigationId = null) =>
            NullAiRuntimeTelemetry.Instance.StartStage(stage, requestContext, investigationId);

        public void RecordRequestOutcome(string disposition)
        {
        }

        public void RecordValidationDisposition(string disposition)
        {
        }

        public void RecordModelUsage(string provider, string modelConfigurationId, int? inputTokens, int? outputTokens)
        {
        }

        public void RecordContextQuality(int omissionCount, bool budgetExhausted)
        {
        }

        public void RecordSourceEvidenceOmissions(int omissionCount)
        {
        }

        public void RecordSourceEvidenceIndexStatus(SourceEvidenceIndexState status)
        {
        }

        public void RecordSourceEvidenceIndexRevision()
        {
        }

        public void RecordAnswerQuality(AnswerQualitySummary summary)
        {
        }

        public void RecordConversationTurn(ConversationTurnTelemetry summary) => Turns.Add(summary);

        public void RecordConversationStateInvalidation(ConversationStateInvalidationReason reason) =>
            StateInvalidations.Add(reason);

        public int FollowUpRetrievalCount { get; private set; }

        public void RecordConversationRetrieval(bool followUp)
        {
            if (followUp) FollowUpRetrievalCount++;
        }

        public void RecordConversationTurnDisposition(AnswerDisposition disposition)
        {
        }
    }

    private sealed class FixtureEntityResolver(EvaluationCase evaluationCase, EvaluationFixture fixture)
        : IEngineeringEntityResolver
    {
        public int CallCount { get; private set; }
        public ResolvedEntity? ResolvedEntity { get; private set; }
        public string? DenialScenario { get; private set; }

        public Task<EntityResolutionResult> ResolveAsync(
            string investigationId,
            QuestionInterpretation interpretation,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            CallCount++;
            if (!string.Equals(investigationId, fixture.InvestigationId, StringComparison.Ordinal))
            {
                DenialScenario = "investigation-mismatch";
                return Task.FromResult(new EntityResolutionResult(
                    EntityResolutionDisposition.Denied,
                    null,
                    [],
                    ["The request is outside the fixture investigation scope."]));
            }
            if (evaluationCase.AuthorizationScenario == "revoked")
            {
                DenialScenario = "revoked";
                return Task.FromResult(new EntityResolutionResult(
                    EntityResolutionDisposition.Denied,
                    null,
                    [],
                    ["The fixture authorization decision has been revoked."]));
            }

            if (!MatchesFixtureSubject(interpretation.CandidateEntityId, fixture.SubjectId))
            {
                return Task.FromResult(new EntityResolutionResult(
                    EntityResolutionDisposition.Unresolved,
                    null,
                    [],
                    ["The explicit subject identifier is absent from the synthetic fixture."]));
            }

            ResolvedEntity = new ResolvedEntity("synthetic-plm", "Requirement", fixture.SubjectId, fixture.SubjectId);
            return Task.FromResult(new EntityResolutionResult(
                EntityResolutionDisposition.Resolved,
                ResolvedEntity,
                [fixture.SubjectId],
                []));
        }

        private static bool MatchesFixtureSubject(string? candidateId, string fixtureSubjectId)
        {
            if (string.IsNullOrWhiteSpace(candidateId))
            {
                return false;
            }

            static string Normalize(string value) =>
                value.StartsWith("REQ-", StringComparison.OrdinalIgnoreCase)
                    ? $"R-{value[4..]}"
                    : value;

            return string.Equals(Normalize(candidateId), Normalize(fixtureSubjectId), StringComparison.OrdinalIgnoreCase);
        }
    }

    private sealed class RecordingScopePlanner(IScopePlanner inner) : IScopePlanner
    {
        public ScopePlanningResult? LastResult { get; private set; }

        public ScopePlanningResult Plan(
            ConversationTurnInterpretation turn,
            ConversationState? priorState,
            ResolvedEntity subject,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext)
        {
            LastResult = inner.Plan(turn, priorState, subject, authorization, requestContext);
            return LastResult;
        }

        public ScopePlanningResult Plan(
            QuestionInterpretation interpretation,
            ResolvedEntity? subject,
            AuthorizationScope authorization,
            RuntimeRequestContext requestContext)
        {
            LastResult = inner.Plan(interpretation, subject, authorization, requestContext);
            return LastResult;
        }
    }

    private sealed class RecordingContextCompiler(IContextCompiler inner) : IContextCompiler
    {
        public ContextCompilationResult? LastResult { get; private set; }

        public ContextCompilationResult Compile(ContextCompilationInput input)
        {
            LastResult = inner.Compile(input);
            return LastResult;
        }
    }

    private sealed class FixtureEvidenceSource(
        EvidenceRetrievalResult result,
        bool updateRequestContext = false) : IEngineeringEvidenceSource
    {
        public int CallCount { get; private set; }
        public EvidenceRetrievalResult? LastResult { get; private set; }
        public string? NextSourceVersion { get; set; }

        public Task<EvidenceRetrievalResult> RetrieveImpactAsync(
            ImpactEvidenceQuery query,
            CancellationToken cancellationToken)
        {
            CallCount++;
            var retrieved = updateRequestContext
                ? result with
                {
                    InvestigationId = query.InvestigationId,
                    RequestId = query.RequestContext.RequestId,
                    TraceId = query.RequestContext.TraceId
                }
                : result;
            LastResult = NextSourceVersion is { } sourceVersion
                ? retrieved with { SourceVersion = sourceVersion }
                : retrieved;
            NextSourceVersion = null;
            return Task.FromResult(LastResult);
        }

        public Task<EvidenceRetrievalResult> RetrieveInvestigationAsync(
            InvestigationEvidenceQuery query,
            CancellationToken cancellationToken)
        {
            CallCount++;
            var retrieved = updateRequestContext
                ? result with
                {
                    InvestigationId = query.InvestigationId,
                    AuthorizationDecisionId = query.Authorization.Scope.DecisionId,
                    RequestId = query.RequestContext.RequestId,
                    TraceId = query.RequestContext.TraceId
                }
                : result;
            LastResult = NextSourceVersion is { } sourceVersion
                ? retrieved with { SourceVersion = sourceVersion }
                : retrieved;
            NextSourceVersion = null;
            return Task.FromResult(LastResult);
        }
    }

    private sealed class EvaluationUnavailableSourceEvidenceRetriever : ISourceEvidenceRetriever
    {
        public Task<SourceEvidenceRetrievalResult> RetrieveAsync(
            SourceEvidenceQuery query,
            CancellationToken cancellationToken)
        {
            ArgumentNullException.ThrowIfNull(query);
            cancellationToken.ThrowIfCancellationRequested();
            throw new SourceEvidenceUnavailableException(
                "The offline evaluation runner has no source-evidence retrieval adapter.");
        }
    }

    private sealed class FixtureModelGateway(string? content) : IModelGateway
    {
        public int CallCount { get; private set; }
        public string? Content { get; } = content;

        public Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(new ModelResponse(
                request.RequestContext,
                Content ?? "{}",
                "offline-fixture",
                "deterministic-fake",
                null,
                0,
                0,
                TimeSpan.Zero));
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
