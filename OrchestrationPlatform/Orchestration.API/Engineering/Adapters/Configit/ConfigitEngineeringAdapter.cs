
using Orchestration.API.Engineering.Adapters;
using System.Text.Json;
using System.Diagnostics;
using Orchestration.API.Services;
using Microsoft.Extensions.Options;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;

namespace Orchestration.API.Engineering.Adapters.Configit;

public sealed class ConfigitEngineeringAdapter : IEngineeringSourceAdapter
{
    private readonly ExtractorOptions options; private readonly IProcessRunner runner;
    public ConfigitEngineeringAdapter(IOptions<ExtractorOptions> options,IProcessRunner runner){this.options=options.Value;this.runner=runner;}
    public EngineeringSource Source=>EngineeringSource.Configit;
    public Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token)=>Task.FromResult(Capability(File.Exists(options.ResolveConfigitProductIndexPath())));
    public async Task<SourceDiscoveryOutcome> DiscoverAsync(EngineeringDiscoveryRequest request,QueryNormalizationRecord normalized,CancellationToken token)
    {
        var id=request.Query.ProductId?.Trim();var name=request.Query.ProductName?.Trim();var candidates=new List<SourceCandidate>();var indexPath=options.ResolveConfigitProductIndexPath();var hasIndex=File.Exists(indexPath);
        if(id is not null)candidates.Add(Candidate(id,id,null,null,ProvenanceKind.CapabilityOnly,"configit-direct-solve-capability",MatchCategory.SourceNativeReference,ConfidenceClass.Unverified));
        if(name is not null&&hasIndex)
        {
            try
            {
                using var doc=JsonDocument.Parse(await File.ReadAllTextAsync(indexPath,token));
                if(doc.RootElement.TryGetProperty("products",out var rows)&&rows.ValueKind==JsonValueKind.Array)
                    foreach(var row in rows.EnumerateArray())
                    {
                        var productId=Text(row,"productId");var display=Text(row,"displayName");if(string.IsNullOrWhiteSpace(productId)||string.IsNullOrWhiteSpace(display)||!display.Contains(name,StringComparison.OrdinalIgnoreCase))continue;
                        candidates.Add(Candidate(productId,display,Text(row,"packagePath"),Text(doc.RootElement,"refreshedAt"),ProvenanceKind.CachedSourceResult,"configit-authoritative-product-index",string.Equals(display,name,StringComparison.OrdinalIgnoreCase)?MatchCategory.ExactSourceNameMatch:MatchCategory.SourceSearchResult,string.Equals(display,name,StringComparison.OrdinalIgnoreCase)?ConfidenceClass.Deterministic:ConfidenceClass.Probable));
                        if(candidates.Count>=request.ResultLimitPerSource)break;
                    }
            }
            catch{return Failed("configit-product-index-malformed","The authoritative Configit product index could not be read.",true);}
        }
        if(id is null&&name is not null&&!hasIndex)return new(Source,StandardStatus.CapabilityLimited,Capability(false),[],[new("configit-name-search-unavailable",Source,EngineeringStage.Discovery,"Configit Product Name discovery requires an authoritative metadata index.",DateTimeOffset.UtcNow)],[],false);
        return new(Source,candidates.Count>0?StandardStatus.Success:StandardStatus.Empty,Capability(hasIndex),candidates,[],[],false);
    }
    public async Task<StandardExtractionResult> ExtractAsync(string jobId,EngineeringExtractionRequest request,IProgress<StandardProgress> progress,CancellationToken token)
    {
        var started=DateTimeOffset.UtcNow;var capability=Capability(File.Exists(options.ResolveConfigitProductIndexPath()));
        try
        {
            var script=options.ResolveConfigitPath();if(!File.Exists(script))return Failure(jobId,request,started,capability,"configit-runtime-unavailable","The Configit extractor is unavailable.",false);
            var package=request.ConfigurationContext?.PackagePath;var packageSource="explicit-request";if(string.IsNullOrWhiteSpace(package)){package=request.Candidate.SourceMetadata.TryGetValue("packagePath",out var value)?value:null;packageSource="candidate-metadata";}if(string.IsNullOrWhiteSpace(package))return Failure(jobId,request,started,capability,"configit-package-context-required","A Configit package path is required for extraction.",false,StandardStatus.AwaitingContext);
            var runtime=EngineeringAdapterSupport.CreateRuntimeDirectory(jobId,Source);var output=Path.Combine(runtime,"normalized-bom.json");
            var info=new ProcessStartInfo{FileName="python",WorkingDirectory=Path.GetDirectoryName(script)!,UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true};
            foreach(var arg in new[]{script,"--product-id",request.Candidate.NativeId,"--package-path",package,"--output",output})info.ArgumentList.Add(arg);if(!string.IsNullOrWhiteSpace(request.ConfigurationContext?.ConfigurationDate)){info.ArgumentList.Add("--date");info.ArgumentList.Add(request.ConfigurationContext.ConfigurationDate);}
            progress.Report(Progress(jobId,JobState.Extracting,10,"Starting Configit solve extraction."));var run=await runner.RunAsync(info,TimeSpan.FromMilliseconds(request.TimeoutPolicy.TimeoutMs),_=>Task.CompletedTask,token);
            if(run.exitCode!=0||!File.Exists(output))return Failure(jobId,request,started,capability,"configit-solve-failed","Configit did not produce a usable solved structure.",true);
            var bom=EngineeringAdapterSupport.ParseNormalizedBom(output,request.Candidate.NativeId);var now=DateTimeOffset.UtcNow;var verified=request.Candidate with{ConfidenceClass=ConfidenceClass.Verified,MatchCategory=MatchCategory.VerifiedIdentifierMatch,MatchReason="The Configit solve operation verified the selected Product ID.",Provenance=new(ProvenanceKind.LiveSource,"configit-solve-api",now)};var artifact=EngineeringAdapterSupport.Artifact(jobId,Source,"normalized-bom",output);
            return new(EngineeringContractVersions.V1,request.RequestId,request.CorrelationId,jobId,Source,StandardStatus.Success,new(StandardStatus.Success,verified,request.Candidate.NativeId,[],[]),capability,bom,[],new Dictionary<string,object?>{{"packagePath",package},{"packageContextSource",packageSource},{"providedVariables",request.ConfigurationContext?.ProvidedVariables}},[],[],Progress(jobId,JobState.Success,100,"Configit extraction completed."),[artifact],new(ProvenanceKind.LiveSource,"configit-solve-api",now),[new(EngineeringStage.Extraction,EvidenceAvailability.Available,StandardStatus.Success,"Configit solved structure extracted from the live source.")],started,now,(long)(now-started).TotalMilliseconds);
        }
        catch(OperationCanceledException){throw;}catch(TimeoutException){return Failure(jobId,request,started,capability,"configit-timeout","Configit extraction timed out.",true,StandardStatus.TimedOut);}catch(JsonException){return Failure(jobId,request,started,capability,"configit-output-malformed","Configit returned malformed output.",true);}catch{return Failure(jobId,request,started,capability,"configit-solve-failed","Configit extraction failed.",true);}
    }
    private static StandardProgress Progress(string id,JobState state,int percent,string message)=>new(id,EngineeringSource.Configit,EngineeringStage.Extraction,state,percent,message,DateTimeOffset.UtcNow);
    private static StandardExtractionResult Failure(string id,EngineeringExtractionRequest request,DateTimeOffset started,SourceCapability capability,string code,string message,bool retryable,StandardStatus status=StandardStatus.Failed){var now=DateTimeOffset.UtcNow;var error=new StructuredError(code,EngineeringSource.Configit,EngineeringStage.Extraction,message,message,retryable,now);var state=status switch{StandardStatus.TimedOut=>JobState.TimedOut,StandardStatus.AwaitingContext=>JobState.Unavailable,_=>JobState.Failed};return new(EngineeringContractVersions.V1,request.RequestId,request.CorrelationId,id,EngineeringSource.Configit,status,new(status,request.Candidate,null,[],[error]),capability,null,[],new Dictionary<string,object?>(),[],[error],Progress(id,state,100,message),[],new(ProvenanceKind.Unavailable,"configit-solve-api",now),[new(EngineeringStage.Extraction,EvidenceAvailability.Unavailable,status,message)],started,now,(long)(now-started).TotalMilliseconds);}
    private SourceCandidate Candidate(string id,string display,string? package,string? refreshed,ProvenanceKind kind,string provider,MatchCategory category,ConfidenceClass confidence)=>new($"configit:{id}",Source,id,display,"configit-product",null,null,null,null,category,kind==ProvenanceKind.CapabilityOnly?"Product ID accepted for later direct-solve verification.":"Returned by authoritative Configit product metadata.",confidence,["direct-solve"],new Dictionary<string,string?>{["packagePath"]=package,["indexRefreshedAt"]=refreshed},new(kind,provider,DateTimeOffset.UtcNow),true);
    private SourceDiscoveryOutcome Failed(string code,string message,bool retryable)=>new(Source,StandardStatus.Failed,Capability(true),[],[],[new(code,Source,EngineeringStage.Discovery,message,message,retryable,DateTimeOffset.UtcNow)],retryable);
    private static string? Text(JsonElement item,string name)=>item.TryGetProperty(name,out var value)&&value.ValueKind!=JsonValueKind.Null?value.ToString():null;
    private static SourceCapability Capability(bool names)=>new(Source:EngineeringSource.Configit,Readiness:names?SourceReadiness.Ready:SourceReadiness.CapabilityLimited,DiscoveryModes:names?[DiscoveryMode.ProductId,DiscoveryMode.Name]:[DiscoveryMode.ProductId,DiscoveryMode.Unsupported],SupportsExactId:true,SupportsNameSearch:names,SupportsNumberSearch:false,SupportsStructureExtraction:true,SupportsRevisionContext:false,SupportsChangeContext:false,SupportsRequirements:false,SupportsOperationalImpact:false,SupportsConfigurationContext:true,SupportsCancellation:true,SupportsRetry:true,SupportsPartialSuccess:true,RequiredOrganizationContext:["packagePath"],KnownLimitations:names?[]:["Product Name discovery requires authoritative Configit product metadata."]);
}
