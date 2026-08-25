using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Federation;
using Xunit;
namespace Orchestration.API.Tests.Engineering.Federation;
public sealed class FederatedCandidateEvaluatorTests
{
    [Fact] public void SameNameDoesNotCreateVerifiedCorrespondence()
    {
        var evaluator=new FederatedCandidateEvaluator();
        var values=new[]{Candidate(EngineeringSource.Windchill,"wc-1","Screwjack"),Candidate(EngineeringSource.Sap,"sap-9","Screwjack")};
        var result=Assert.Single(evaluator.Correspond(values));
        Assert.Equal(ConfidenceClass.Probable,result.ConfidenceClass);Assert.Equal(CorrespondenceReviewState.Ambiguous,result.ReviewState);Assert.Contains("name-only-evidence",result.Conflicts);
    }
    [Fact] public void IdMatchWithNameConflictIsVisible()
    {
        var evaluator=new FederatedCandidateEvaluator();var query=new NormalizedEngineeringQuery(null,new("002403","002403",[]),new("Screwjack","Screwjack",[]),IdentifierType.ProductId,null,null,[]);
        var candidate=evaluator.Evaluate(Candidate(EngineeringSource.Sap,"002403","Different product"),query,out var warning);
        Assert.Equal(MatchCategory.SourceSearchResult,candidate.MatchCategory);Assert.Equal(ConfidenceClass.Probable,candidate.ConfidenceClass);Assert.NotNull(warning);Assert.Equal("candidate-name-mismatch",warning!.Code);
    }
    private static SourceCandidate Candidate(EngineeringSource source,string id,string name)=>new($"{source}:{id}",source,id,name,"product",null,null,null,null,MatchCategory.SourceSearchResult,"search",ConfidenceClass.Probable,[],new Dictionary<string,string?>(),new(ProvenanceKind.CachedSourceResult,"test",DateTimeOffset.UtcNow),true);
}
