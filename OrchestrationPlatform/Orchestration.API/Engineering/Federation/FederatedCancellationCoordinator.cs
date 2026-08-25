using System.Collections.Concurrent;
using Orchestration.API.Engineering.Contracts;

namespace Orchestration.API.Engineering.Federation;

public interface IFederatedCancellationCoordinator
{
    CancellationToken RegisterParent(string parentJobId, CancellationToken requestToken);
    CancellationToken CreateChildToken(string parentJobId, TimeSpan timeout, CancellationToken requestToken);
    bool Cancel(string parentJobId);
    void Complete(string parentJobId);
}

public sealed class FederatedCancellationCoordinator : IFederatedCancellationCoordinator, IDisposable
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> parents = new();

    public CancellationToken RegisterParent(string id, CancellationToken requestToken)
    {
        var source = CancellationTokenSource.CreateLinkedTokenSource(requestToken);
        if (!parents.TryAdd(id, source)) { source.Dispose(); throw new InvalidOperationException("Parent cancellation already registered."); }
        return source.Token;
    }

    public CancellationToken CreateChildToken(string id, TimeSpan timeout, CancellationToken requestToken)
    {
        if (!parents.TryGetValue(id, out var parent)) throw new InvalidOperationException("Parent cancellation is not registered.");
        var timeoutSource = new CancellationTokenSource(timeout);
        return CancellationTokenSource.CreateLinkedTokenSource(parent.Token, requestToken, timeoutSource.Token).Token;
    }

    public bool Cancel(string id) { if (!parents.TryGetValue(id, out var source)) return false; source.Cancel(); return true; }
    public void Complete(string id) { if (parents.TryRemove(id, out var source)) source.Dispose(); }
    public void Dispose() { foreach (var id in parents.Keys) Complete(id); }
}
