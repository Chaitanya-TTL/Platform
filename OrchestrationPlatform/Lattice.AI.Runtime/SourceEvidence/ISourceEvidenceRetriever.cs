using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.SourceEvidence;

public interface ISourceEvidenceRetriever
{
    Task<SourceEvidenceRetrievalResult> RetrieveAsync(
        SourceEvidenceQuery query,
        CancellationToken cancellationToken);
}

public sealed class SourceEvidenceUnavailableException(string message) : InvalidOperationException(message)
{
}
