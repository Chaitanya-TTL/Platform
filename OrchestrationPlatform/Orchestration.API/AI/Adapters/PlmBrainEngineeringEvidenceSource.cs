using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Evidence;

namespace Orchestration.API.AI.Adapters;

public sealed class PlmBrainEngineeringEvidenceSource(IPlmBrainClient client) : IEngineeringEvidenceSource
{
    public async Task<EvidenceRetrievalResult> RetrieveImpactAsync(
        Lattice.AI.Runtime.Contracts.Evidence.ImpactEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        var response = await client.RetrieveImpactAsync(
            query.InvestigationId,
            query.Subject.CanonicalId,
            query.Scope,
            query.Authorization,
            query.RequestContext,
            cancellationToken);
        PlmBrainEntityResolver.EnsureVersionAndScope(
            response.ContractVersion,
            response.Evidence.InvestigationId,
            query.InvestigationId);

        var evidence = response.Evidence;
        if (evidence.RequestId != query.RequestContext.RequestId ||
            evidence.TraceId != query.RequestContext.TraceId ||
            evidence.AuthorizationDecisionId != query.Authorization.Scope.DecisionId ||
            evidence.Sources.Any(source => string.IsNullOrWhiteSpace(source.ProvenanceId)))
        {
            throw new InvalidOperationException("PLM Brain returned incomplete or mismatched evidence provenance.");
        }

        return evidence;
    }
}
