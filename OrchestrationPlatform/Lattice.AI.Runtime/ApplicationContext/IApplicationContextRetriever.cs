using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.ApplicationContext;

public interface IApplicationContextRetriever
{
    Task<ApplicationContextRetrievalResult> RetrieveAsync(
        ApplicationContextQuery query,
        CancellationToken cancellationToken);
}

public sealed class ApplicationContextUnavailableException(string message) : InvalidOperationException(message)
{
}
