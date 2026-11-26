using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.SourceEvidence;

namespace Orchestration.API.AI.Adapters;

public sealed class UnavailableSourceEvidenceRetriever : ISourceEvidenceRetriever
{
    public Task<SourceEvidenceRetrievalResult> RetrieveAsync(
        SourceEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        cancellationToken.ThrowIfCancellationRequested();
        throw new SourceEvidenceUnavailableException(
            "No approved source-evidence retrieval adapter is configured.");
    }
}
