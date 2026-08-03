using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Models;
using Orchestration.API.Services;
namespace Orchestration.API.Controllers;
[ApiController]
[Route("api/sap-material-catalog")]
public sealed class SapMaterialCatalogController : ControllerBase
{
    private readonly ISapMaterialCatalogService _service;
    public SapMaterialCatalogController(ISapMaterialCatalogService service)=>_service=service;

    [HttpPost("extract")]
    public async Task<IActionResult> Extract([FromBody] SapMaterialCatalogRequest? request,CancellationToken token)
    {
        request??=new SapMaterialCatalogRequest();
        if(request.MaxRows<0) return BadRequest(new{success=false,message="MaxRows cannot be negative."});
        try
        {
            var output=await _service.ExtractAsync(request.MaterialPrefix?.Trim()??"",request.MaxRows,token);
            return Ok(new
            {
                success=true,
                output.result.SystemId,
                output.result.Client,
                output.result.GeneratedAt,
                output.result.Status,
                output.result.RawRowsReturned,
                output.result.TotalMaterials,
                output.result.Warnings,
                jsonOutputPath=output.jsonPath,
                csvOutputPath=output.csvPath
            });
        }
        catch(OperationCanceledException){return StatusCode(499,new{success=false,message="SAP material catalog extraction was cancelled."});}
        catch(Exception ex){return StatusCode(500,new{success=false,message=ex.Message});}
    }
}
