using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.SourceEvidence;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class FakeSourceEvidenceRetriever : ISourceEvidenceRetriever
{
    private readonly IReadOnlyList<SourceEvidencePassage> _passages;
    private readonly Exception? _failure;

    public FakeSourceEvidenceRetriever(
        IReadOnlyList<SourceEvidencePassage>? passages = null,
        Exception? failure = null)
    {
        _passages = passages ?? Array.Empty<SourceEvidencePassage>();
        _failure = failure;
        if (_passages.Any(passage =>
                passage is null ||
                !passage.PassageId.StartsWith("SYNTH-PASSAGE-", StringComparison.Ordinal) ||
                !passage.ParentRecordId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                !passage.SourceRecordId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                !passage.ProvenanceId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                passage.EvidenceIds.Any(id => !id.StartsWith("SYNTH-", StringComparison.Ordinal))))
        {
            throw new ArgumentException("The fake retriever accepts only synthetic fixture passages.", nameof(passages));
        }
    }

    public int CallCount { get; private set; }

    public SourceEvidenceQuery? LastQuery { get; private set; }

    public SourceEvidenceRetrievalResult? LastResult { get; private set; }

    public Task<SourceEvidenceRetrievalResult> RetrieveAsync(
        SourceEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        cancellationToken.ThrowIfCancellationRequested();
        CallCount++;
        LastQuery = query;

        if (_failure is not null)
        {
            throw _failure;
        }

        var result = new SourceEvidenceRetrievalResult(
            query.InvestigationId,
            1,
            "synthetic-source-evidence-v1",
            query.Authorization.Scope.DecisionId,
            query.RequestContext.RequestId,
            query.RequestContext.TraceId,
            _passages);
        LastResult = result;
        return Task.FromResult(result);
    }
}
