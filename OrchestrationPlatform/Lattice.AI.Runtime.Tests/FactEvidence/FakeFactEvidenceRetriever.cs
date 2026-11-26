using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.FactEvidence;

namespace Lattice.AI.Runtime.Tests.FactEvidence;

public sealed class FakeFactEvidenceRetriever(
    Exception? failure = null,
    FactEvidenceRetrievalResult? result = null) : IFactEvidenceRetriever
{
    public int CallCount { get; private set; }
    public FactEvidenceQuery? LastQuery { get; private set; }
    public FactEvidenceRetrievalResult? LastResult { get; private set; }

    public Task<FactEvidenceRetrievalResult> RetrieveAsync(
        FactEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        cancellationToken.ThrowIfCancellationRequested();
        CallCount++;
        LastQuery = query;

        if (failure is not null) throw failure;

        LastResult = result ?? new FactEvidenceRetrievalResult(
            query.InvestigationId,
            1,
            query.SourceVersion,
            query.OntologyVersion,
            query.Authorization.Scope.DecisionId,
            query.RequestContext.RequestId,
            query.RequestContext.TraceId,
            []);
        return Task.FromResult(LastResult);
    }
}
