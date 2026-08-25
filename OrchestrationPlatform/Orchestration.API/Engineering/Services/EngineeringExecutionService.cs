using Orchestration.API.Engineering.Adapters;
using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Services;

public interface IEngineeringExecutionService { Task<EngineeringDiscoveryResult> DiscoverAsync(EngineeringDiscoveryRequest request, CancellationToken token); EngineeringJobRecord StartExtraction(EngineeringExtractionRequest request, CancellationToken requestToken); }
public sealed class EngineeringExecutionService : IEngineeringExecutionService
{
    readonly IEngineeringAdapterRegistry registry; readonly IEngineeringRequestValidator validator; readonly IEngineeringQueryNormalizer normalizer; readonly IEngineeringJobStore jobs; readonly IEngineeringCancellationRegistry cancellations; readonly ISafeEngineeringDiagnostics diagnostics;
    public EngineeringExecutionService(IEngineeringAdapterRegistry registry, IEngineeringRequestValidator validator, IEngineeringQueryNormalizer normalizer, IEngineeringJobStore jobs, IEngineeringCancellationRegistry cancellations, ISafeEngineeringDiagnostics diagnostics) { this.registry = registry; this.validator = validator; this.normalizer = normalizer; this.jobs = jobs; this.cancellations = cancellations; this.diagnostics = diagnostics; }
    public async Task<EngineeringDiscoveryResult> DiscoverAsync(EngineeringDiscoveryRequest request, CancellationToken token) { var valid = validator.Validate(request); if (!valid.IsValid) return new(request.SchemaVersion, request.RequestId, request.CorrelationId, [new(request.RequestedSources.FirstOrDefault(), StandardStatus.Failed, Unsupported(request.RequestedSources.FirstOrDefault()), [], [], valid.Errors, false)], DateTimeOffset.UtcNow); QueryNormalizationRecord normalized; try { normalized = normalizer.Normalize(request.Query); } catch (EngineeringValidationException ex) { var err = new StructuredError(ex.Code, null, EngineeringStage.Validation, ex.Message, ex.Message, false, DateTimeOffset.UtcNow); return new(request.SchemaVersion, request.RequestId, request.CorrelationId, [new(request.RequestedSources[0], StandardStatus.Failed, Unsupported(request.RequestedSources[0]), [], [], [err], false)], DateTimeOffset.UtcNow); } var results = new List<SourceDiscoveryOutcome>(); foreach (var source in request.RequestedSources) { if (!registry.TryResolve(source, out var adapter) || adapter is null) { var err = new StructuredError("source-adapter-not-implemented", source, EngineeringStage.Discovery, "The source adapter is not implemented.", "This source is not available in the current standardization slice.", false, DateTimeOffset.UtcNow); results.Add(new(source, StandardStatus.Unavailable, Unsupported(source), [], [], [err], false)); continue; } results.Add(await adapter.DiscoverAsync(request, normalized, token)); } return new(request.SchemaVersion, request.RequestId, request.CorrelationId, results, DateTimeOffset.UtcNow); }
    public EngineeringJobRecord StartExtraction(EngineeringExtractionRequest request, CancellationToken requestToken) { var valid = validator.Validate(request); if (!valid.IsValid) throw new EngineeringValidationException(valid.Errors[0].Code, valid.Errors[0].UserMessage); if (!registry.TryResolve(request.Source, out var adapter) || adapter is null) throw new EngineeringValidationException("source-adapter-not-implemented", "The source adapter is not implemented."); var timeout = TimeSpan.FromMilliseconds(request.TimeoutPolicy.TimeoutMs); var job = jobs.Create(request.RequestId, request.CorrelationId, request.Source, timeout); var token = cancellations.Register(job.JobId, requestToken, timeout); _ = Task.Run(() => Run(job, request, adapter, token)); return job; }
    async Task Run(EngineeringJobRecord job, EngineeringExtractionRequest request, IEngineeringSourceAdapter adapter, CancellationToken token) { try { jobs.TryTransition(job.JobId, JobState.Extracting, EngineeringStage.Extraction, 1, "extraction-started"); var progress = new Progress<StandardProgress>(p => jobs.TryTransition(job.JobId, p.State, p.Stage, p.ProgressPercent, p.Message)); var result = await adapter.ExtractAsync(job.JobId, request, progress, token); var state = result.Status switch { StandardStatus.Success => JobState.Success, StandardStatus.PartialSuccess => JobState.PartialSuccess, StandardStatus.Empty => JobState.Empty, StandardStatus.Cancelled => JobState.Cancelled, StandardStatus.TimedOut => JobState.TimedOut, StandardStatus.Unavailable => JobState.Unavailable, _ => JobState.Failed }; jobs.TryTransition(job.JobId, state, result.Progress.Stage, 100, result.Progress.Message, result.Errors.FirstOrDefault(), result.Warnings.FirstOrDefault(), result); diagnostics.Event(request.RequestId, request.CorrelationId, job.JobId, request.Source, result.Progress.Stage, state.ToString(), result.DurationMs, errorCode: result.Errors.FirstOrDefault()?.Code); } catch (OperationCanceledException) { if (jobs.TryGet(job.JobId, out var current) && current is not null) { var timeout = cancellations.WasTimedOut(job.JobId); var state = timeout ? JobState.TimedOut : JobState.Cancelled; var stage = timeout ? EngineeringStage.Timeout : EngineeringStage.Cancellation; var code = timeout ? "source-timeout" : "source-cancelled"; var error = new StructuredError(code, request.Source, stage, timeout ? "Source execution timed out." : "Source execution was cancelled.", timeout ? "The source timed out." : "The source execution was cancelled.", timeout, DateTimeOffset.UtcNow); jobs.TryTransition(job.JobId, state, stage, 100, code, error); } } finally { cancellations.Complete(job.JobId); } }
static SourceCapability Unsupported(EngineeringSource source) => new(
    Source: source,
    Readiness: SourceReadiness.Unavailable,
    DiscoveryModes: [DiscoveryMode.Unsupported],
    SupportsExactId: false,
    SupportsNameSearch: false,
    SupportsNumberSearch: false,
    SupportsStructureExtraction: false,
    SupportsRevisionContext: false,
    SupportsChangeContext: false,
    SupportsRequirements: false,
    SupportsOperationalImpact: false,
    SupportsConfigurationContext: false,
    SupportsCancellation: false,
    SupportsRetry: false,
    SupportsPartialSuccess: false,
    RequiredOrganizationContext: [],
    KnownLimitations: ["Adapter not implemented in this slice."]
);
}
