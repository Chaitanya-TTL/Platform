
using System.Collections.Concurrent;
using Orchestration.API.Engineering.Adapters;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Services;
namespace Orchestration.API.Engineering.Federation;
public interface IFederatedEngineeringExtractionOrchestrator
{
 FederatedExtractionAccepted Start(FederatedEngineeringExtractionRequest request);
 bool TryGet(string id,out FederatedExtractionJobSnapshot? snapshot);
 bool Cancel(string id);
 bool Retry(string id,EngineeringSource source);
}
public sealed class FederatedEngineeringExtractionOrchestrator:IFederatedEngineeringExtractionOrchestrator,IDisposable
{
 sealed record Context(FederatedEngineeringExtractionRequest Request,IReadOnlyDictionary<EngineeringSource,SourceCandidate> Candidates,CancellationTokenSource Cancellation);
 readonly IFederatedDiscoveryJobStore discoveries;readonly IFederatedCandidateSelectionStore selections;readonly IEngineeringAdapterRegistry adapters;readonly IFederatedExtractionJobStore jobs;readonly IFederatedExtractionStatusAggregator aggregator;
 readonly ConcurrentDictionary<string,Context> contexts=new();
 public FederatedEngineeringExtractionOrchestrator(IFederatedDiscoveryJobStore discoveries,IFederatedCandidateSelectionStore selections,IEngineeringAdapterRegistry adapters,IFederatedExtractionJobStore jobs,IFederatedExtractionStatusAggregator aggregator){this.discoveries=discoveries;this.selections=selections;this.adapters=adapters;this.jobs=jobs;this.aggregator=aggregator;}
 public FederatedExtractionAccepted Start(FederatedEngineeringExtractionRequest request)
 {
  if(request.SchemaVersion!=EngineeringContractVersions.V1)throw new EngineeringValidationException("schema-version-unsupported","Schema version is unsupported.");
  if(!discoveries.TryGet(request.ParentDiscoveryJobId,out var discovery)||discovery?.Result is null)throw new EngineeringValidationException("discovery-job-not-found","The persisted discovery snapshot was not found.");
  if(!selections.TryGet(request.ParentDiscoveryJobId,out var selection)||selection is null)throw new EngineeringValidationException("selection-not-found","A persisted candidate selection is required.");
  var available=discovery.Result.Sources.SelectMany(x=>x.Candidates).ToDictionary(x=>x.CandidateId,StringComparer.Ordinal);
  var chosen=new Dictionary<EngineeringSource,SourceCandidate>();
  foreach(var item in selection.Selections.Where(x=>x.Decision==CandidateSelectionDecision.Selected))
  {if(item.CandidateId is null||!available.TryGetValue(item.CandidateId,out var candidate)||candidate.Source!=item.Source||!candidate.CanExtract)throw new EngineeringValidationException("persisted-selection-invalid","A persisted selection references an unavailable, altered, or superseded candidate.");chosen[item.Source]=candidate;}
  if(chosen.Count!=selection.Selections.Count(x=>x.Decision==CandidateSelectionDecision.Selected))throw new EngineeringValidationException("duplicate-source-selection","Only one selected candidate per source is allowed.");
  if(chosen.Count==0)throw new EngineeringValidationException("selection-empty","No selected source candidates are available for extraction.");
  var requestId=string.IsNullOrWhiteSpace(request.RequestId)?$"request-{Guid.NewGuid():N}":request.RequestId.Trim();var correlation=string.IsNullOrWhiteSpace(request.CorrelationId)?requestId:request.CorrelationId.Trim();
  var job=jobs.Create(request.ParentDiscoveryJobId,requestId,correlation,chosen.Select(x=>(x.Key,x.Value.CandidateId)).ToArray());var cts=new CancellationTokenSource();contexts[job.ParentExtractionJobId]=new(request,chosen,cts);_=Task.Run(()=>RunAll(job.ParentExtractionJobId,job.Sources));return new(request.SchemaVersion,job.ParentExtractionJobId,job.State,job.CreatedAt);
 }
 public bool TryGet(string id,out FederatedExtractionJobSnapshot? snapshot)=>jobs.TryGet(id,out snapshot);
 public bool Cancel(string id){if(!contexts.TryGetValue(id,out var context)||!jobs.TryRequestCancellation(id))return false;context.Cancellation.Cancel();return true;}
 public bool Retry(string id,EngineeringSource source){if(!contexts.ContainsKey(id)||!jobs.TryStartRetry(id,source,out var child)||child is null)return false;_=Task.Run(async()=>{await RunOne(id,child);Complete(id);});return true;}
 async Task RunAll(string id,IReadOnlyList<FederatedExtractionChildSnapshot> children){await Task.WhenAll(children.Select(x=>RunOne(id,x)));Complete(id);}
 async Task RunOne(string id,FederatedExtractionChildSnapshot child)
 {
  if(!contexts.TryGetValue(id,out var context)||!context.Candidates.TryGetValue(child.Source,out var candidate)||!adapters.TryResolve(child.Source,out var adapter)||adapter is null)return;
  var timeout=context.Request.TimeoutPolicy??new TimeoutPolicy(600000,300000);using var timeoutCts=new CancellationTokenSource(timeout.PerSourceTimeoutMs??timeout.TimeoutMs);using var linked=CancellationTokenSource.CreateLinkedTokenSource(context.Cancellation.Token,timeoutCts.Token);
  StandardExtractionResult result;try{var progress=new Progress<StandardProgress>(p=>jobs.TryProgress(id,child.SourceExecutionId,p.State==JobState.Enriching?StandardStatus.Enriching:StandardStatus.Extracting,p.ProgressPercent));result=await adapter.ExtractAsync(child.SourceExecutionId,new(EngineeringContractVersions.V1,$"{id}:{child.SourceExecutionId}",id,child.Source,candidate,context.Request.RequestedEvidence??["structure"],context.Request.SourceContexts?.SingleOrDefault(x=>x.Source==child.Source)?.OrganizationContext,new(timeout.PerSourceTimeoutMs??timeout.TimeoutMs),DateTimeOffset.UtcNow,context.Request.SourceContexts?.SingleOrDefault(x=>x.Source==child.Source)?.ConfigurationContext,[]),progress,linked.Token);}catch(OperationCanceledException){var now=DateTimeOffset.UtcNow;var cancelled=context.Cancellation.IsCancellationRequested;var status=cancelled?StandardStatus.Cancelled:StandardStatus.TimedOut;var error=new StructuredError(cancelled?"source-cancelled":"source-timeout",child.Source,cancelled?EngineeringStage.Cancellation:EngineeringStage.Timeout,cancelled?"Source extraction was cancelled.":"Source extraction timed out.",cancelled?"Source extraction was cancelled.":"Source extraction timed out.",!cancelled,now);result=new(EngineeringContractVersions.V1,id,id,child.SourceExecutionId,child.Source,status,new(status,candidate,null,[],[error]),await adapter.GetCapabilitiesAsync(CancellationToken.None),null,[],new Dictionary<string,object?>(),[],[error],new(child.SourceExecutionId,child.Source,error.Stage,cancelled?JobState.Cancelled:JobState.TimedOut,100,error.UserMessage,now),[],new(ProvenanceKind.Unavailable,"federated-extraction",now),[],now,now,0);}jobs.TryComplete(id,child.SourceExecutionId,result);
 }
 void Complete(string id){if(!jobs.TryGet(id,out var snapshot)||snapshot is null)return;var latest=snapshot.Sources.GroupBy(x=>x.Source).Select(x=>x.OrderByDescending(y=>y.Attempt).First()).ToArray();if(latest.Any(x=>x.Active))return;var cancelled=snapshot.State==FederatedExtractionJobState.CancellationRequested;var status=aggregator.Aggregate(latest.Select(x=>x.Status).ToArray(),cancelled);var state=status switch{StandardStatus.Success=>FederatedExtractionJobState.Success,StandardStatus.PartialSuccess=>FederatedExtractionJobState.PartialSuccess,StandardStatus.Empty=>FederatedExtractionJobState.Empty,StandardStatus.Unavailable=>FederatedExtractionJobState.Unavailable,StandardStatus.AwaitingContext=>FederatedExtractionJobState.AwaitingContext,StandardStatus.TimedOut=>FederatedExtractionJobState.TimedOut,StandardStatus.Cancelled=>FederatedExtractionJobState.Cancelled,_=>FederatedExtractionJobState.Failed};var now=DateTimeOffset.UtcNow;var result=new FederatedEngineeringExtractionResult(EngineeringContractVersions.V1,id,snapshot.ParentDiscoveryJobId,status,100,latest,latest.SelectMany(x=>x.Result?.Warnings??[]).ToArray(),latest.SelectMany(x=>x.Result?.Errors??[]).ToArray(),snapshot.CreatedAt,now);jobs.TryFinish(id,state,result);if(contexts.TryRemove(id,out var context))context.Cancellation.Dispose();}
 public void Dispose(){foreach(var value in contexts.Values)value.Cancellation.Dispose();}
}
