using System.Collections.Concurrent;
using Orchestration.API.Engineering.Contracts;

namespace Orchestration.API.Engineering.Services;

public interface IEngineeringJobStore
{
    EngineeringJobRecord Create(string requestId, string correlationId, EngineeringSource source, TimeSpan timeout);
    bool TryGet(string jobId, out EngineeringJobRecord? job);
    bool TryGetResult(string jobId, out StandardExtractionResult? result);
    string LookupStatus(string jobId);
    bool TryTransition(string jobId, JobState state, EngineeringStage stage, int progress, string message, StructuredError? error = null, StructuredWarning? warning = null, StandardExtractionResult? result = null);
    int CleanupExpired(TimeSpan retention);
}

public sealed class EngineeringJobStore : IEngineeringJobStore
{
    private readonly ConcurrentDictionary<string, EngineeringJobRecord> jobs = new();
    private readonly ConcurrentDictionary<string, DateTimeOffset> expired = new();
    private static readonly HashSet<JobState> Terminal =
    [
        JobState.Success, JobState.PartialSuccess, JobState.Empty, JobState.Failed,
        JobState.Unavailable, JobState.Cancelled, JobState.TimedOut
    ];

    public EngineeringJobRecord Create(string requestId, string correlationId, EngineeringSource source, TimeSpan timeout)
    {
        var now = DateTimeOffset.UtcNow;
        var id = $"eng-{source.ToString().ToLowerInvariant()}-{Guid.NewGuid():N}";
        var job = new EngineeringJobRecord(id, requestId, correlationId, source, JobState.Accepted,
            EngineeringStage.Validation, 0, now, null, null, null, now + timeout, [], [], false, null,
            new("accepted", null, null, now));
        jobs[id] = job;
        return job;
    }

    public bool TryGet(string jobId, out EngineeringJobRecord? job) => jobs.TryGetValue(jobId, out job);

    public bool TryGetResult(string jobId, out StandardExtractionResult? result)
    {
        result = null;
        if (!jobs.TryGetValue(jobId, out var job) || !job.ResultAvailable || job.Result is null) return false;
        result = job.Result;
        return true;
    }

    public string LookupStatus(string jobId) => jobs.ContainsKey(jobId) ? "active" : expired.ContainsKey(jobId) ? "expired" : "unknown";

    public bool TryTransition(string id, JobState state, EngineeringStage stage, int progress, string message,
        StructuredError? error = null, StructuredWarning? warning = null, StandardExtractionResult? result = null)
    {
        while (jobs.TryGetValue(id, out var old))
        {
            // Adapters may report 100% success immediately before the execution service attaches
            // the final StandardExtractionResult. Permit only that same-terminal-state enrichment.
            var attachingResultToTerminalJob = Terminal.Contains(old.State) && result is not null &&
                                               old.Result is null && old.State == state;
            if (Terminal.Contains(old.State) && !attachingResultToTerminalJob) return false;
            if (state == JobState.Success && old.State is JobState.CancellationRequested or JobState.Cancelled or JobState.TimedOut) return false;
            if (progress < old.ProgressPercent) return false;

            var now = DateTimeOffset.UtcNow;
            var warnings = old.Warnings.ToList();
            var errors = old.Errors.ToList();
            if (warning is not null && !warnings.Any(x => x.Code == warning.Code && x.OccurredAt == warning.OccurredAt)) warnings.Add(warning);
            if (error is not null && !errors.Any(x => x.Code == error.Code && x.OccurredAt == error.OccurredAt)) errors.Add(error);

            var next = old with
            {
                State = state,
                CurrentStage = stage,
                ProgressPercent = Math.Clamp(progress, 0, 100),
                StartedAt = old.StartedAt ?? now,
                CompletedAt = Terminal.Contains(state) ? old.CompletedAt ?? now : null,
                CancellationRequestedAt = state == JobState.CancellationRequested ? now : old.CancellationRequestedAt,
                Warnings = warnings,
                Errors = errors,
                ResultAvailable = result is not null || old.ResultAvailable,
                Result = result ?? old.Result,
                Diagnostic = new(message, warning?.Code, error?.Code, now)
            };
            if (jobs.TryUpdate(id, next, old)) return true;
        }
        return false;
    }

    public int CleanupExpired(TimeSpan retention)
    {
        var cutoff = DateTimeOffset.UtcNow - retention;
        var count = 0;
        foreach (var entry in jobs)
        {
            if (entry.Value.CompletedAt is { } completedAt && completedAt < cutoff && jobs.TryRemove(entry.Key, out _))
            {
                expired[entry.Key] = DateTimeOffset.UtcNow;
                count++;
            }
        }
        return count;
    }
}
