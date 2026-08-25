using System.Text.Json;using Orchestration.API.Engineering.Contracts;using Orchestration.API.Engineering.Services;using Xunit;
namespace Orchestration.API.Tests.Engineering;
public class EngineeringContractsTests{
 [Theory][InlineData("000123","000123")][InlineData("  Ab-C  ","Ab-C")]public void NormalizerPreservesIdentity(string original,string expected){var r=new EngineeringQueryNormalizer().Normalize(new(original,null,null));Assert.Equal(original,r.OriginalValue);Assert.Equal(expected,r.NormalizedValue);Assert.DoesNotContain("remove-separator",r.Transformations);}
 [Fact]public void NormalizerRejectsControlCharacters()=>Assert.Throws<EngineeringValidationException>(()=>new EngineeringQueryNormalizer().Normalize(new("A\u0001B",null,null)));
 [Fact]public void ValidatorAcceptsIdOnly(){var r=Request(new("000123","000123",null,IdentifierType.ItemId));Assert.True(new EngineeringRequestValidator().Validate(r).IsValid);}
 [Fact]public void ValidatorAcceptsNameOnly(){var r=Request(new("Pump",null,"Pump",IdentifierType.ProductName));Assert.True(new EngineeringRequestValidator().Validate(r).IsValid);}
 [Fact]public void ValidatorRejectsDuplicateSources(){var r=Request(new("1","1",null),[EngineeringSource.Teamcenter,EngineeringSource.Teamcenter]);Assert.Contains(new EngineeringRequestValidator().Validate(r).Errors,x=>x.Code=="duplicate-sources");}
 [Fact]public void EnumsSerializeAsStrings(){var json=JsonSerializer.Serialize(new{source=EngineeringSource.Teamcenter,status=StandardStatus.PartialSuccess});var options=new JsonSerializerOptions();options.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower));json=JsonSerializer.Serialize(new{source=EngineeringSource.Teamcenter,status=StandardStatus.PartialSuccess},options);Assert.Contains("teamcenter",json);Assert.Contains("partial-success",json);}
 static EngineeringDiscoveryRequest Request(EngineeringQuery q,IReadOnlyList<EngineeringSource>? s=null)=>new(EngineeringContractVersions.V1,"r1","c1",s??[EngineeringSource.Teamcenter],q,10,new(30000),DateTimeOffset.UtcNow);

 [Fact]public void FederatedNormalizerPreservesIdAndNameIndependently(){var r=new EngineeringQueryNormalizer().NormalizeFederated(new(" 002403 ","002403","Screwjack"));Assert.Equal("002403",r.ProductId.NormalizedValue);Assert.Equal("Screwjack",r.ProductName.NormalizedValue);Assert.Equal(" 002403 ",r.OriginalInput);}
}
