using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Evidence;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class SourceEvidenceIndexStatusTests
{
    [Fact]
    public void RevisionStatusProgressionPreservesItsRevisionAndSerializesTheVersionedState()
    {
        var queued = CreateStatus(7, SourceEvidenceIndexState.Queued);
        var processing = queued with { Status = SourceEvidenceIndexState.Processing };
        var complete = processing with { Status = SourceEvidenceIndexState.Complete };
        var statuses = new[] { queued, processing, complete };

        Assert.All(statuses, status =>
        {
            Assert.Equal("1.0", status.SchemaVersion);
            Assert.Equal("synthetic-investigation", status.InvestigationId);
            Assert.Equal(7, status.SnapshotRevision);
        });

        Assert.Equal(
            [SourceEvidenceIndexState.Queued, SourceEvidenceIndexState.Processing, SourceEvidenceIndexState.Complete],
            statuses.Select(status => status.Status));
        Assert.Contains(
            "\"status\":\"queued\"",
            JsonSerializer.Serialize(queued, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
            StringComparison.Ordinal);
    }

    [Fact]
    public void FailedRefreshKeepsThePreviousRevisionStaleAndDistinctFromDeleted()
    {
        var indexed = CreateStatus(7, SourceEvidenceIndexState.Complete);
        var failedRefresh = CreateStatus(8, SourceEvidenceIndexState.Failed);
        var stale = indexed with { Status = SourceEvidenceIndexState.Stale };
        var deleted = stale with { Status = SourceEvidenceIndexState.Deleted };

        Assert.Equal(8, failedRefresh.SnapshotRevision);
        Assert.Equal(SourceEvidenceIndexState.Failed, failedRefresh.Status);
        Assert.Equal(7, stale.SnapshotRevision);
        Assert.Equal(7, deleted.SnapshotRevision);
        Assert.NotEqual(stale.Status, deleted.Status);
    }

    [Theory]
    [InlineData(SourceEvidenceIndexState.Queued)]
    [InlineData(SourceEvidenceIndexState.Processing)]
    [InlineData(SourceEvidenceIndexState.Complete)]
    [InlineData(SourceEvidenceIndexState.Partial)]
    [InlineData(SourceEvidenceIndexState.Stale)]
    [InlineData(SourceEvidenceIndexState.Failed)]
    [InlineData(SourceEvidenceIndexState.Deleted)]
    public void LifecycleContractSupportsEveryPlannedState(SourceEvidenceIndexState state)
    {
        var status = CreateStatus(9, state);

        Assert.Equal(state, status.Status);
        Assert.Equal(9, status.SnapshotRevision);
    }

    private static SourceEvidenceIndexStatus CreateStatus(
        int snapshotRevision,
        SourceEvidenceIndexState status) =>
        new(
            "1.0",
            "synthetic-investigation",
            snapshotRevision,
            status,
            DateTimeOffset.Parse("2026-11-24T00:00:00Z"));
}
