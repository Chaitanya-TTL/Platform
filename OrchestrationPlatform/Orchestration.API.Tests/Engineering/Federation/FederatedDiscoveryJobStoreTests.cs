using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Federation;
using Xunit;
namespace Orchestration.API.Tests.Engineering.Federation;
public sealed class FederatedDiscoveryJobStoreTests
{
    [Fact] public void RetryCreatesNewAttemptWithoutDeletingPriorEvidence()
    {var store=new FederatedDiscoveryJobStore();var job=store.Create("r","c",[EngineeringSource.Sap]);Assert.True(store.TryStartAttempt(job.ParentJobId,EngineeringSource.Sap,out var retry));Assert.Equal(2,retry!.Attempt);Assert.True(store.TryGet(job.ParentJobId,out var current));Assert.Equal(2,current!.Sources.Count);}
    [Fact] public void StaleAttemptCannotOverwriteLatestRetry()
    {var store=new FederatedDiscoveryJobStore();var job=store.Create("r","c",[EngineeringSource.Sap]);Assert.True(store.TryStartAttempt(job.ParentJobId,EngineeringSource.Sap,out _));var old=job.Sources[0];Assert.False(store.TryCompleteAttempt(job.ParentJobId,old.SourceExecutionId,null!));}
}
