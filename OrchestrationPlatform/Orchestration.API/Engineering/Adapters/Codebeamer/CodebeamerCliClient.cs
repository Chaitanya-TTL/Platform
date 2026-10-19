using System.Diagnostics;using System.Text.Json;using System.Text.Json.Serialization;using Microsoft.Extensions.Options;
namespace Orchestration.API.Engineering.Adapters.Codebeamer;
public interface ICodebeamerCliClient { Task<CodebeamerStatusDto> StatusAsync(CancellationToken token); Task<CodebeamerSearchDto> SearchAsync(string query,int limit,CancellationToken token); Task<CodebeamerEnrichmentDto> EnrichAsync(int itemId,CancellationToken token); }
public sealed class CodebeamerCliClient:ICodebeamerCliClient
{
 readonly CodebeamerOptions options;static readonly JsonSerializerOptions Json=new(){PropertyNameCaseInsensitive=true,PropertyNamingPolicy=JsonNamingPolicy.SnakeCaseLower};public CodebeamerCliClient(IOptions<CodebeamerOptions> options)=>this.options=options.Value;
 public async Task<CodebeamerStatusDto> StatusAsync(CancellationToken token)=>Deserialize<CodebeamerStatusDto>(await RunAsync(["status","--json"],token));public async Task<CodebeamerSearchDto> SearchAsync(string query,int limit,CancellationToken token)=>Deserialize<CodebeamerSearchDto>(await RunAsync(["search",query,"--limit",Math.Clamp(limit,1,500).ToString(),"--json"],token));public async Task<CodebeamerEnrichmentDto> EnrichAsync(int itemId,CancellationToken token)=>Deserialize<CodebeamerEnrichmentDto>(await RunAsync(["enrich",itemId.ToString()],token,new HashSet<int> { 0, 1 }));T Deserialize<T>(string value)=>JsonSerializer.Deserialize<T>(value,Json)??throw new InvalidOperationException("Codebeamer returned an empty JSON contract.");
 async Task<string> RunAsync(IReadOnlyList<string> args,CancellationToken token,IReadOnlySet<int>? acceptedExitCodes=null)
 {
  acceptedExitCodes ??= new HashSet<int>{0};
  var working=Path.GetFullPath(options.WorkingDirectory);
  if(!Directory.Exists(working))throw new DirectoryNotFoundException($"Codebeamer extractor directory was not found: {working}");
  var exe=options.ExecutablePath;
  if(string.IsNullOrWhiteSpace(exe))exe=OperatingSystem.IsWindows()?Path.Combine(working,".venv","Scripts","codebeamer-extractor.exe"):Path.Combine(working,".venv","bin","codebeamer-extractor");
  if(!File.Exists(exe))throw new FileNotFoundException("Codebeamer extractor executable was not found.",exe);
  using var p=new Process{StartInfo=new ProcessStartInfo{FileName=exe,WorkingDirectory=working,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false,CreateNoWindow=true}};
  foreach(var a in args)p.StartInfo.ArgumentList.Add(a);
  if(!p.Start())throw new InvalidOperationException("Codebeamer extractor process could not be started.");
  using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(Math.Clamp(options.CommandTimeoutSeconds,1,300)));
  using var linked=CancellationTokenSource.CreateLinkedTokenSource(token,timeout.Token);
  var stdoutTask=p.StandardOutput.ReadToEndAsync(linked.Token);var stderrTask=p.StandardError.ReadToEndAsync(linked.Token);
  try{await p.WaitForExitAsync(linked.Token);}catch{try{p.Kill(true);}catch{}throw;}
  var output=await stdoutTask;var error=await stderrTask;
  if(output.Length>options.MaximumOutputCharacters)throw new InvalidOperationException("Codebeamer output exceeded the configured safety limit.");
  if(!acceptedExitCodes.Contains(p.ExitCode))
  {
   var diagnostic=Sanitize(string.IsNullOrWhiteSpace(error)?output:error);
   throw new InvalidOperationException($"Codebeamer command '{args[0]}' failed with exit code {p.ExitCode}: {diagnostic}");
  }
  if(string.IsNullOrWhiteSpace(output))throw new InvalidOperationException($"Codebeamer command '{args[0]}' returned no JSON output.");
  return output;
 }
 static string Sanitize(string value)
 {
  var compact=value.Replace("\r"," ").Replace("\n"," ").Trim();
  if(compact.Length>2000)compact=compact[..2000];
  return string.IsNullOrWhiteSpace(compact)?"No diagnostic output was returned.":compact;
 }
}
public sealed record CodebeamerStatusDto(string InstanceKey,DateTimeOffset? LastAttemptAt,DateTimeOffset? LastSuccessfulSyncAt,string CatalogRevision,string Status,int RequirementCount,int HierarchyEdgeCount,int TrackerCount,int StaleTrackerCount,int FailedTrackerCount);
public sealed record CodebeamerSearchDto(string Query,string NormalizedQuery,string CatalogRevision,string CatalogStatus,DateTimeOffset CatalogSynchronizedAt,int CatalogRequirementCount,IReadOnlyList<CodebeamerMatchDto> Matches);
public sealed record CodebeamerMatchDto(string CanonicalId,int ItemId,string ExternalKey,string Name,string Description,int ProjectId,string ProjectName,int TrackerId,string TrackerName,string? Status,string? Priority,IReadOnlyList<string> Categories,IReadOnlyList<string> Severities,string? ParentName,IReadOnlyList<string> ChildNames,int? Version,bool Stale,int Score,string Classification,IReadOnlyList<string> MatchedFields,string Explanation);

public sealed record CodebeamerEnrichmentDto([property: JsonPropertyName("contractVersion")] string ContractVersion,string Status,CodebeamerEvidenceSectionDto Item,CodebeamerEvidenceSectionDto Relations,CodebeamerEvidenceSectionDto Attachments,IReadOnlyList<CodebeamerEnrichmentFailureDto> Failures,[property: JsonPropertyName("retrievedAt")] DateTimeOffset RetrievedAt);
public sealed record CodebeamerEvidenceSectionDto(string Status,[property: JsonPropertyName("retrievedAt")] DateTimeOffset? RetrievedAt,int Count,JsonElement? Data,IReadOnlyList<CodebeamerEnrichmentFailureDto> Failures);
public sealed record CodebeamerEnrichmentFailureDto(string Stage,string Classification,string Message,bool Retryable);


