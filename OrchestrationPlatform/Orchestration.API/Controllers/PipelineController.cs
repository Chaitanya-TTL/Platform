using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Models;
using Orchestration.API.Services;

namespace Orchestration.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PipelineController : ControllerBase
    {
        private readonly IPipelineOrchestrator _orchestrator;
        private readonly IAuditLogger _auditLogger;
        private readonly IJobStore _jobStore;
        private readonly ISubprocessExecutor _subprocessExecutor;
        private readonly ILogger<PipelineController> _logger;

        public PipelineController(
            IPipelineOrchestrator orchestrator,
            IAuditLogger auditLogger,
            IJobStore jobStore,
            ISubprocessExecutor subprocessExecutor,
            ILogger<PipelineController> logger)
        {
            _orchestrator = orchestrator;
            _auditLogger = auditLogger;
            _jobStore = jobStore;
            _subprocessExecutor = subprocessExecutor;
            _logger = logger;
        }

        [HttpPost("start")]
        public async Task<IActionResult> StartPipeline([FromBody] ExtractionRequest request)
        {
            _logger.LogInformation(
                "Received pipeline start request. Kind={Kind}, TeamcenterItemId={TeamcenterItemId}, WorkItemId={WorkItemId}, ProductModelCode={ProductModelCode}",
                request.Kind,
                request.TeamcenterItemId,
                request.WorkItemId,
                request.ProductModelCode);

            if (request.Kind == ExtractionKind.Teamcenter && string.IsNullOrWhiteSpace(request.TeamcenterItemId))
            {
                return BadRequest(new { success = false, message = "TeamcenterItemId is required" });
            }

            if (request.Kind == ExtractionKind.Configit && (string.IsNullOrWhiteSpace(request.WorkItemId) || string.IsNullOrWhiteSpace(request.ProductModelCode)))
            {
                return BadRequest(new { success = false, message = "WorkItemId and ProductModelCode are required" });
            }

            var jobId = _jobStore.CreateJob(request.GetIdentifier() ?? "unknown");
            request.JobId = jobId;
            _logger.LogInformation("Created job {JobId} for {Kind} extraction", jobId, request.Kind);

            try
            {
                await _orchestrator.InitializeProgressChannelAsync(jobId);
                _ = Task.Run(() => ExecutePipelineInBackground(jobId, request));

                return Ok(new
                {
                    success = true,
                    jobId,
                    kind = request.Kind.ToString().ToLowerInvariant(),
                    message = "Extraction started successfully"
                });
            }
            catch (Exception ex)
            {
                _jobStore.FailJob(jobId, ex.Message);
                _logger.LogError(ex, "Pipeline start failed for job {JobId}", jobId);
                return StatusCode(500, new { success = false, jobId, message = ex.Message });
            }
        }

        [HttpGet("progress/{jobId}")]
        public async Task StartProgressStream(string jobId)
        {
            Response.ContentType = "text/event-stream";
            Response.Headers["Cache-Control"] = "no-cache";
            Response.Headers["Connection"] = "keep-alive";
            Response.Headers["X-Accel-Buffering"] = "no";

            if (!_jobStore.JobExists(jobId))
            {
                var errorMsg = new { jobId, error = "Job not found", timestamp = DateTime.UtcNow.ToString("O") };
                await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(errorMsg)}\n\n");
                await Response.Body.FlushAsync();
                return;
            }

            await _orchestrator.SubscribeToProgressAsync(jobId, async (progress) =>
            {
                var json = System.Text.Json.JsonSerializer.Serialize(progress);
                await Response.WriteAsync($"data: {json}\n\n");
                await Response.Body.FlushAsync();
            });
        }

        [HttpGet("logs")]
        public async Task<IActionResult> GetAllLogs()
        {
            var logs = await _auditLogger.GetAllLogsAsync();
            return Ok(logs);
        }

        [HttpGet("logs/{jobId}")]
        public async Task<IActionResult> GetLogByJobId(string jobId)
        {
            var log = await _auditLogger.GetLogByJobIdAsync(jobId);
            if (log == null)
            {
                return NotFound(new { error = $"No log found for job {jobId}", jobId });
            }
            return Ok(log);
        }

        [HttpGet("bom/{jobId}")]
        public async Task<IActionResult> GetBomByJobId(string jobId)
        {
            var log = await _auditLogger.GetLogByJobIdAsync(jobId);
            if (log == null)
            {
                return NotFound(new { error = $"No log found for job {jobId}", jobId });
            }

            if (log.FinalBom == null)
            {
                return NotFound(new { error = $"No final BOM available for job {jobId}", jobId, status = log.Status });
            }

            return Ok(new { success = true, jobId, status = log.Status, finalBom = log.FinalBom });
        }

        [HttpGet("health")]
        public IActionResult Health()
        {
            return Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
        }

        private async Task ExecutePipelineInBackground(string jobId, ExtractionRequest request)
        {
            try
            {
                _logger.LogInformation($"Starting {request.Kind} extraction execution for job {jobId}");

                await _orchestrator.ExecutePipelineAsync(
                    jobId,
                    request,
                    async (progress) =>
                    {
                        _logger.LogInformation($"Job {jobId}: {progress.Phase} - {progress.ProgressPercent}%");
                        await Task.CompletedTask;
                    });

                _jobStore.CompleteJob(jobId);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Pipeline execution failed for job {jobId}: {ex.Message}");
                _jobStore.FailJob(jobId, ex.Message);
            }
        }
    }
}
