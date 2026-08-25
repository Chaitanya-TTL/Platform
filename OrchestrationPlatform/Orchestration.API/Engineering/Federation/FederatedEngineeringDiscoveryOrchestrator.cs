using System.Collections.Concurrent;
using Orchestration.API.Engineering.Adapters;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Services;

namespace Orchestration.API.Engineering.Federation;

public interface IFederatedEngineeringDiscoveryOrchestrator
{
    FederatedDiscoveryAccepted Start(FederatedEngineeringDiscoveryRequest request, CancellationToken token);
    bool TryGet(string parentJobId, out FederatedDiscoveryJobSnapshot? snapshot);
    bool Cancel(string parentJobId);
    bool Retry(string parentJobId, EngineeringSource source);
}

public sealed class FederatedEngineeringDiscoveryOrchestrator : IFederatedEngineeringDiscoveryOrchestrator
{
    private sealed record Context(FederatedEngineeringDiscoveryRequest Request, EngineeringDiscoveryRequest AdapterRequest, NormalizedEngineeringQuery Normalized, CancellationToken RequestToken);
    private readonly IEngineeringAdapterRegistry registry;
    private readonly IEngineeringQueryNormalizer normalizer;
    private readonly IFederatedDiscoveryJobStore jobs;
    private readonly IFederatedCancellationCoordinator cancellations;
    private readonly IFederatedDiscoveryStatusAggregator aggregator;
    private readonly IFederatedCandidateEvaluator evaluator;
    private readonly ConcurrentDictionary<string,Context> contexts = new();
    private static readonly EngineeringSource[] AllSources = [EngineeringSource.Teamcenter,EngineeringSource.Windchill,EngineeringSource.Sap,EngineeringSource.Configit];

    public FederatedEngineeringDiscoveryOrchestrator(IEngineeringAdapterRegistry registry,IEngineeringQueryNormalizer normalizer,IFederatedDiscoveryJobStore jobs,IFederatedCancellationCoordinator cancellations,IFederatedDiscoveryStatusAggregator aggregator,IFederatedCandidateEvaluator evaluator)
    {this.registry=registry;this.normalizer=normalizer;this.jobs=jobs;this.cancellations=cancellations;this.aggregator=aggregator;this.evaluator=evaluator;}

    public FederatedDiscoveryAccepted Start(FederatedEngineeringDiscoveryRequest request,CancellationToken token)
    {
        if(request.SchemaVersion!=EngineeringContractVersions.V1)throw new EngineeringValidationException("schema-version-unsupported","Schema version is unsupported.");
        var normalized=normalizer.NormalizeFederated(request.Query);
        var sources=request.RequestedSources is {Count:>0}?request.RequestedSources:AllSources;
        if(sources.Distinct().Count()!=sources.Count)throw new EngineeringValidationException("duplicate-sources","Requested sources must be unique.");
        var requestId=string.IsNullOrWhiteSpace(request.RequestId)?$"request-{Guid.NewGuid():N}":request.RequestId.Trim();
        var correlation=string.IsNullOrWhiteSpace(request.CorrelationId)?requestId:request.CorrelationId.Trim();
        var policy=request.TimeoutPolicy??new TimeoutPolicy(120000,30000);
        if(policy.TimeoutMs<1000||(policy.PerSourceTimeoutMs??policy.TimeoutMs)<1000)throw new EngineeringValidationException("timeout-out-of-range","Timeout must be at least 1000 milliseconds.");
        var adapterRequest=new EngineeringDiscoveryRequest(request.SchemaVersion,requestId,correlation,sources,request.Query,Math.Clamp(request.ResultLimitPerSource,1,50),policy,DateTimeOffset.UtcNow);
        var job=jobs.Create(requestId,correlation,sources);
        var parentToken=cancellations.RegisterParent(job.ParentJobId,CancellationToken.None);
        contexts[job.ParentJobId]=new(request,adapterRequest,normalized,parentToken);
        _=Task.Run(()=>RunAll(job.ParentJobId,job.Sources));
        return new(request.SchemaVersion,requestId,correlation,job.ParentJobId,job.State,job.CreatedAt);
    }

    public bool TryGet(string id,out FederatedDiscoveryJobSnapshot? snapshot)=>jobs.TryGet(id,out snapshot);
    public bool Cancel(string id){if(!jobs.TryGet(id,out var job)||job is null)return false;jobs.TrySetState(id,FederatedJobState.CancellationRequested);return cancellations.Cancel(id);}
    public bool Retry(string id,EngineeringSource source)
    {
        if(!contexts.ContainsKey(id)||!jobs.TryGet(id,out var job)||job is null)return false;
        var latest=job.Sources.Where(x=>x.Source==source).OrderByDescending(x=>x.Attempt).FirstOrDefault();
        if(latest is null||latest.Active||!latest.Retryable)return false;
        if(!jobs.TryStartAttempt(id,source,out var child)||child is null)return false;
        _=Task.Run(async()=>{await RunOne(id,child);Complete(id);});return true;
    }

    private async Task RunAll(string parentId,IReadOnlyList<FederatedSourceJobSnapshot> children)
    {
        jobs.TrySetState(parentId,FederatedJobState.Discovering);
        await Task.WhenAll(children.Select(child=>RunOne(parentId,child)));
        Complete(parentId);
    }

    private async Task RunOne(string parentId,FederatedSourceJobSnapshot child)
    {
        if(!contexts.TryGetValue(parentId,out var context))return;
        var started=DateTimeOffset.UtcNow;var timeout=context.AdapterRequest.TimeoutPolicy.PerSourceTimeoutMs??context.AdapterRequest.TimeoutPolicy.TimeoutMs;
        FederatedSourceDiscoveryOutcome result;
        try
        {
            if(!registry.TryResolve(child.Source,out var adapter)||adapter is null){result=Failure(child,context,started,StandardStatus.Unavailable,"source-adapter-not-implemented","The source adapter is unavailable.",false);}
            else
            {
                using var timeoutCts=new CancellationTokenSource(timeout);using var linked=CancellationTokenSource.CreateLinkedTokenSource(timeoutCts.Token,context.RequestToken);
                var capability=await adapter.GetCapabilitiesAsync(linked.Token);
                var legacyNormalized=new QueryNormalizationRecord(context.Normalized.OriginalInput??context.Normalized.ProductId.OriginalValue??context.Normalized.ProductName.OriginalValue??"",context.Normalized.ProductId.NormalizedValue??context.Normalized.ProductName.NormalizedValue??context.Normalized.OriginalInput??"",context.Normalized.ProductId.Transformations.Concat(context.Normalized.ProductName.Transformations).ToArray(),context.Normalized.Warnings,context.Normalized.IdentifierType,ConfidenceClass.Probable);
                var outcome=await adapter.DiscoverAsync(context.AdapterRequest,legacyNormalized,linked.Token);
                var warnings=outcome.Warnings.ToList();var candidates=outcome.Candidates.Select(c=>{var evaluated=evaluator.Evaluate(c,context.Normalized,out var warning);if(warning is not null)warnings.Add(warning);return evaluated;}).ToArray();
                var completed=DateTimeOffset.UtcNow;var provenance=candidates.FirstOrDefault()?.Provenance??new ResultProvenance(outcome.Status==StandardStatus.CapabilityLimited?ProvenanceKind.CapabilityOnly:ProvenanceKind.Unavailable,$"{child.Source.ToString().ToLowerInvariant()}-discovery",completed);
                result=new(EngineeringContractVersions.V1,context.AdapterRequest.RequestId,parentId,child.SourceExecutionId,child.Attempt,child.Source,outcome.Status,capability.Readiness,capability,context.AdapterRequest.Query,context.Normalized,candidates,warnings,outcome.Errors,provenance,started,completed,(long)(completed-started).TotalMilliseconds,outcome.Retryable);
            }
        }
        catch(OperationCanceledException)
        {
            var cancelled=contexts.TryGetValue(parentId,out var current)&&current.RequestToken.IsCancellationRequested;
            result=Failure(child,context,started,cancelled?StandardStatus.Cancelled:StandardStatus.TimedOut,cancelled?"source-cancelled":"source-timeout",cancelled?"Source discovery was cancelled.":"Source discovery timed out.",!cancelled);
        }
        catch{result=Failure(child,context,started,StandardStatus.Failed,"source-discovery-failed","Source discovery failed.",true);}
        jobs.TryCompleteAttempt(parentId,child.SourceExecutionId,result);
    }

    private void Complete(string parentId)
    {
        if(!jobs.TryGet(parentId,out var snapshot)||snapshot is null||!contexts.TryGetValue(parentId,out var context))return;
        var latest=snapshot.Sources.GroupBy(x=>x.Source).Select(x=>x.OrderByDescending(y=>y.Attempt).First()).ToArray();
        var outcomes=latest.Where(x=>x.Outcome is not null).Select(x=>x.Outcome!).ToArray();
        var status=aggregator.Aggregate(outcomes);var completed=DateTimeOffset.UtcNow;var candidates=outcomes.SelectMany(x=>x.Candidates).ToArray();
        var selection=candidates.Length>0?SelectionState.AwaitingSelection:SelectionState.NotRequired;
        var result=new FederatedEngineeringDiscoveryResult(EngineeringContractVersions.V1,context.AdapterRequest.RequestId,context.AdapterRequest.CorrelationId,parentId,status,context.AdapterRequest.Query,context.Normalized,outcomes,evaluator.Correspond(candidates),selection,snapshot.CreatedAt,completed);
        var state=status switch{StandardStatus.Cancelled=>FederatedJobState.Cancelled,StandardStatus.Unavailable=>FederatedJobState.Unavailable,StandardStatus.Empty=>FederatedJobState.Empty,StandardStatus.Failed=>FederatedJobState.Failed,_=>candidates.Length>0?FederatedJobState.AwaitingSelection:status==StandardStatus.PartialSuccess?FederatedJobState.PartialSuccess:FederatedJobState.Success};
        jobs.TrySetState(parentId,state,result);cancellations.Complete(parentId);
    }

    private static FederatedSourceDiscoveryOutcome Failure(FederatedSourceJobSnapshot child,Context context,DateTimeOffset started,StandardStatus status,string code,string message,bool retryable)
    {
        var now=DateTimeOffset.UtcNow;var capability=new SourceCapability(child.Source,SourceReadiness.Unavailable,[DiscoveryMode.Unsupported],false,false,false,false,false,false,false,false,false,true,retryable,true,[],[message]);
        return new(EngineeringContractVersions.V1,context.AdapterRequest.RequestId,"",child.SourceExecutionId,child.Attempt,child.Source,status,capability.Readiness,capability,context.AdapterRequest.Query,context.Normalized,[],[],[new(code,child.Source,EngineeringStage.Discovery,message,message,retryable,now)],new(ProvenanceKind.Unavailable,$"{child.Source.ToString().ToLowerInvariant()}-discovery",now),started,now,(long)(now-started).TotalMilliseconds,retryable);
    }
}
