using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.EntityResolution;

namespace Orchestration.API.AI.Adapters;

public sealed class PlmBrainEntityResolver(IPlmBrainClient client) : IEngineeringEntityResolver
{
    public async Task<EntityResolutionResult> ResolveAsync(
        string investigationId,
        QuestionInterpretation interpretation,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(investigationId);
        if (string.IsNullOrWhiteSpace(interpretation.CandidateEntityId))
        {
            return new EntityResolutionResult(
                EntityResolutionDisposition.Unresolved,
                null,
                Array.Empty<string>(),
                ["An explicit entity identifier is required."]);
        }

        var result = await client.ResolveEntityAsync(
            investigationId,
            interpretation.CandidateEntityId,
            authorization,
            requestContext,
            cancellationToken);
        EnsureVersionAndScope(result.ContractVersion, result.InvestigationId, investigationId);
        return new EntityResolutionResult(
            result.Disposition,
            result.Entity,
            result.CandidateIds,
            result.Diagnostics);
    }

    internal static void EnsureVersionAndScope(
        string contractVersion,
        string responseInvestigationId,
        string expectedInvestigationId)
    {
        if (contractVersion != Lattice.AI.Runtime.Evidence.PlmBrainServiceContract.Version)
        {
            throw new InvalidOperationException("PLM Brain returned an unsupported evidence contract version.");
        }
        if (!string.Equals(responseInvestigationId, expectedInvestigationId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("PLM Brain returned evidence for a different investigation.");
        }
    }
}
