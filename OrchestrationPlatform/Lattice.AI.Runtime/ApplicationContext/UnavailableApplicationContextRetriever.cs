using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.ApplicationContext;

public sealed class UnavailableApplicationContextRetriever : IApplicationContextRetriever
{
    public Task<ApplicationContextRetrievalResult> RetrieveAsync(
        ApplicationContextQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        cancellationToken.ThrowIfCancellationRequested();
        throw new ApplicationContextUnavailableException(
            "No approved application-context provider is configured.");
    }
}
