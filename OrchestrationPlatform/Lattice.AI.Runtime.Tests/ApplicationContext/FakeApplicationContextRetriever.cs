using Lattice.AI.Runtime.ApplicationContext;
using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.Tests.ApplicationContext;

public sealed class FakeApplicationContextRetriever(
    Exception? failure = null,
    ApplicationContextRetrievalResult? result = null) : IApplicationContextRetriever
{
    public int CallCount { get; private set; }
    public ApplicationContextQuery? LastQuery { get; private set; }
    public ApplicationContextRetrievalResult? LastResult { get; private set; }

    public Task<ApplicationContextRetrievalResult> RetrieveAsync(
        ApplicationContextQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        cancellationToken.ThrowIfCancellationRequested();
        CallCount++;
        LastQuery = query;

        if (failure is not null) throw failure;

        LastResult = result ?? new ApplicationContextRetrievalResult(
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
