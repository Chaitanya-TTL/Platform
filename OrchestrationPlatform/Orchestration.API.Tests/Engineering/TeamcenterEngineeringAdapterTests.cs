using Orchestration.API.Engineering.Adapters.Teamcenter;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;
using Orchestration.API.Services;
using Xunit;

namespace Orchestration.API.Tests.Engineering;

public class TeamcenterEngineeringAdapterTests
{
    [Fact]
    public async Task ExactIdIsUnverifiedUntilExtraction()
    {
        var adapter = new TeamcenterEngineeringAdapter(new FakeSubprocessExecutor());
        var request = CreateDiscoveryRequest("000123", null);

        var normalization = new QueryNormalizationRecord(
            OriginalValue: "000123",
            NormalizedValue: "000123",
            Transformations: [],
            Warnings: [],
            InferredIdentifierType: IdentifierType.ItemId,
            InferenceConfidence: ConfidenceClass.Probable
        );

        var outcome = await adapter.DiscoverAsync(
            request,
            normalization,
            CancellationToken.None
        );

        var candidate = Assert.Single(outcome.Candidates);

        Assert.Equal(ConfidenceClass.Unverified, candidate.ConfidenceClass);
        Assert.Equal(
            MatchCategory.SourceNativeReference,
            candidate.MatchCategory
        );
        Assert.True(candidate.CanExtract);
    }

    [Fact]
    public async Task NameOnlyIsCapabilityLimited()
    {
        var adapter = new TeamcenterEngineeringAdapter(new FakeSubprocessExecutor());
        var request = CreateDiscoveryRequest(null, "Pump");

        var normalization = new QueryNormalizationRecord(
            OriginalValue: "Pump",
            NormalizedValue: "Pump",
            Transformations: [],
            Warnings: [],
            InferredIdentifierType: IdentifierType.ProductName,
            InferenceConfidence: ConfidenceClass.Probable
        );

        var outcome = await adapter.DiscoverAsync(
            request,
            normalization,
            CancellationToken.None
        );

        Assert.Equal(StandardStatus.CapabilityLimited, outcome.Status);
        Assert.Empty(outcome.Candidates);
        Assert.False(outcome.Retryable);
    }

    [Fact]
    public async Task ValidOutputVerifiesCandidateAndHidesPhysicalPath()
    {
        var adapter = new TeamcenterEngineeringAdapter(new FakeSubprocessExecutor());
        var candidate = CreateCandidate();

        var request = new EngineeringExtractionRequest(
            SchemaVersion: EngineeringContractVersions.V1,
            RequestId: "request-1",
            CorrelationId: "correlation-1",
            Source: EngineeringSource.Teamcenter,
            Candidate: candidate,
            RequestedEvidence: ["structure"],
            OrganizationContext: null,
            TimeoutPolicy: new TimeoutPolicy(30000),
            InitiatedAt: DateTimeOffset.UtcNow
        );

        var result = await adapter.ExtractAsync(
            "job-1",
            request,
            new Progress<StandardProgress>(),
            CancellationToken.None
        );

        Assert.Equal(StandardStatus.Success, result.Status);
        Assert.NotNull(result.Resolution.Candidate);
        Assert.Equal(
            ConfidenceClass.Verified,
            result.Resolution.Candidate!.ConfidenceClass
        );
        Assert.Equal(
            MatchCategory.VerifiedIdentifierMatch,
            result.Resolution.Candidate.MatchCategory
        );

        var serialized = System.Text.Json.JsonSerializer.Serialize(result);

        Assert.DoesNotContain("workstation-root", serialized);
        Assert.DoesNotContain("tc.json", serialized);
        Assert.All(
            result.Artifacts,
            artifact => Assert.False(
                Path.IsPathRooted(artifact.LogicalReference)
            )
        );
    }

    private static EngineeringDiscoveryRequest CreateDiscoveryRequest(
        string? productId,
        string? productName
    )
    {
        return new EngineeringDiscoveryRequest(
            SchemaVersion: EngineeringContractVersions.V1,
            RequestId: "request-1",
            CorrelationId: "correlation-1",
            RequestedSources: [EngineeringSource.Teamcenter],
            Query: new EngineeringQuery(
                OriginalInput: productId ?? productName,
                ProductId: productId,
                ProductName: productName
            ),
            ResultLimitPerSource: 10,
            TimeoutPolicy: new TimeoutPolicy(30000),
            InitiatedAt: DateTimeOffset.UtcNow
        );
    }

    private static SourceCandidate CreateCandidate()
    {
        return new SourceCandidate(
            CandidateId: "teamcenter:0001",
            Source: EngineeringSource.Teamcenter,
            NativeId: "0001",
            DisplayName: "0001",
            EntityType: "teamcenter-item",
            Revision: null,
            Version: null,
            Description: null,
            LifecycleState: null,
            MatchCategory: MatchCategory.SourceNativeReference,
            MatchReason: "Unverified source-native reference.",
            ConfidenceClass: ConfidenceClass.Unverified,
            AvailableCapabilities: ["structure"],
            SourceMetadata: new Dictionary<string, string?>(),
            Provenance: new ResultProvenance(
                ProvenanceKind.CapabilityOnly,
                "unit-test",
                DateTimeOffset.UtcNow
            ),
            CanExtract: true
        );
    }

    private sealed class FakeSubprocessExecutor : ISubprocessExecutor
    {
        public Task<SubprocessResult> ExecuteAsync(
            ExtractionRequest request,
            Func<string, Task> progressCallback,
            CancellationToken cancellationToken = default
        )
        {
            var result = new SubprocessResult
            {
                Success = true,
                Bom = new BomRoot
                {
                    SourceItemId = "0001",
                    SourceRevId = "A",
                    ExtractedAt = DateTimeOffset.UtcNow.ToString("O"),
                    BomRootNode = new BomNode
                    {
                        ItemId = "0001",
                        Name = "Root",
                        RevId = "A",
                        Sequence = "",
                        VariantState = "",
                        Qty = "1",
                        VariantCondition = ""
                    }
                },
                BomOutputPath = "workstation-root/teamcenter/tc.json"
            };

            return Task.FromResult(result);
        }
    }
}