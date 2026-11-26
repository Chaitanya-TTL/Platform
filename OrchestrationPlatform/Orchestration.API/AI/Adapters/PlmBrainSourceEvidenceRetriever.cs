using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.SourceEvidence;

namespace Orchestration.API.AI.Adapters;

public sealed class PlmBrainSourceEvidenceRetriever(IPlmBrainClient client) : ISourceEvidenceRetriever
{
    public async Task<SourceEvidenceRetrievalResult> RetrieveAsync(
        SourceEvidenceQuery query,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var plan = new Lattice.AI.Runtime.Contracts.Scope.SourceEvidencePlan(
            true,
            query.RelevantEntityIds,
            query.SourceApplications,
            query.ExactIdentifiers,
            "runtime-source-evidence");
        var response = await client.RetrieveSourceEvidenceAsync(
            query.InvestigationId,
            plan,
            query.Authorization,
            query.RequestContext,
            cancellationToken).ConfigureAwait(false);

        if (response.ContractVersion != Lattice.AI.Runtime.Evidence.PlmBrainServiceContract.Version ||
            response.InvestigationId != query.InvestigationId ||
            response.AuthorizationDecisionId != query.Authorization.Scope.DecisionId ||
            response.RequestId != query.RequestContext.RequestId ||
            response.TraceId != query.RequestContext.TraceId ||
            response.Records is null ||
            string.IsNullOrWhiteSpace(response.SnapshotLifecycle) ||
            string.IsNullOrWhiteSpace(response.SnapshotCompleteness) ||
            response.Diagnostics is null)
        {
            throw new InvalidOperationException(
                "PLM Brain returned source evidence with mismatched request or authorization provenance.");
        }

        var passages = response.Records.Select(record =>
        {
            if (record.InvestigationId != response.InvestigationId ||
                record.SnapshotRevision != response.SnapshotRevision ||
                string.IsNullOrWhiteSpace(record.RecordId) ||
                string.IsNullOrWhiteSpace(record.SourceRecordId) ||
                string.IsNullOrWhiteSpace(record.ProvenanceId) ||
                record.Authority != "source-authoritative")
            {
                throw new InvalidOperationException(
                    "PLM Brain returned a source record with incomplete snapshot or source provenance.");
            }

            return new SourceEvidencePassage(
                record.RecordId,
                record.SourceRecordId,
                record.InvestigationId,
                record.SnapshotRevision,
                record.SourceApplication,
                record.SourceRecordId,
                record.CanonicalEntityIds,
                record.SourceRevision,
                record.Location,
                record.SearchableText,
                record.EvidenceIds,
                record.ProvenanceId,
                response.AuthorizationDecisionId,
                record.Freshness,
                "lattice-snapshot-projection",
                0,
                null,
                null)
            {
                DeepLink = record.DeepLink,
                SourceFieldName = record.SourceFieldName,
                CitationIds = record.CitationIds,
                SourceTimestamp = record.SourceTimestamp,
                CapturedAt = record.CapturedAt,
                EffectiveAt = record.EffectiveAt,
                ValidFrom = record.ValidFrom,
                ValidTo = record.ValidTo,
                SnapshotLifecycle = record.SnapshotLifecycle,
                SnapshotCompleteness = record.SnapshotCompleteness,
                SourceExtractionStatuses = record.SourceExtractionStatuses,
                SourceOperations = record.SourceOperations
            };
        }).ToArray();

        return new SourceEvidenceRetrievalResult(
            response.InvestigationId,
            response.SnapshotRevision,
            response.SourceVersion,
            response.AuthorizationDecisionId,
            response.RequestId,
            response.TraceId,
            Array.AsReadOnly(passages))
        {
            Diagnostics = new SourceEvidenceRetrievalDiagnostics(
                response.SnapshotLifecycle,
                response.SnapshotCompleteness,
                response.Diagnostics)
        };
    }
}
