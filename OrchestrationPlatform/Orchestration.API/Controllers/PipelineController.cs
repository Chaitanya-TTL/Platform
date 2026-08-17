
using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Models;
using Orchestration.API.Services;
namespace Orchestration.API.Controllers;
[ApiController][Route("api/[controller]")]
public class PipelineController:ControllerBase
{
    private readonly IPipelineOrchestrator _orchestrator;private readonly IAuditLogger _auditLogger;private readonly IJobStore _jobStore;private readonly ILogger<PipelineController> _logger;
    public PipelineController(IPipelineOrchestrator orchestrator,IAuditLogger auditLogger,IJobStore jobStore,ILogger<PipelineController> logger){_orchestrator=orchestrator;_auditLogger=auditLogger;_jobStore=jobStore;_logger=logger;}
    [HttpPost("start")]
    public async Task<IActionResult> StartPipeline([FromBody]ExtractionRequest request)
    {
        if(request.Kind==ExtractionKind.Teamcenter&&string.IsNullOrWhiteSpace(request.TeamcenterItemId))return BadRequest(new{success=false,message="TeamcenterItemId is required"});
        if(request.Kind==ExtractionKind.Configit&&(string.IsNullOrWhiteSpace(request.WorkItemId)||string.IsNullOrWhiteSpace(request.ProductModelCode)))return BadRequest(new{success=false,message="WorkItemId and ProductModelCode are required"});
        if(request.Kind==ExtractionKind.Sap&&string.IsNullOrWhiteSpace(request.MaterialId))return BadRequest(new{success=false,message="MaterialId is required"});
        var jobId=_jobStore.CreateJob(request.GetIdentifier()??"unknown");request.JobId=jobId;
        try{await _orchestrator.InitializeProgressChannelAsync(jobId);_=Task.Run(()=>ExecutePipelineInBackground(jobId,request));return Ok(new{success=true,jobId,kind=request.Kind.ToString().ToLowerInvariant(),message="Extraction started successfully"});}
        catch(Exception ex){_jobStore.FailJob(jobId,ex.Message);_logger.LogError(ex,"Pipeline start failed for job {JobId}",jobId);return StatusCode(500,new{success=false,jobId,message=ex.Message});}
    }
    [HttpGet("progress/{jobId}")]
    public async Task StartProgressStream(string jobId){Response.ContentType="text/event-stream";Response.Headers["Cache-Control"]="no-cache";Response.Headers["X-Accel-Buffering"]="no";if(!_jobStore.JobExists(jobId)){await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(new{jobId,error="Job not found",timestamp=DateTime.UtcNow.ToString("O")})}\n\n");await Response.Body.FlushAsync();return;}await _orchestrator.SubscribeToProgressAsync(jobId,async p=>{await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(p)}\n\n");await Response.Body.FlushAsync();});}
    [HttpGet("logs")]public async Task<IActionResult> GetAllLogs()=>Ok(await _auditLogger.GetAllLogsAsync());
    [HttpGet("logs/{jobId}")]public async Task<IActionResult> GetLogByJobId(string jobId){var log=await _auditLogger.GetLogByJobIdAsync(jobId);return log==null?NotFound(new{error=$"No log found for job {jobId}",jobId}):Ok(log);}
    [HttpGet("bom/{jobId}")]public async Task<IActionResult> GetBomByJobId(string jobId){var log=await _auditLogger.GetLogByJobIdAsync(jobId);if(log==null)return NotFound(new{error=$"No log found for job {jobId}",jobId});if(log.FinalBom==null)return NotFound(new{error=$"No final BOM available for job {jobId}",jobId,status=log.Status});return Ok(new{success=true,jobId,status=log.Status,finalBom=log.FinalBom});}
    [HttpGet("sap-impact/{jobId}")]public async Task<IActionResult> GetSapImpact(string jobId){var log=await _auditLogger.GetLogByJobIdAsync(jobId);if(log==null)return NotFound(new{error=$"No log found for job {jobId}",jobId});if(log.SapBusinessImpact==null)return NotFound(new{error=$"SAP impact is not available for job {jobId}",jobId,status=log.Status});return Ok(new{success=true,jobId,status=log.Status,sapImpact=log.SapBusinessImpact});}
    [HttpGet("sap-operational-impact/{jobId}")]public async Task<IActionResult> GetSapOperationalImpact(string jobId){var log=await _auditLogger.GetLogByJobIdAsync(jobId);if(log==null)return NotFound(new{error=$"No log found for job {jobId}",jobId});if(log.SapOperationalImpact==null)return NotFound(new{error=$"SAP operational impact is not available for job {jobId}",jobId,status=log.Status});return Ok(new{success=true,jobId,status=log.Status,sapOperationalImpact=log.SapOperationalImpact});}
    [HttpGet("health")]public IActionResult Health()=>Ok(new{status="healthy",timestamp=DateTime.UtcNow});
    private async Task ExecutePipelineInBackground(string jobId,ExtractionRequest request){try{var result=await _orchestrator.ExecutePipelineAsync(jobId,request,_=>Task.CompletedTask);if(result.success)_jobStore.CompleteJob(jobId);else _jobStore.FailJob(jobId,$"{request.Kind} extraction failed");}catch(Exception ex){_logger.LogError(ex,"Pipeline execution failed for job {JobId}",jobId);_jobStore.FailJob(jobId,ex.Message);}}
}
