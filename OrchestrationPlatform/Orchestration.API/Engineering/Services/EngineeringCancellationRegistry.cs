using System.Collections.Concurrent;
using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Services;
public interface IEngineeringCancellationRegistry { CancellationToken Register(string jobId,CancellationToken request,TimeSpan timeout); CancellationOutcome Cancel(string jobId); bool WasTimedOut(string jobId); void Complete(string jobId); }
public sealed class EngineeringCancellationRegistry:IEngineeringCancellationRegistry,IDisposable {
 sealed class Registration:IDisposable { public CancellationTokenSource Timeout {get;} public CancellationTokenSource Manual {get;} public CancellationTokenSource Linked {get;} public Registration(CancellationToken request,TimeSpan timeout){Timeout=new(timeout);Manual=new();Linked=CancellationTokenSource.CreateLinkedTokenSource(request,Timeout.Token,Manual.Token);} public void Dispose(){Linked.Dispose();Manual.Dispose();Timeout.Dispose();} }
 readonly ConcurrentDictionary<string,Registration> registrations=new(); readonly IEngineeringJobStore jobs;
 public EngineeringCancellationRegistry(IEngineeringJobStore jobs)=>this.jobs=jobs;
 public CancellationToken Register(string id,CancellationToken request,TimeSpan timeout){var registration=new Registration(request,timeout);if(!registrations.TryAdd(id,registration)){registration.Dispose();throw new InvalidOperationException("Cancellation registration already exists.");}return registration.Linked.Token;}
 public CancellationOutcome Cancel(string id){if(!jobs.TryGet(id,out var job)||job is null)return new(id,"job-not-found","Job was not found.",false);if(job.State is JobState.Success or JobState.PartialSuccess or JobState.Empty or JobState.Failed or JobState.Unavailable or JobState.TimedOut)return new(id,"job-already-completed","Completed jobs cannot be cancelled.",false);if(job.State is JobState.Cancelled or JobState.CancellationRequested)return new(id,"job-already-cancelled","Cancellation was already requested.",false);if(!registrations.TryGetValue(id,out var registration))return new(id,"cancellation-unsupported","The active source execution has no cancellation registration.",false);jobs.TryTransition(id,JobState.CancellationRequested,EngineeringStage.Cancellation,job.ProgressPercent,"cancellation-requested");try{registration.Manual.Cancel();return new(id,"cancellation-accepted","Cancellation was accepted.",true);}catch{return new(id,"cancellation-failed","Cancellation could not be completed safely.",false);}}
 public bool WasTimedOut(string id)=>registrations.TryGetValue(id,out var registration)&&registration.Timeout.IsCancellationRequested;
 public void Complete(string id){if(registrations.TryRemove(id,out var registration))registration.Dispose();}
 public void Dispose(){foreach(var id in registrations.Keys)Complete(id);}
}
