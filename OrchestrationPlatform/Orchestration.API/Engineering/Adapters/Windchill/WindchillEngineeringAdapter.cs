
using Orchestration.API.Engineering.Adapters;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;
using Orchestration.API.Services;

namespace Orchestration.API.Engineering.Adapters.Windchill;

public sealed class WindchillEngineeringAdapter : IEngineeringSourceAdapter
{
    private readonly ExtractorOptions options;
    private readonly IProcessRunner runner;
    public WindchillEngineeringAdapter(IOptions<ExtractorOptions> options, IProcessRunner runner) { this.options = options.Value; this.runner = runner; }
    public EngineeringSource Source => EngineeringSource.Windchill;
    public Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token) => Task.FromResult(Capability());

    public async Task<SourceDiscoveryOutcome> DiscoverAsync(EngineeringDiscoveryRequest request, QueryNormalizationRecord normalized, CancellationToken token)
    {
        var script = options.ResolveWindchillPath();
        if (!File.Exists(script)) return Unavailable("windchill-runtime-unavailable", "The Windchill Python extractor was not found.");
        var query = request.Query.ProductId ?? request.Query.ProductName ?? request.Query.OriginalInput!;
        var outputDir = Path.Combine(Path.GetTempPath(), "orchestration-windchill", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(outputDir);
        var output = Path.Combine(outputDir, "search.json");
        try
        {
            var info = new ProcessStartInfo { FileName = "python", WorkingDirectory = Path.GetDirectoryName(script)!, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            foreach (var arg in new[] { script, "--operation", "search", "--query", query, "--output", output }) info.ArgumentList.Add(arg);
            var run = await runner.RunAsync(info, TimeSpan.FromMilliseconds(request.TimeoutPolicy.PerSourceTimeoutMs ?? request.TimeoutPolicy.TimeoutMs), _ => Task.CompletedTask, token);
            if (run.exitCode != 0 || !File.Exists(output)) return Unavailable("windchill-search-failed", "Windchill search did not return a usable result.", true);
            using var document = JsonDocument.Parse(await File.ReadAllTextAsync(output, token));
            var rows = document.RootElement.TryGetProperty("results", out var results) && results.ValueKind == JsonValueKind.Array ? results : default;
            var candidates = new List<SourceCandidate>();
            if (rows.ValueKind == JsonValueKind.Array)
                foreach (var item in rows.EnumerateArray().Take(request.ResultLimitPerSource))
                {
                    var oid = Text(item,"partId"); var number = Text(item,"number") ?? Text(item,"numericPartId") ?? oid;
                    if (string.IsNullOrWhiteSpace(oid) || string.IsNullOrWhiteSpace(number)) continue;
                    candidates.Add(new($"windchill:{oid}", Source, oid, Text(item,"name") ?? number, "windchill-wtpart",
                        Text(item,"revision"), Text(item,"version"), null, Text(item,"state"), MatchCategory.SourceSearchResult,
                        "Returned by the live Windchill product search.", ConfidenceClass.Probable, ["structure","versions","change-context"],
                        Metadata(item, number), new(ProvenanceKind.LiveSource,"windchill-python-odata",DateTimeOffset.UtcNow), true));
                }
            return new(Source, candidates.Count > 0 ? StandardStatus.Success : StandardStatus.Empty, Capability(), candidates, [], [], true);
        }
        catch (OperationCanceledException) { throw; }
        catch (TimeoutException) { return Unavailable("windchill-search-timeout", "Windchill search timed out.", true, StandardStatus.TimedOut); }
        catch { return Unavailable("windchill-search-failed", "Windchill search could not be completed.", true); }
        finally { try { Directory.Delete(outputDir, true); } catch { } }
    }

    public async Task<StandardExtractionResult> ExtractAsync(string jobId, EngineeringExtractionRequest request, IProgress<StandardProgress> progress, CancellationToken token)
    {
        var started=DateTimeOffset.UtcNow;var now=started;
        try
        {
            var script=options.ResolveWindchillPath();if(!File.Exists(script))return Failure(jobId,request,started,"windchill-runtime-unavailable","The Windchill extractor is unavailable.",false);
            var runtime=EngineeringAdapterSupport.CreateRuntimeDirectory(jobId,Source);var output=Path.Combine(runtime,"normalized-bom.json");
            var info=new ProcessStartInfo{FileName="python",WorkingDirectory=Path.GetDirectoryName(script)!,UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true};
            foreach(var arg in new[]{script,"--operation","structure","--part-id",request.Candidate.NativeId,"--output",output})info.ArgumentList.Add(arg);
            if(!string.IsNullOrWhiteSpace(request.Candidate.Version)){info.ArgumentList.Add("--version");info.ArgumentList.Add(request.Candidate.Version);}
            progress.Report(Progress(jobId,JobState.Extracting,10,"Starting Windchill structure extraction."));
            var run=await runner.RunAsync(info,TimeSpan.FromMilliseconds(request.TimeoutPolicy.TimeoutMs),_=>Task.CompletedTask,token);
            if(run.exitCode!=0||!File.Exists(output))return Failure(jobId,request,started,"windchill-extraction-failed","Windchill did not produce a usable structure.",true);
            var mapped=EngineeringAdapterSupport.ParseNormalizedStructure(output,request.Candidate.NativeId);var bom=mapped.root;now=DateTimeOffset.UtcNow;
            var verified=request.Candidate with{ConfidenceClass=ConfidenceClass.Verified,MatchCategory=MatchCategory.VerifiedIdentifierMatch,MatchReason="The live Windchill structure extraction verified the selected product.",Provenance=new(ProvenanceKind.LiveSource,"windchill-python-odata",now)};
            var artifact=EngineeringAdapterSupport.Artifact(jobId,Source,"normalized-bom",output);
            return new(EngineeringContractVersions.V1,request.RequestId,request.CorrelationId,jobId,Source,StandardStatus.Success,new(StandardStatus.Success,verified,request.Candidate.NativeId,[],[]),Capability(),bom,new object[]{mapped.structure},new Dictionary<string,object?>(),[],[],Progress(jobId,JobState.Success,100,"Windchill extraction completed."),[artifact],new(ProvenanceKind.LiveSource,"windchill-python-odata",now),[new(EngineeringStage.Extraction,EvidenceAvailability.Available,StandardStatus.Success,"Windchill structure extracted from the live source.")],started,now,(long)(now-started).TotalMilliseconds);
        }
        catch(OperationCanceledException){throw;}
        catch(TimeoutException){return Failure(jobId,request,started,"windchill-timeout","Windchill extraction timed out.",true,StandardStatus.TimedOut);}
        catch(JsonException){return Failure(jobId,request,started,"windchill-output-malformed","Windchill returned malformed output.",true);}
        catch{return Failure(jobId,request,started,"windchill-extraction-failed","Windchill extraction failed.",true);}
    }
    private static StandardProgress Progress(string id,JobState state,int percent,string message)=>new(id,EngineeringSource.Windchill,EngineeringStage.Extraction,state,percent,message,DateTimeOffset.UtcNow);
    private static StandardExtractionResult Failure(string id,EngineeringExtractionRequest request,DateTimeOffset started,string code,string message,bool retryable,StandardStatus status=StandardStatus.Failed){var now=DateTimeOffset.UtcNow;var error=new StructuredError(code,EngineeringSource.Windchill,EngineeringStage.Extraction,message,message,retryable,now);var state=status==StandardStatus.TimedOut?JobState.TimedOut:JobState.Failed;return new(EngineeringContractVersions.V1,request.RequestId,request.CorrelationId,id,EngineeringSource.Windchill,status,new(status,request.Candidate,null,[],[error]),Capability(),null,[],new Dictionary<string,object?>(),[],[error],Progress(id,state,100,message),[],new(ProvenanceKind.Unavailable,"windchill-python-odata",now),[new(EngineeringStage.Extraction,EvidenceAvailability.Unavailable,status,message)],started,now,(long)(now-started).TotalMilliseconds);}

    private SourceDiscoveryOutcome Unavailable(string code,string message,bool retryable=false,StandardStatus status=StandardStatus.Unavailable) =>
        new(Source,status,Capability(),[],[],[new(code,Source,EngineeringStage.Discovery,message,message,retryable,DateTimeOffset.UtcNow)],retryable);
    private static string? Text(JsonElement item,string property) => item.TryGetProperty(property,out var value) && value.ValueKind != JsonValueKind.Null ? value.ToString() : null;
    private static IReadOnlyDictionary<string,string?> Metadata(JsonElement item,string number) => new Dictionary<string,string?> { ["oid"]=Text(item,"partId"), ["numericObjectId"]=Text(item,"numericPartId"), ["partNumber"]=number, ["versionId"]=Text(item,"versionId"), ["view"]=Text(item,"view"), ["latest"]=Text(item,"latest"), ["objectType"]=Text(item,"objectType") };
    private static SourceCapability Capability() => new(Source:EngineeringSource.Windchill,Readiness:SourceReadiness.Ready,DiscoveryModes:[DiscoveryMode.ExactId,DiscoveryMode.Name,DiscoveryMode.Number],SupportsExactId:true,SupportsNameSearch:true,SupportsNumberSearch:true,SupportsStructureExtraction:true,SupportsRevisionContext:true,SupportsChangeContext:true,SupportsRequirements:false,SupportsOperationalImpact:false,SupportsConfigurationContext:false,SupportsCancellation:true,SupportsRetry:true,SupportsPartialSuccess:true,RequiredOrganizationContext:[],KnownLimitations:["Connected capability depends on configured Windchill credentials and OData access."]);
}
