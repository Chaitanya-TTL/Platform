using Orchestration.API.Engineering.Adapters.Teamcenter;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;
using Orchestration.API.Services;
using Xunit;

namespace Orchestration.API.Tests.Engineering;

public sealed class TeamcenterEngineeringAdapterTests
{
    [Fact]
    public async Task ExactIdRemainsUnverifiedBeforeExtraction()
    {
        var adapter = CreateAdapter(new SuccessfulExecutor(), new SuccessfulCapture());
        var outcome = await adapter.DiscoverAsync(Discovery("000123", null),
            new("000123", "000123", [], [], IdentifierType.ItemId, ConfidenceClass.Probable), CancellationToken.None);
        var candidate = Assert.Single(outcome.Candidates);
        Assert.Equal(ConfidenceClass.Unverified, candidate.ConfidenceClass);
        Assert.Equal(MatchCategory.SourceNativeReference, candidate.MatchCategory);
    }

    [Fact]
    public async Task ProductNameRemainsCapabilityLimited()
    {
        var adapter = CreateAdapter(new SuccessfulExecutor(), new SuccessfulCapture());
        var outcome = await adapter.DiscoverAsync(Discovery(null, "Pump"),
            new("Pump", "Pump", [], [], IdentifierType.ProductName, ConfidenceClass.Probable), CancellationToken.None);
        Assert.Equal(StandardStatus.CapabilityLimited, outcome.Status);
        Assert.Empty(outcome.Candidates);
    }

    [Fact]
    public async Task OptionalTransformationFailureProducesPartialSuccess()
    {
        var adapter = CreateAdapter(new OptionalFailureExecutor(), new SuccessfulCapture());
        var result = await adapter.ExtractAsync("job-1", Extraction(), new Progress<StandardProgress>(), CancellationToken.None);
        Assert.Equal(StandardStatus.PartialSuccess, result.Status);
        Assert.Contains(result.Warnings, warning => warning.Code == "configit-transformation-failed");
        Assert.Equal(ConfidenceClass.Verified, result.Resolution.Candidate!.ConfidenceClass);
    }

    [Fact]
    public async Task CaptureIdentityFailureIsSafe()
    {
        var adapter = CreateAdapter(new SuccessfulExecutor(), new FailedCapture("teamcenter-output-identity-mismatch"));
        var result = await adapter.ExtractAsync("job-1", Extraction(), new Progress<StandardProgress>(), CancellationToken.None);
        Assert.Equal(StandardStatus.Failed, result.Status);
        Assert.Equal("teamcenter-output-identity-mismatch", Assert.Single(result.Errors).Code);
        Assert.DoesNotContain("C:\\", System.Text.Json.JsonSerializer.Serialize(result));
    }

    [Fact]
    public async Task CancellationPropagates()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        var adapter = CreateAdapter(new SuccessfulExecutor(), new SuccessfulCapture());
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            adapter.ExtractAsync("job-1", Extraction(), new Progress<StandardProgress>(), cts.Token));
    }

    private static TeamcenterEngineeringAdapter CreateAdapter(ISubprocessExecutor executor, ITeamcenterArtifactCaptureService capture) =>
        new(executor, capture, new TeamcenterFailureClassifier());

    private static EngineeringDiscoveryRequest Discovery(string? id, string? name) =>
        new(EngineeringContractVersions.V1, "request-1", "correlation-1", [EngineeringSource.Teamcenter],
            new(id ?? name, id, name), 10, new(30000), DateTimeOffset.UtcNow);

    private static EngineeringExtractionRequest Extraction() =>
        new(EngineeringContractVersions.V1, "request-1", "correlation-1", EngineeringSource.Teamcenter,
            new("teamcenter:000123", EngineeringSource.Teamcenter, "000123", "000123", "teamcenter-item",
                null, null, null, null, MatchCategory.SourceNativeReference, "Unverified.", ConfidenceClass.Unverified,
                ["structure"], new Dictionary<string, string?>(),
                new(ProvenanceKind.CapabilityOnly, "unit-test", DateTimeOffset.UtcNow), true),
            ["structure"], null, new(30000), DateTimeOffset.UtcNow);

    private class SuccessfulExecutor : ISubprocessExecutor
    {
        public virtual Task<SubprocessResult> ExecuteAsync(ExtractionRequest request, Func<string, Task> progressCallback,
            CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new SubprocessResult
            {
                Success = true, BomOutputPath = "legacy-output.json", ProcessExitCode = 0,
                Bom = new BomRoot { SourceItemId = "000123", BomRootNode = new BomNode { ItemId = "000123" } }
            });
        }
    }

    private sealed class OptionalFailureExecutor : SuccessfulExecutor
    {
        public override async Task<SubprocessResult> ExecuteAsync(ExtractionRequest request, Func<string, Task> progressCallback,
            CancellationToken cancellationToken = default)
        {
            var result = await base.ExecuteAsync(request, progressCallback, cancellationToken);
            return new SubprocessResult
            {
                Success = result.Success, Bom = result.Bom, BomOutputPath = result.BomOutputPath,
                ProcessExitCode = 1, OptionalStageWarning = "optional stage failed"
            };
        }
    }

    private sealed class SuccessfulCapture : ITeamcenterArtifactCaptureService
    {
        public Task<TeamcenterArtifactCaptureResult> CaptureAsync(string jobId, string requestedItemId,
            string? legacyOutputPath, DateTimeOffset executionStartedAt, IReadOnlyList<TeamcenterStageEvidence> stages,
            CancellationToken token) => Task.FromResult(new TeamcenterArtifactCaptureResult(true, null,
                new BomRoot { SourceItemId = requestedItemId, BomRootNode = new BomNode { ItemId = requestedItemId } },
                [new("artifact-1", EngineeringSource.Teamcenter, "normalized-bom", DateTimeOffset.UtcNow,
                    EvidenceAvailability.Available, "abc", $"engineering-jobs/{jobId}/teamcenter/normalized-bom.json",
                    ArtifactSensitivity.Sensitive, "delete-after-24-hours")], null));
        public int CleanupExpired(DateTimeOffset now) => 0;
    }

    private sealed class FailedCapture(string code) : ITeamcenterArtifactCaptureService
    {
        public Task<TeamcenterArtifactCaptureResult> CaptureAsync(string jobId, string requestedItemId,
            string? legacyOutputPath, DateTimeOffset executionStartedAt, IReadOnlyList<TeamcenterStageEvidence> stages,
            CancellationToken token) => Task.FromResult(new TeamcenterArtifactCaptureResult(false, code, null, [], null));
        public int CleanupExpired(DateTimeOffset now) => 0;
    }
}
