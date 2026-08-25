using System.Collections.Concurrent;
using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Services;

public interface IEngineeringJobStore { EngineeringJobRecord Create(string requestId, string correlationId, EngineeringSource source, TimeSpan timeout); bool TryGet(string jobId, out EngineeringJobRecord? job); string LookupStatus(string jobId); bool TryTransition(string jobId, JobState state, EngineeringStage stage, int progress, string message, StructuredError? error = null, StructuredWarning? warning = null, StandardExtractionResult? result = null); int CleanupExpired(TimeSpan retention); }
public sealed class EngineeringJobStore : IEngineeringJobStore
{
    readonly ConcurrentDictionary<string, EngineeringJobRecord> jobs = new(); readonly ConcurrentDictionary<string, DateTimeOffset> expired = new();
    static readonly HashSet<JobState> terminal = [JobState.Success, JobState.PartialSuccess, JobState.Empty, JobState.Failed, JobState.Unavailable, JobState.Cancelled, JobState.TimedOut];
    public EngineeringJobRecord Create(string requestId, string correlationId, EngineeringSource source, TimeSpan timeout) { var now = DateTimeOffset.UtcNow; var id = $"eng-{source.ToString().ToLowerInvariant()}-{Guid.NewGuid():N}"; var j = new EngineeringJobRecord(id, requestId, correlationId, source, JobState.Accepted, EngineeringStage.Validation, 0, now, null, null, null, now + timeout, [], [], false, null, new("accepted", null, null, now)); jobs[id] = j; return j; }
    public bool TryGet(string id, out EngineeringJobRecord? j) => jobs.TryGetValue(id, out j);
    public string LookupStatus(string id) => jobs.ContainsKey(id) ? "active" : expired.ContainsKey(id) ? "expired" : "unknown";
    public bool TryTransition(string id, JobState state, EngineeringStage stage, int progress, string message, StructuredError? error = null, StructuredWarning? warning = null, StandardExtractionResult? result = null) { while (jobs.TryGetValue(id, out var old)) { if (terminal.Contains(old.State)) return false; if (state == JobState.Success && old.State is JobState.CancellationRequested or JobState.Cancelled or JobState.TimedOut) return false; if (progress < old.ProgressPercent) return false; var now = DateTimeOffset.UtcNow; var ws = old.Warnings.ToList(); var es = old.Errors.ToList(); if (warning != null) ws.Add(warning); if (error != null) es.Add(error); var next = old with { State = state, CurrentStage = stage, ProgressPercent = Math.Clamp(progress, 0, 100), StartedAt = old.StartedAt ?? now, CompletedAt = terminal.Contains(state) ? now : null, CancellationRequestedAt = state == JobState.CancellationRequested ? now : old.CancellationRequestedAt, Warnings = ws, Errors = es, ResultAvailable = result != null, Result = result ?? old.Result, Diagnostic = new(message, warning?.Code, error?.Code, now) }; if (jobs.TryUpdate(id, next, old)) return true; } return false; }
    public int CleanupExpired(TimeSpan retention)
    {
        var cutoff = DateTimeOffset.UtcNow - retention;
        var count = 0;

        foreach (var entry in jobs)
        {
            if (entry.Value.CompletedAt is { } completedAt &&
                completedAt < cutoff &&
                jobs.TryRemove(entry.Key, out _))
            {
                expired[entry.Key] = DateTimeOffset.UtcNow;
                count++;
            }
        }

        return count;
    }
}
