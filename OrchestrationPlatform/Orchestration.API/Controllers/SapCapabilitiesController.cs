using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Services;
namespace Orchestration.API.Controllers;
[ApiController]
[Route("api/sap-capabilities")]
public sealed class SapCapabilitiesController : ControllerBase
{
    private readonly ISapCapabilityProbeService _service;
    public SapCapabilitiesController(ISapCapabilityProbeService service)=>_service=service;
    [HttpPost("probe")]
    public async Task<IActionResult> Probe([FromBody] SapProbeRequest request,CancellationToken token)
    {
        if(string.IsNullOrWhiteSpace(request.MaterialId)) return BadRequest(new{success=false,message="MaterialId is required"});
        var plant=string.IsNullOrWhiteSpace(request.Plant)?"1001":request.Plant.Trim();
        try { var result=await _service.RunAsync(request.MaterialId.Trim(),plant,token); return Ok(new{success=true,report=result.report,outputFilePath=result.outputPath}); }
        catch(Exception ex) { return StatusCode(500,new{success=false,message=ex.Message}); }
    }
}
public sealed class SapProbeRequest { public string MaterialId { get; set; }=""; public string? Plant { get; set; } }
