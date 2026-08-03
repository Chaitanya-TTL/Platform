using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Services;
namespace Orchestration.API.Controllers;
[ApiController]
[Route("api/sap-impact-validation")]
public sealed class SapImpactValidationController : ControllerBase
{
    private readonly ISapExecutionValidationService _service;
    public SapImpactValidationController(ISapExecutionValidationService service)=>_service=service;
    [HttpPost("run")]
    public async Task<IActionResult> Run([FromBody] SapImpactValidationRequest request,CancellationToken token)
    {
        if(string.IsNullOrWhiteSpace(request.MaterialId))return BadRequest(new{success=false,message="MaterialId is required"});
        var plant=string.IsNullOrWhiteSpace(request.Plant)?"1001":request.Plant.Trim();
        try{var result=await _service.RunAsync(request.MaterialId.Trim(),plant,token);return Ok(new{success=true,report=result.report,outputFilePath=result.outputPath});}
        catch(Exception ex){return StatusCode(500,new{success=false,message=ex.Message});}
    }
}
public sealed class SapImpactValidationRequest{public string MaterialId{get;set;}="";public string? Plant{get;set;}}
