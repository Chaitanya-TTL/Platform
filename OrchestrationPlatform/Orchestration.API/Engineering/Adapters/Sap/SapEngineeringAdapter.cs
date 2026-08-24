
using Orchestration.API.Engineering.Adapters;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;
using Orchestration.API.Services;

namespace Orchestration.API.Engineering.Adapters.Sap;

public sealed class SapEngineeringAdapter : IEngineeringSourceAdapter
{
    private readonly ExtractorOptions options; private readonly ISubprocessExecutor executor;
    public SapEngineeringAdapter(IOptions<ExtractorOptions> options,ISubprocessExecutor executor){this.options=options.Value;this.executor=executor;}
    public EngineeringSource Source => EngineeringSource.Sap;
    public Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token) => Task.FromResult(Capability());
    public async Task<SourceDiscoveryOutcome> DiscoverAsync(EngineeringDiscoveryRequest request, QueryNormalizationRecord normalized, CancellationToken token)
    {
        var root = options.ResolveSapCatalogRoot();
        var catalog = Directory.Exists(root) ? Directory.GetFiles(root,"sap_material_catalog.json",SearchOption.AllDirectories).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault() : null;
        if (catalog is null) return Outcome(StandardStatus.Unavailable,[],"sap-catalog-unavailable","The authoritative SAP material catalogue has not been generated.",true);
        var age = DateTimeOffset.UtcNow - File.GetLastWriteTimeUtc(catalog);
        try
        {
            using var doc=JsonDocument.Parse(await File.ReadAllTextAsync(catalog,token));
            if(!doc.RootElement.TryGetProperty("materials",out var rows)||rows.ValueKind!=JsonValueKind.Array)
                return Outcome(StandardStatus.Failed,[],"sap-catalog-malformed","The SAP material catalogue is malformed.",true);
            var id=request.Query.ProductId?.Trim();var name=request.Query.ProductName?.Trim();
            var candidates=new List<SourceCandidate>();
            foreach(var row in rows.EnumerateArray())
            {
                var material=Text(row,"materialId");var description=Text(row,"description")??material;
                if(string.IsNullOrWhiteSpace(material))continue;
                var idMatch=id is not null&&(string.Equals(material,id,StringComparison.OrdinalIgnoreCase)||string.Equals(External(material),External(id),StringComparison.OrdinalIgnoreCase));
                var nameMatch=name is not null&&description is not null&&description.Contains(name,StringComparison.OrdinalIgnoreCase);
                if(!idMatch&&!nameMatch)continue;
                var category=idMatch?MatchCategory.DeterministicNormalizedIdMatch:MatchCategory.SourceSearchResult;
                var confidence=idMatch?ConfidenceClass.Deterministic:ConfidenceClass.Probable;
                candidates.Add(new($"sap:{material}",Source,material,description!,"sap-material",null,null,null,null,category,
                    idMatch?"Material number matched the catalogue using string-preserving SAP number semantics.":"Material description was returned by the SAP catalogue.",confidence,
                    ["structure","material-master","operational-impact"],new Dictionary<string,string?>{["requestedMaterialId"]=id,["catalogMaterialId"]=material,["externalMaterialId"]=External(material),["catalogGeneratedAt"]=Text(doc.RootElement,"generatedAt"),["systemId"]=Text(doc.RootElement,"systemId"),["client"]=Text(doc.RootElement,"client")},
                    new(ProvenanceKind.CachedSourceResult,"sap-material-catalog",File.GetLastWriteTimeUtc(catalog)),true));
                if(candidates.Count>=request.ResultLimitPerSource)break;
            }
            var warnings=age>TimeSpan.FromMinutes(options.SapCatalogStaleMinutes)?new[]{new StructuredWarning("sap-catalog-stale",Source,EngineeringStage.Discovery,"The SAP material catalogue is older than the configured freshness threshold.",DateTimeOffset.UtcNow)}:[];
            return new(Source,candidates.Count>0?StandardStatus.Success:StandardStatus.Empty,Capability(),candidates,warnings,[],true);
        }
        catch(OperationCanceledException){throw;}
        catch{return Outcome(StandardStatus.Failed,[],"sap-catalog-read-failed","The SAP material catalogue could not be read.",true);}
    }
    public async Task<StandardExtractionResult> ExtractAsync(string jobId,EngineeringExtractionRequest request,IProgress<StandardProgress> progress,CancellationToken token)
    {
        var started=DateTimeOffset.UtcNow;var plant=request.OrganizationContext?.Plant;
        if(string.IsNullOrWhiteSpace(plant))return Failure(jobId,request,started,"sap-plant-context-required","A plant is required for SAP extraction.",false,StandardStatus.AwaitingContext);
        try
        {
            progress.Report(Progress(jobId,JobState.Extracting,10,"Starting SAP engineering extraction."));
            var legacy=new ExtractionRequest{Kind=ExtractionKind.Sap,JobId=jobId,MaterialId=request.Candidate.NativeId,Plant=plant,BomUsage=request.OrganizationContext?.Additional?.GetValueOrDefault("bomUsage"),Alternative=request.OrganizationContext?.Additional?.GetValueOrDefault("alternative"),IncludeSapBusinessImpact=true};
            var result=await executor.ExecuteAsync(legacy,_=>Task.CompletedTask,token);var now=DateTimeOffset.UtcNow;
            if(!result.Success)return Failure(jobId,request,started,"sap-extraction-failed","SAP did not return usable engineering evidence.",true);
            var warnings=new List<StructuredWarning>();if(result.Bom is null)warnings.Add(new("sap-bom-unavailable",Source,EngineeringStage.Extraction,"SAP material evidence was returned, but no BOM was available.",now));if(result.SapHistory is null)warnings.Add(new("sap-history-unavailable",Source,EngineeringStage.Enrichment,"SAP current-state evidence was returned without movement history.",now));
            var status=warnings.Count>0?StandardStatus.PartialSuccess:StandardStatus.Success;var verified=request.Candidate with{ConfidenceClass=ConfidenceClass.Verified,MatchCategory=MatchCategory.VerifiedIdentifierMatch,MatchReason="The live SAP extraction verified the selected material number.",Provenance=new(ProvenanceKind.LiveSource,"sap-jco",now)};
            var artifacts=new List<SourceArtifactReference>();if(result.BomOutputPath is not null&&File.Exists(result.BomOutputPath))artifacts.Add(EngineeringAdapterSupport.Artifact(jobId,Source,"normalized-bom",result.BomOutputPath));if(result.SapImpactOutputPath is not null&&File.Exists(result.SapImpactOutputPath))artifacts.Add(EngineeringAdapterSupport.Artifact(jobId,Source,"operational-impact",result.SapImpactOutputPath));if(result.SapHistoryOutputPath is not null&&File.Exists(result.SapHistoryOutputPath))artifacts.Add(EngineeringAdapterSupport.Artifact(jobId,Source,"material-history",result.SapHistoryOutputPath));
            var evidence=new Dictionary<string,object?>{{"organizationContext",request.OrganizationContext},{"defaultDecisions",request.DefaultDecisions??Array.Empty<DefaultDecision>()},{"businessImpact",result.SapImpact},{"materialHistory",result.SapHistory}};
            return new(EngineeringContractVersions.V1,request.RequestId,request.CorrelationId,jobId,Source,status,new(status,verified,request.Candidate.NativeId,warnings,[]),Capability(),result.Bom,[],evidence,warnings,[],Progress(jobId,status==StandardStatus.Success?JobState.Success:JobState.PartialSuccess,100,"SAP extraction completed."),artifacts,new(ProvenanceKind.LiveSource,"sap-jco",now),[new(EngineeringStage.Extraction,EvidenceAvailability.Available,status,"SAP structure and operational evidence extraction completed.")],started,now,(long)(now-started).TotalMilliseconds);
        }
        catch(OperationCanceledException){throw;}catch(TimeoutException){return Failure(jobId,request,started,"sap-timeout","SAP extraction timed out.",true,StandardStatus.TimedOut);}catch{return Failure(jobId,request,started,"sap-extraction-failed","SAP extraction failed.",true);}
    }
    private static StandardProgress Progress(string id,JobState state,int percent,string message)=>new(id,EngineeringSource.Sap,EngineeringStage.Extraction,state,percent,message,DateTimeOffset.UtcNow);
    private static StandardExtractionResult Failure(string id,EngineeringExtractionRequest request,DateTimeOffset started,string code,string message,bool retryable,StandardStatus status=StandardStatus.Failed){var now=DateTimeOffset.UtcNow;var error=new StructuredError(code,EngineeringSource.Sap,EngineeringStage.Extraction,message,message,retryable,now);var state=status switch{StandardStatus.TimedOut=>JobState.TimedOut,StandardStatus.AwaitingContext=>JobState.Unavailable,_=>JobState.Failed};return new(EngineeringContractVersions.V1,request.RequestId,request.CorrelationId,id,EngineeringSource.Sap,status,new(status,request.Candidate,null,[],[error]),Capability(),null,[],new Dictionary<string,object?>(),[],[error],Progress(id,state,100,message),[],new(ProvenanceKind.Unavailable,"sap-jco",now),[new(EngineeringStage.Extraction,EvidenceAvailability.Unavailable,status,message)],started,now,(long)(now-started).TotalMilliseconds);}
    private SourceDiscoveryOutcome Outcome(StandardStatus status,IReadOnlyList<SourceCandidate> candidates,string code,string message,bool retryable)=>new(Source,status,Capability(),candidates,[],[new(code,Source,EngineeringStage.Discovery,message,message,retryable,DateTimeOffset.UtcNow)],retryable);
    private static string? Text(JsonElement item,string name)=>item.TryGetProperty(name,out var value)&&value.ValueKind!=JsonValueKind.Null?value.ToString():null;
    private static string External(string value){var trimmed=value.Trim();if(!trimmed.All(char.IsDigit))return trimmed;var external=trimmed.TrimStart('0');return external.Length>0?external:"0";}
    private static SourceCapability Capability()=>new(Source:EngineeringSource.Sap,Readiness:SourceReadiness.Ready,DiscoveryModes:[DiscoveryMode.ExactId,DiscoveryMode.Name,DiscoveryMode.MaterialCatalog],SupportsExactId:true,SupportsNameSearch:true,SupportsNumberSearch:true,SupportsStructureExtraction:true,SupportsRevisionContext:false,SupportsChangeContext:false,SupportsRequirements:false,SupportsOperationalImpact:true,SupportsConfigurationContext:true,SupportsCancellation:true,SupportsRetry:true,SupportsPartialSuccess:true,RequiredOrganizationContext:["plant"],KnownLimitations:["Discovery freshness depends on the latest authoritative SAP material catalogue snapshot."]);
}
