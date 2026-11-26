using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
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
        ValidateResponse(response, query.InvestigationId, query.Authorization, query.RequestContext);
        return response.Evidence;
    }

    public async Task<EvidenceRetrievalResult> RetrieveInvestigationAsync(
        InvestigationEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        var response = await client.RetrieveInvestigationAsync(
            query.InvestigationId,
            query.Authorization,
            query.RequestContext,
            cancellationToken);
        ValidateResponse(response, query.InvestigationId, query.Authorization, query.RequestContext);
        return response.Evidence;
    }

    private static void ValidateResponse(
        PlmBrainImpactEvidenceResponse response,
        string investigationId,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext)
    {
        PlmBrainEntityResolver.EnsureVersionAndScope(
            response.ContractVersion,
            response.Evidence.InvestigationId,
            investigationId);

        var evidence = response.Evidence;
        if (evidence.RequestId != requestContext.RequestId ||
            evidence.TraceId != requestContext.TraceId ||
            evidence.AuthorizationDecisionId != authorization.Scope.DecisionId ||
            evidence.Sources.Any(source => string.IsNullOrWhiteSpace(source.ProvenanceId)))
        {
            throw new InvalidOperationException("PLM Brain returned incomplete or mismatched evidence provenance.");
        }
    }
}
