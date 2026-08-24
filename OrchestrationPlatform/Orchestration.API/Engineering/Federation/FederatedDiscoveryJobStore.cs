using System.Collections.Concurrent;
using Orchestration.API.Engineering.Contracts;

namespace Orchestration.API.Engineering.Federation;

public interface IFederatedDiscoveryJobStore
{
    FederatedDiscoveryJobSnapshot Create(string requestId, string correlationId, IReadOnlyList<EngineeringSource> sources);
    bool TryGet(string parentJobId, out FederatedDiscoveryJobSnapshot? snapshot);
    bool TryStartAttempt(string parentJobId, EngineeringSource source, out FederatedSourceJobSnapshot? child);
    bool TryCompleteAttempt(string parentJobId, string sourceExecutionId, FederatedSourceDiscoveryOutcome outcome);
    bool TrySetState(string parentJobId, FederatedJobState state, FederatedEngineeringDiscoveryResult? result = null);
}

public sealed class FederatedDiscoveryJobStore : IFederatedDiscoveryJobStore
{
    private readonly ConcurrentDictionary<string, FederatedDiscoveryJobSnapshot> jobs = new();

    public FederatedDiscoveryJobSnapshot Create(string requestId, string correlationId, IReadOnlyList<EngineeringSource> sources)
    {
        var now = DateTimeOffset.UtcNow;
        var id = $"federated-discovery-{Guid.NewGuid():N}";
        var children = sources.Select(source => new FederatedSourceJobSnapshot(
            $"discovery-{source.ToString().ToLowerInvariant()}-{Guid.NewGuid():N}", source, 1,
            StandardStatus.Queued, now, null, true, false, null)).ToArray();
        var snapshot = new FederatedDiscoveryJobSnapshot(id, requestId, correlationId,
            FederatedJobState.Accepted, now, null, children, null);
        jobs[id] = snapshot;
        return snapshot;
    }

    public bool TryGet(string parentJobId, out FederatedDiscoveryJobSnapshot? snapshot) =>
        jobs.TryGetValue(parentJobId, out snapshot);

    public bool TryStartAttempt(string parentJobId, EngineeringSource source, out FederatedSourceJobSnapshot? child)
    {
        child = null;
        while (jobs.TryGetValue(parentJobId, out var old))
        {
            var prior = old.Sources.Where(x => x.Source == source).OrderByDescending(x => x.Attempt).FirstOrDefault();
            var now = DateTimeOffset.UtcNow;
            child = new FederatedSourceJobSnapshot(
                $"discovery-{source.ToString().ToLowerInvariant()}-{Guid.NewGuid():N}", source,
                (prior?.Attempt ?? 0) + 1, StandardStatus.Queued, now, null, true, false, null);
            var next = old with { State = FederatedJobState.Discovering, Sources = old.Sources.Append(child).ToArray(), CompletedAt = null, Result = null };
            if (jobs.TryUpdate(parentJobId, next, old)) return true;
        }
        return false;
    }

    public bool TryCompleteAttempt(string parentJobId, string sourceExecutionId, FederatedSourceDiscoveryOutcome outcome)
    {
        while (jobs.TryGetValue(parentJobId, out var old))
        {
            var current = old.Sources.FirstOrDefault(x => x.SourceExecutionId == sourceExecutionId);
            if (current is null || !current.Active) return false;
            var latestAttempt = old.Sources.Where(x => x.Source == current.Source).Max(x => x.Attempt);
            if (current.Attempt != latestAttempt) return false;
            var children = old.Sources.Select(x => x.SourceExecutionId == sourceExecutionId
                ? x with { Status = outcome.Status, CompletedAt = outcome.CompletedAt, Active = false, Retryable = outcome.Retryable, Outcome = outcome }
                : x).ToArray();
            if (jobs.TryUpdate(parentJobId, old with { Sources = children }, old)) return true;
        }
        return false;
    }

    public bool TrySetState(string parentJobId, FederatedJobState state, FederatedEngineeringDiscoveryResult? result = null)
    {
        while (jobs.TryGetValue(parentJobId, out var old))
        {
            var complete = state is FederatedJobState.AwaitingSelection or FederatedJobState.Success or FederatedJobState.PartialSuccess
                or FederatedJobState.Empty or FederatedJobState.Unavailable or FederatedJobState.Cancelled or FederatedJobState.Failed;
            var next = old with { State = state, CompletedAt = complete ? DateTimeOffset.UtcNow : null, Result = result ?? old.Result };
            if (jobs.TryUpdate(parentJobId, next, old)) return true;
        }
        return false;
    }
}
