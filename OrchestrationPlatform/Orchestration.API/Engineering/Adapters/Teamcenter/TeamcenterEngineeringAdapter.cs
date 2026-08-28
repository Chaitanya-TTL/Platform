
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;
using Orchestration.API.Services;

namespace Orchestration.API.Engineering.Adapters.Teamcenter;

public sealed class TeamcenterEngineeringAdapter : IEngineeringSourceAdapter
{
    private static readonly SemaphoreSlim LegacyPipelineGate = new(1, 1);
    private readonly ISubprocessExecutor executor;
    private readonly ITeamcenterArtifactCaptureService capture;
    private readonly ITeamcenterFailureClassifier classifier;

    public TeamcenterEngineeringAdapter(
        ISubprocessExecutor executor,
        ITeamcenterArtifactCaptureService capture,
        ITeamcenterFailureClassifier classifier)
    {
        this.executor = executor;
        this.capture = capture;
        this.classifier = classifier;
    }

    public EngineeringSource Source => EngineeringSource.Teamcenter;

    public Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token) =>
        Task.FromResult(Capability());

    public async Task<SourceDiscoveryOutcome> DiscoverAsync(
        EngineeringDiscoveryRequest request,
        QueryNormalizationRecord normalized,
        CancellationToken token)
    {
        var query = request.Query.ProductId ?? request.Query.ProductName ?? request.Query.OriginalInput;
        if (string.IsNullOrWhiteSpace(query))
            return new SourceDiscoveryOutcome(Source, StandardStatus.Empty, Capability(), [], [], [], false);

        var gateAcquired = false;
        try
        {
            await LegacyPipelineGate.WaitAsync(token);
            gateAcquired = true;
            var discoveryId = $"discovery-{request.RequestId}";
            var result = await executor.ExecuteAsync(new ExtractionRequest
            {
                Kind = ExtractionKind.Teamcenter,
                JobId = discoveryId,
                TeamcenterQuery = query.Trim()
            }, _ => Task.CompletedTask, token);

            if (!result.Success || result.Bom?.BomRootNode is null)
            {
                var failure = classifier.Classify(result.Output, result.ProcessExitCode,
                    !string.IsNullOrWhiteSpace(result.BomOutputPath) && File.Exists(result.BomOutputPath));
                return new SourceDiscoveryOutcome(Source, StandardStatus.Failed, Capability(), [], [], [failure], failure.Retryable);
            }

            var root = result.Bom.BomRootNode;
            var nativeId = string.IsNullOrWhiteSpace(result.Bom.SourceItemId) ? root.ItemId : result.Bom.SourceItemId;
            var displayName = string.IsNullOrWhiteSpace(root.Name) ? nativeId : root.Name;
            var exactId = string.Equals(nativeId, query.Trim(), StringComparison.OrdinalIgnoreCase);
            var exactName = string.Equals(displayName, query.Trim(), StringComparison.OrdinalIgnoreCase);
            var category = exactId ? MatchCategory.VerifiedIdentifierMatch : exactName ? MatchCategory.ExactSourceNameMatch : MatchCategory.SourceSearchResult;
            var candidate = new SourceCandidate(
                $"teamcenter:{nativeId}", Source, nativeId, displayName, "teamcenter-item",
                string.IsNullOrWhiteSpace(result.Bom.SourceRevId) ? root.RevId : result.Bom.SourceRevId,
                null, null, null, category,
                exactId ? "A fresh Teamcenter extraction verified the Item ID." : exactName ? "A fresh Teamcenter extraction resolved the exact product name." : "A fresh Teamcenter extraction resolved the entered name or ID.",
                ConfidenceClass.Verified, ["structure"],
                new Dictionary<string, string?> { ["resolvedFrom"] = query.Trim(), ["artifactPath"] = result.BomOutputPath },
                new(ProvenanceKind.LiveSource, "teamcenter-soa-name-or-id", DateTimeOffset.UtcNow), true);
            return new SourceDiscoveryOutcome(Source, StandardStatus.Success, Capability(), [candidate], [], [], true);
        }
        catch (OperationCanceledException) { throw; }
        catch (TimeoutException)
        {
            var error = Error("teamcenter-timeout", EngineeringStage.Discovery, "Teamcenter discovery timed out.", true);
            return new SourceDiscoveryOutcome(Source, StandardStatus.TimedOut, Capability(), [], [], [error], true);
        }
        catch (Exception ex)
        {
            var error = Error("teamcenter-discovery-failed", EngineeringStage.Discovery, ex.Message, true);
            return new SourceDiscoveryOutcome(Source, StandardStatus.Failed, Capability(), [], [], [error], true);
        }
        finally
        {
            if (gateAcquired) LegacyPipelineGate.Release();
        }
    }

    public async Task<StandardExtractionResult> ExtractAsync(
        string jobId,
        EngineeringExtractionRequest request,
        IProgress<StandardProgress> progress,
        CancellationToken token)
    {
        var started = DateTimeOffset.UtcNow;
        if (string.IsNullOrWhiteSpace(request.Candidate.NativeId))
            return Failure(jobId, request, started,
                Error("teamcenter-item-id-required", EngineeringStage.TeamcenterResolution,
                    "A Teamcenter Item ID is required.", false));

        var gateAcquired = false;
        try
        {
            progress.Report(Progress(jobId, EngineeringStage.TeamcenterSession, JobState.Queued, 2,
                "Waiting for exclusive access to the legacy Teamcenter pipeline."));
            await LegacyPipelineGate.WaitAsync(token);
            gateAcquired = true;

            progress.Report(Progress(jobId, EngineeringStage.TeamcenterStructureExtraction, JobState.Extracting, 10,
                "Starting Teamcenter structure extraction."));
            var legacyRequest = new ExtractionRequest
            {
                Kind = ExtractionKind.Teamcenter,
                JobId = jobId,
                TeamcenterQuery = request.Candidate.NativeId
            };
            var result = await executor.ExecuteAsync(
                legacyRequest,
                _ =>
                {
                    progress.Report(Progress(jobId, EngineeringStage.TeamcenterStructureExtraction,
                        JobState.Extracting, 45, "Teamcenter extraction is running."));
                    return Task.CompletedTask;
                }, token);
            token.ThrowIfCancellationRequested();

            if (!result.Success || string.IsNullOrWhiteSpace(result.BomOutputPath))
            {
                var failure = classifier.Classify(result.Output, result.ProcessExitCode,
                    !string.IsNullOrWhiteSpace(result.BomOutputPath) && File.Exists(result.BomOutputPath));
                return Failure(jobId, request, started, failure);
            }

            var optionalFailure = !string.IsNullOrWhiteSpace(result.OptionalStageWarning);
            var preliminaryStages = BuildStages(optionalFailure, captureSucceeded: false, captureFailureCode: null);
            progress.Report(Progress(jobId, EngineeringStage.CanonicalArtifactCapture, JobState.Extracting, 85,
                "Capturing attributable Teamcenter artifacts."));
            var captured = await capture.CaptureAsync(jobId, request.Candidate.NativeId,
                result.BomOutputPath, started, preliminaryStages, token);
            if (!captured.Success || captured.Bom?.BomRootNode is null)
            {
                var error = Error(captured.FailureCode ?? "teamcenter-output-missing",
                    EngineeringStage.CanonicalArtifactCapture,
                    CaptureMessage(captured.FailureCode),
                    captured.FailureCode is not "teamcenter-output-identity-mismatch");
                return Failure(jobId, request, started, error);
            }

            var completed = DateTimeOffset.UtcNow;
            var verified = request.Candidate with
            {
                ConfidenceClass = ConfidenceClass.Verified,
                MatchCategory = MatchCategory.VerifiedIdentifierMatch,
                MatchReason = "A fresh, valid and Item-ID-owned Teamcenter extraction output verified the source-native reference.",
                Provenance = new(ProvenanceKind.LiveSource, "teamcenter-soa", completed)
            };
            var warnings = optionalFailure
                ? new[] { new StructuredWarning("configit-transformation-failed", Source,
                    EngineeringStage.ConfigitTransformation,
                    "Teamcenter structure extraction succeeded, but the optional downstream Configit stage failed.", completed) }
                : Array.Empty<StructuredWarning>();
            var status = optionalFailure ? StandardStatus.PartialSuccess : StandardStatus.Success;
            var stages = BuildStages(optionalFailure, captureSucceeded: true, captureFailureCode: null);
            var evidence = new Dictionary<string, object?>
            {
                ["teamcenterStages"] = stages,
                ["artifactManifest"] = captured.Manifest
            };

            return new StandardExtractionResult(
                EngineeringContractVersions.V1, request.RequestId, request.CorrelationId, jobId, Source, status,
                new(status, verified, request.Candidate.NativeId, warnings, []), Capability(), captured.Bom,
                [], evidence, warnings, [],
                Progress(jobId, EngineeringStage.CanonicalArtifactCapture,
                    status == StandardStatus.Success ? JobState.Success : JobState.PartialSuccess, 100,
                    "Teamcenter extraction and canonical artifact capture completed."),
                captured.Artifacts, new(ProvenanceKind.LiveSource, "teamcenter-soa", completed),
                ToGenericStages(stages, status), started, completed, (long)(completed - started).TotalMilliseconds);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (TimeoutException ex)
        {
            return Failure(jobId, request, started, classifier.Classify(null, null, false, ex));
        }
        catch (Exception ex)
        {
            return Failure(jobId, request, started, classifier.Classify(null, null, false, ex));
        }
        finally
        {
            if (gateAcquired) LegacyPipelineGate.Release();
        }
    }

    private static SourceCapability Capability() => new(
        Source: EngineeringSource.Teamcenter,
        Readiness: SourceReadiness.Ready,
        DiscoveryModes: [DiscoveryMode.ExactId, DiscoveryMode.Name, DiscoveryMode.Number],
        SupportsExactId: true,
        SupportsNameSearch: true,
        SupportsNumberSearch: true,
        SupportsStructureExtraction: true,
        SupportsRevisionContext: true,
        SupportsChangeContext: false,
        SupportsRequirements: false,
        SupportsOperationalImpact: false,
        SupportsConfigurationContext: false,
        SupportsCancellation: true,
        SupportsRetry: true,
        SupportsPartialSuccess: false,
        RequiredOrganizationContext: [],
        KnownLimitations: ["Teamcenter discovery executes the authoritative name-or-ID resolver and is serialized to protect the connector runtime."]);

    private static IReadOnlyList<TeamcenterStageEvidence> BuildStages(
        bool optionalFailure, bool captureSucceeded, string? captureFailureCode)
    {
        var now = DateTimeOffset.UtcNow;
        return
        [
            Stage(EngineeringStage.TeamcenterSession, TeamcenterObservationState.NotObserved,
                "teamcenter-session-not-observed", "The legacy batch does not emit a machine-readable session result.", now),
            Stage(EngineeringStage.TeamcenterResolution, TeamcenterObservationState.ObservedSuccess,
                "teamcenter-resolution-observed", "Valid owned output proves the Item ID resolved.", now),
            Stage(EngineeringStage.TeamcenterStructureExtraction, TeamcenterObservationState.ObservedSuccess,
                "teamcenter-structure-observed", "A valid normalized Teamcenter structure was produced.", now),
            Stage(EngineeringStage.TeamcenterPlmxmlExport, TeamcenterObservationState.NotObserved,
                "teamcenter-plmxml-not-observed", "PLMXML export is not independently reported by the legacy batch.", now),
            Stage(EngineeringStage.TeamcenterNormalization, TeamcenterObservationState.ObservedSuccess,
                "teamcenter-normalization-observed", "The Teamcenter output passed canonical JSON validation.", now),
            Stage(EngineeringStage.ConfigitTransformation,
                optionalFailure ? TeamcenterObservationState.ObservedFailure : TeamcenterObservationState.NotObserved,
                optionalFailure ? "configit-transformation-failed" : "configit-transformation-not-observed",
                optionalFailure ? "The optional downstream stage failed after Teamcenter output was produced." : "Transformation was not independently observed.", now),
            Stage(EngineeringStage.ConfigitCompilation, TeamcenterObservationState.NotObserved,
                "configit-compilation-not-observed", "Compilation was not independently observed.", now),
            Stage(EngineeringStage.ConfigitPublication, TeamcenterObservationState.NotObserved,
                "configit-publication-not-observed", "Publication was not independently observed and is never inferred.", now),
            Stage(EngineeringStage.CanonicalArtifactCapture,
                captureSucceeded ? TeamcenterObservationState.ObservedSuccess :
                    captureFailureCode is null ? TeamcenterObservationState.NotObserved : TeamcenterObservationState.ObservedFailure,
                captureSucceeded ? "canonical-artifact-capture-observed" : captureFailureCode ?? "canonical-artifact-capture-not-observed",
                captureSucceeded ? "Fresh Item-ID-owned artifacts were captured in request-scoped storage." : "Canonical artifact capture was not completed.", now)
        ];
    }

    private static IReadOnlyList<TeamcenterStageEvidence> BuildFailureStages(StructuredError error)
    {
        var now = DateTimeOffset.UtcNow;
        var ordered = new[]
        {
            EngineeringStage.TeamcenterSession,
            EngineeringStage.TeamcenterResolution,
            EngineeringStage.TeamcenterStructureExtraction,
            EngineeringStage.TeamcenterPlmxmlExport,
            EngineeringStage.TeamcenterNormalization,
            EngineeringStage.ConfigitTransformation,
            EngineeringStage.ConfigitCompilation,
            EngineeringStage.ConfigitPublication,
            EngineeringStage.CanonicalArtifactCapture
        };
        return ordered.Select(stage => stage == error.Stage
            ? Stage(stage, TeamcenterObservationState.ObservedFailure, error.Code, error.UserMessage, now)
            : Stage(stage, TeamcenterObservationState.NotObserved,
                $"{stage.ToString().ToLowerInvariant()}-not-observed", "No attributable stage evidence was available.", now)).ToArray();
    }

    private static IReadOnlyList<StageObservation> ToGenericStages(
        IReadOnlyList<TeamcenterStageEvidence> stages, StandardStatus status) =>
        stages.Select(stage => new StageObservation(
            stage.Stage,
            stage.Observation switch
            {
                TeamcenterObservationState.ObservedSuccess => EvidenceAvailability.Available,
                TeamcenterObservationState.ObservedFailure => EvidenceAvailability.Partial,
                TeamcenterObservationState.NotRequested => EvidenceAvailability.NotRequested,
                _ => EvidenceAvailability.NotObserved
            },
            stage.Observation == TeamcenterObservationState.ObservedSuccess ? StandardStatus.Success :
            stage.Observation == TeamcenterObservationState.ObservedFailure ? StandardStatus.Failed : null,
            stage.Message)).ToArray();

    private static TeamcenterStageEvidence Stage(
        EngineeringStage stage, TeamcenterObservationState observation, string code, string message, DateTimeOffset now) =>
        new(stage, observation, code, message, now);

    private static StandardProgress Progress(
        string jobId, EngineeringStage stage, JobState state, int percent, string message) =>
        new(jobId, EngineeringSource.Teamcenter, stage, state, percent, message, DateTimeOffset.UtcNow);

    private static StructuredError Error(string code, EngineeringStage stage, string message, bool retryable) =>
        new(code, EngineeringSource.Teamcenter, stage, message, message, retryable, DateTimeOffset.UtcNow);

    private static string CaptureMessage(string? code) => code switch
    {
        "teamcenter-output-malformed" => "Teamcenter output was malformed.",
        "teamcenter-output-stale" => "Teamcenter output predates the current execution and was rejected.",
        "teamcenter-output-identity-mismatch" => "Teamcenter output does not belong to the requested Item ID.",
        _ => "Teamcenter did not produce an attributable output."
    };

    private static StandardExtractionResult Failure(
        string jobId, EngineeringExtractionRequest request, DateTimeOffset started, StructuredError error)
    {
        var completed = DateTimeOffset.UtcNow;
        var status = error.Code == "teamcenter-timeout" ? StandardStatus.TimedOut :
            error.Code == "teamcenter-cancelled" ? StandardStatus.Cancelled : StandardStatus.Failed;
        var state = status == StandardStatus.TimedOut ? JobState.TimedOut :
            status == StandardStatus.Cancelled ? JobState.Cancelled : JobState.Failed;
        var stages = BuildFailureStages(error);
        return new(
            EngineeringContractVersions.V1, request.RequestId, request.CorrelationId, jobId,
            EngineeringSource.Teamcenter, status,
            new(status, request.Candidate, null, [], [error]), Capability(), null, [],
            new Dictionary<string, object?> { ["teamcenterStages"] = stages }, [], [error],
            Progress(jobId, error.Stage, state, 100, error.UserMessage), [],
            new(ProvenanceKind.Unavailable, "teamcenter-legacy-pipeline", completed),
            ToGenericStages(stages, status), started, completed, (long)(completed - started).TotalMilliseconds);
    }
}
