using Orchestration.API.Engineering.Adapters;
using Orchestration.API.Engineering.Contracts;
using Xunit;

namespace Orchestration.API.Tests.Engineering;

public sealed class EngineeringAdapterRegistryTests
{
    [Fact]
    public void DuplicateSourceRegistrationIsRejected()
    {
        Assert.Throws<InvalidOperationException>(() =>
            new EngineeringAdapterRegistry([new StubAdapter(), new StubAdapter()]));
    }

    private sealed class StubAdapter : IEngineeringSourceAdapter
    {
        public EngineeringSource Source => EngineeringSource.Teamcenter;
        public Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token) => throw new NotSupportedException();
        public Task<SourceDiscoveryOutcome> DiscoverAsync(EngineeringDiscoveryRequest request, QueryNormalizationRecord normalized, CancellationToken token) => throw new NotSupportedException();
        public Task<StandardExtractionResult> ExtractAsync(string jobId, EngineeringExtractionRequest request, IProgress<StandardProgress> progress, CancellationToken token) => throw new NotSupportedException();
    }
}
