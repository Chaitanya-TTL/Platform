using Newtonsoft.Json;
using Orchestration.API.Models;
namespace Orchestration.API.Tests;
public class SapOperationalImpactTests
{
    [Fact]
    public void Serialization_PreservesMaterialAndFiYearsSeparately()
    {
        var result=new SapOperationalImpactResult
        {
            SourceMaterialId="31", Plant="1001", Status="complete",
            History=new SapMaterialHistoryResult
            {
                MaterialId="31", Plant="1001", Status="complete",
                Movements=new List<SapMaterialMovement>
                {
                    new(){MaterialDocument="4900000311",MaterialDocumentYear="2016",Item="4",MovementType="261",SignedQuantity=-1,SignedLocalAmount=-500,
                        AccountingDocument=new SapAccountingDocument{DocumentNumber="1000000050",FiscalYear="2017",CompanyCode="0100"}}
                }
            }
        };
        var json=JsonConvert.SerializeObject(result);
        Assert.Contains("\"materialDocumentYear\":\"2016\"",json);
        Assert.Contains("\"fiscalYear\":\"2017\"",json);
        Assert.DoesNotContain("500000000110",json);
    }
}
