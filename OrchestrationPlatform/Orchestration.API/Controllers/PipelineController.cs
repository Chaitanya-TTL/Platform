using System;
using System.Collections.Generic;
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
        private readonly ILogger<PipelineController> _logger;

        public PipelineController(
            IPipelineOrchestrator orchestrator,
            IAuditLogger auditLogger,
            IJobStore jobStore,
            ILogger<PipelineController> logger)
        {
            _orchestrator = orchestrator;
            _auditLogger = auditLogger;
            _jobStore = jobStore;
            _logger = logger;
        }

        [HttpPost("start")]
        public async Task<IActionResult> StartPipeline([FromBody] PipelineRequest request)
        {
            if (string.IsNullOrEmpty(request.TeamcenterItemId))
            {
                return BadRequest("TeamcenterItemId is required");
            }

            var jobId = _jobStore.CreateJob(request.TeamcenterItemId);
            
            // Initialize the progress channel BEFORE starting the background task
            await _orchestrator.InitializeProgressChannelAsync(jobId);
            
            // Fire and forget - don't await, let it run in background
            _ = Task.Run(async () =>
            {
                await ExecutePipelineInBackground(jobId, request);
            });

            return Accepted(new { jobId, status = "accepted" });
        }

        [HttpGet("progress/{jobId}")]
        public async Task StartProgressStream(string jobId)
        {
            Response.ContentType = "text/event-stream";
            Response.Headers.Add("Cache-Control", "no-cache");
            Response.Headers.Add("Connection", "keep-alive");
            Response.Headers.Add("X-Accel-Buffering", "no");

            if (!_jobStore.JobExists(jobId))
            {
                var errorMsg = new { jobId, error = "Job not found", timestamp = DateTime.UtcNow.ToString("O") };
                await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(errorMsg)}\n\n");
                await Response.Body.FlushAsync();
                return;
            }

            // Subscribe to pipeline progress events
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

        [HttpGet("health")]
        public IActionResult Health()
        {
            return Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
        }

        private async Task ExecutePipelineInBackground(string jobId, PipelineRequest request)
        {
            try
            {
                _logger.LogInformation($"Starting pipeline execution for job {jobId}");
                
                // Use provided pipeline path or default to TC-Configit pipeline
                var pipelinePath = request.PipelinePath ?? GetDefaultPipelinePath();

                // This is a mock implementation - in real scenario, this would stream events
                await _orchestrator.ExecutePipelineAsync(
                    jobId,
                    request.TeamcenterItemId,
                    pipelinePath,
                    async (progress) =>
                    {
                        // Here we would stream progress to connected clients
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

        private string GetDefaultPipelinePath()
        {
            // Default to TC-Configit pipeline batch file
            // Navigate from bin/Debug/net9.0 -> Orchestration.API -> OrchestrationPlatform -> PLM -> PLM (root) -> TC-Configit
            var basePath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "TeamCenter-to-Configit-soa_client", "backend", "samples", "run-pipeline.bat"));
            return basePath;
        }
    }
}
