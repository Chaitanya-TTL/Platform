using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Federation;
using Xunit;
namespace Orchestration.API.Tests.Engineering.Federation;
public sealed class FederatedDiscoveryStatusAggregatorTests
{
    [Fact] public void SuccessfulSiblingIsPreservedWhenAnotherSourceIsLimited()
    {
        var aggregator=new FederatedDiscoveryStatusAggregator();
        var values=new[]{Outcome(EngineeringSource.Windchill,StandardStatus.Success,true),Outcome(EngineeringSource.Teamcenter,StandardStatus.CapabilityLimited,false)};
        Assert.Equal(StandardStatus.PartialSuccess,aggregator.Aggregate(values));
    }
    [Fact] public void AllUnavailableProducesUnavailable()=>Assert.Equal(StandardStatus.Unavailable,new FederatedDiscoveryStatusAggregator().Aggregate([Outcome(EngineeringSource.Sap,StandardStatus.Unavailable,false),Outcome(EngineeringSource.Configit,StandardStatus.Unavailable,false)]));
    private static FederatedSourceDiscoveryOutcome Outcome(EngineeringSource source,StandardStatus status,bool candidate)
    {var now=DateTimeOffset.UtcNow;var cap=new SourceCapability(source,SourceReadiness.Ready,[],true,true,true,true,false,false,false,false,false,true,true,true,[],[]);var candidates=candidate?new[]{new SourceCandidate($"{source}:1",source,"1","One","product",null,null,null,null,MatchCategory.SourceSearchResult,"test",ConfidenceClass.Probable,[],new Dictionary<string,string?>(),new(ProvenanceKind.DeterministicTestFixture,"test",now),true)}:[];var query=new EngineeringQuery("1","1",null);var normalized=new NormalizedEngineeringQuery("1",new("1","1",[]),new(null,null,[]),IdentifierType.ProductId,null,null,[]);return new("1.0","r","p","s",1,source,status,cap.Readiness,cap,query,normalized,candidates,[],[],new(ProvenanceKind.DeterministicTestFixture,"test",now),now,now,0,false);}
}
