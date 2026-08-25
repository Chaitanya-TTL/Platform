using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Adapters;
public interface IEngineeringSourceAdapter { EngineeringSource Source {get;} Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token); Task<SourceDiscoveryOutcome> DiscoverAsync(EngineeringDiscoveryRequest request,QueryNormalizationRecord normalized,CancellationToken token); Task<StandardExtractionResult> ExtractAsync(string jobId,EngineeringExtractionRequest request,IProgress<StandardProgress> progress,CancellationToken token); }
