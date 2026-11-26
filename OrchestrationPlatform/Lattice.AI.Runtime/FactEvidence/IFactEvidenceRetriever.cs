using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.FactEvidence;

public interface IFactEvidenceRetriever
{
    Task<FactEvidenceRetrievalResult> RetrieveAsync(
        FactEvidenceQuery query,
        CancellationToken cancellationToken);
}

public sealed class FactEvidenceUnavailableException(string message) : InvalidOperationException(message)
{
}
