using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.FactEvidence;

public sealed class UnavailableFactEvidenceRetriever : IFactEvidenceRetriever
{
    public Task<FactEvidenceRetrievalResult> RetrieveAsync(
        FactEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        cancellationToken.ThrowIfCancellationRequested();
        throw new FactEvidenceUnavailableException(
            "No approved fact-evidence provider is configured.");
    }
}
