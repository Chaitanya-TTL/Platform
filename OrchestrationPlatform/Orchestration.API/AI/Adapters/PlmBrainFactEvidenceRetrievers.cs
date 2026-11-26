using Lattice.AI.Runtime.ApplicationContext;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.FactEvidence;

namespace Orchestration.API.AI.Adapters;

public sealed class PlmBrainFactEvidenceRetriever(IPlmBrainClient client) : IFactEvidenceRetriever
{
    public async Task<FactEvidenceRetrievalResult> RetrieveAsync(
        FactEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        var response = await client.RetrieveFactEvidenceAsync(
            query.InvestigationId,
            query.Plan,
            query.SourceVersion,
            query.OntologyVersion,
            query.Authorization,
            query.RequestContext,
            cancellationToken);

        var result = response.Evidence;
        ValidateBinding(
            response.ContractVersion,
            result.InvestigationId,
            result.SourceVersion,
            result.OntologyVersion,
            result.AuthorizationDecisionId,
            result.RequestId,
            result.TraceId,
            query.InvestigationId,
            query.SourceVersion,
            query.OntologyVersion,
            query.Authorization,
            query.RequestContext);
        return result;
    }

    internal static void ValidateBinding(
        string contractVersion,
        string responseInvestigationId,
        string responseSourceVersion,
        string responseOntologyVersion,
        string responseDecisionId,
        string responseRequestId,
        string responseTraceId,
        string investigationId,
        string sourceVersion,
        string ontologyVersion,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext)
    {
        PlmBrainEntityResolver.EnsureVersionAndScope(
            contractVersion,
            responseInvestigationId,
            investigationId);

        if (!string.Equals(responseSourceVersion, sourceVersion, StringComparison.Ordinal) ||
            !string.Equals(responseOntologyVersion, ontologyVersion, StringComparison.Ordinal) ||
            !string.Equals(responseDecisionId, authorization.Scope.DecisionId, StringComparison.Ordinal) ||
            !string.Equals(responseRequestId, requestContext.RequestId, StringComparison.Ordinal) ||
            !string.Equals(responseTraceId, requestContext.TraceId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("PLM Brain returned fact evidence with mismatched request or snapshot provenance.");
        }
    }
}

public sealed class PlmBrainApplicationContextRetriever(IPlmBrainClient client) : IApplicationContextRetriever
{
    public async Task<ApplicationContextRetrievalResult> RetrieveAsync(
        ApplicationContextQuery query,
        CancellationToken cancellationToken)
    {
        var response = await client.RetrieveApplicationContextAsync(
            query.InvestigationId,
            query.Plan,
            query.SourceVersion,
            query.OntologyVersion,
            query.Authorization,
            query.RequestContext,
            cancellationToken);

        var result = response.Evidence;
        PlmBrainFactEvidenceRetriever.ValidateBinding(
            response.ContractVersion,
            result.InvestigationId,
            result.SourceVersion,
            result.OntologyVersion,
            result.AuthorizationDecisionId,
            result.RequestId,
            result.TraceId,
            query.InvestigationId,
            query.SourceVersion,
            query.OntologyVersion,
            query.Authorization,
            query.RequestContext);
        return result;
    }
}
