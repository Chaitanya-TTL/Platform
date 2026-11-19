using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.Evidence;

public interface IEngineeringEvidenceSource
{
    Task<EvidenceRetrievalResult> RetrieveImpactAsync(
        ImpactEvidenceQuery query,
        CancellationToken cancellationToken);
}
