using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Federation;

public interface IFederatedDiscoveryStatusAggregator { StandardStatus Aggregate(IReadOnlyList<FederatedSourceDiscoveryOutcome> outcomes); }
public sealed class FederatedDiscoveryStatusAggregator : IFederatedDiscoveryStatusAggregator
{
    public StandardStatus Aggregate(IReadOnlyList<FederatedSourceDiscoveryOutcome> values)
    {
        if (values.Count == 0) return StandardStatus.Empty;
        if (values.All(x => x.Status == StandardStatus.Cancelled)) return StandardStatus.Cancelled;
        if (values.All(x => x.Status == StandardStatus.Unavailable)) return StandardStatus.Unavailable;
        if (values.All(x => x.Status == StandardStatus.Empty)) return StandardStatus.Empty;
        var usable = values.Count(x => (x.Status is StandardStatus.Success or StandardStatus.PartialSuccess) && x.Candidates.Count > 0);
        var degraded = values.Any(x => x.Status is StandardStatus.Failed or StandardStatus.Unavailable or StandardStatus.TimedOut or StandardStatus.Cancelled or StandardStatus.CapabilityLimited);
        if (usable > 0) return degraded ? StandardStatus.PartialSuccess : StandardStatus.Success;
        if (values.Any(x => x.Status == StandardStatus.CapabilityLimited)) return StandardStatus.PartialSuccess;
        return values.Any(x => x.Status == StandardStatus.Failed) ? StandardStatus.Failed : StandardStatus.Empty;
    }
}
