using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Channels;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Orchestration.API.Models;

namespace Orchestration.API.Services
{
    public interface IPipelineOrchestrator
    {
        Task InitializeProgressChannelAsync(string jobId);
        
        Task<(bool success, BomRoot finalBom)> ExecutePipelineAsync(
            string jobId,
            string teamcenterItemId,
            string pipelinePath,
            Func<PipelineProgress, Task> progressCallback);
        
        Task SubscribeToProgressAsync(
            string jobId,
            Func<PipelineProgress, Task> callback);
    }

    public class PipelineOrchestrator : IPipelineOrchestrator
    {
        private readonly ISubprocessExecutor _subprocessExecutor;
        private readonly IAuditLogger _auditLogger;
        private readonly ILogger<PipelineOrchestrator> _logger;
        private readonly ConcurrentDictionary<string, Channel<PipelineProgress>> _progressChannels;

        public PipelineOrchestrator(
            ISubprocessExecutor subprocessExecutor,
            IAuditLogger auditLogger,
            ILogger<PipelineOrchestrator> logger)
        {
            _subprocessExecutor = subprocessExecutor;
            _auditLogger = auditLogger;
            _logger = logger;
            _progressChannels = new ConcurrentDictionary<string, Channel<PipelineProgress>>();
        }

        public async Task InitializeProgressChannelAsync(string jobId)
        {
            var channel = Channel.CreateUnbounded<PipelineProgress>();
            _progressChannels.TryAdd(jobId, channel);
            await Task.CompletedTask;
        }

        public async Task SubscribeToProgressAsync(
            string jobId,
            Func<PipelineProgress, Task> callback)
        {
            if (_progressChannels.TryGetValue(jobId, out var channel))
            {
                await foreach (var progress in channel.Reader.ReadAllAsync())
                {
                    await callback(progress);
                }
            }
        }

        public async Task<(bool success, BomRoot finalBom)> ExecutePipelineAsync(
            string jobId,
            string teamcenterItemId,
            string pipelinePath,
            Func<PipelineProgress, Task> progressCallback)
        {
            // Get the pre-initialized channel or create if missing (fallback)
            if (!_progressChannels.TryGetValue(jobId, out var channel))
            {
                var newChannel = Channel.CreateUnbounded<PipelineProgress>();
                _progressChannels.TryAdd(jobId, newChannel);
                channel = newChannel;
            }

            var auditLog = new AuditLog
            {
                JobId = jobId,
                TeamcenterItemId = teamcenterItemId,
                StartTime = DateTime.UtcNow,
                Status = "in_progress",
                Phases = new()
            };

            BomRoot finalBom = null;
            string pipelineOutput = null;

            try
            {
                // Send initial "starting" event
                await ReportPhaseProgress(jobId, "extract", "in_progress", 0, "Starting pipeline...", progressCallback, channel);
                
                // Phase 1: Parse/Extract
                await ReportPhaseProgress(jobId, "extract", "in_progress", 0, "Connecting to TeamCenter...", progressCallback, channel);
                var extractPhase = new PhaseLog 
                { 
                    Phase = "extract", 
                    StartTime = DateTime.UtcNow, 
                    ProgressPercent = 0,
                    Status = "in_progress"
                };
                auditLog.Phases.Add(extractPhase);

                // Phase 2: Execute Pipeline
                await ReportPhaseProgress(jobId, "transform", "in_progress", 20, "Executing ETL pipeline...", progressCallback, channel);
                var transformPhase = new PhaseLog 
                { 
                    Phase = "transform", 
                    StartTime = DateTime.UtcNow, 
                    ProgressPercent = 20,
                    Status = "in_progress"
                };
                auditLog.Phases.Add(transformPhase);

                // Execute the subprocess
                var (success, output, bomStructure) = await _subprocessExecutor.ExecuteAsync(
                    teamcenterItemId,
                    pipelinePath,
                    async (progressMsg) =>
                    {
                        await ReportPhaseProgress(jobId, "transform", "in_progress",
                            Math.Min(80, 20 + 50), 
                            progressMsg, progressCallback, channel);
                    });

                if (!success)
                {
                    throw new Exception($"Pipeline execution failed: {output}");
                }

                pipelineOutput = output;
                finalBom = bomStructure;

                extractPhase.Status = "complete";
                extractPhase.EndTime = DateTime.UtcNow;
                extractPhase.ProgressPercent = 20;
                extractPhase.Message = "✓ Data extracted from TeamCenter";

                transformPhase.Status = "complete";
                transformPhase.EndTime = DateTime.UtcNow;
                transformPhase.ProgressPercent = 80;
                transformPhase.Message = "✓ BOM transformed successfully";

                // Phase 3: Load/Complete
                await ReportPhaseProgress(jobId, "load", "in_progress", 90, "Finalizing...", progressCallback, channel);
                var loadPhase = new PhaseLog 
                { 
                    Phase = "load", 
                    StartTime = DateTime.UtcNow, 
                    ProgressPercent = 90,
                    Status = "in_progress"
                };
                auditLog.Phases.Add(loadPhase);

                await Task.Delay(300);

                loadPhase.Status = "complete";
                loadPhase.EndTime = DateTime.UtcNow;
                loadPhase.ProgressPercent = 100;
                loadPhase.Message = "✓ Pipeline completed successfully";

                auditLog.Status = "success";
                auditLog.EndTime = DateTime.UtcNow;
                auditLog.FinalBom = finalBom;

                await ReportPhaseProgress(jobId, "load", "complete", 100, "✓ Pipeline completed successfully!", progressCallback, channel);

                _logger.LogInformation($"Pipeline executed successfully for job {jobId}");
                await _auditLogger.LogAsync(auditLog);

                return (true, finalBom);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Pipeline failed for job {jobId}: {ex.Message}");

                auditLog.Status = "failed";
                auditLog.Error = ex.Message;
                auditLog.EndTime = DateTime.UtcNow;

                await ReportPhaseProgress(jobId, "error", "error", 0, $"❌ Error: {ex.Message}", progressCallback, channel);
                await _auditLogger.LogAsync(auditLog);

                return (false, null);
            }
            finally
            {
                // Close the channel
                if (_progressChannels.TryGetValue(jobId, out var ch))
                {
                    ch.Writer.TryComplete();
                }
            }
        }

        private async Task ReportPhaseProgress(
            string jobId,
            string phase,
            string status,
            int progressPercent,
            string message,
            Func<PipelineProgress, Task> progressCallback,
            Channel<PipelineProgress> channel)
        {
            var progress = new PipelineProgress
            {
                JobId = jobId,
                Phase = phase,
                Status = status,
                ProgressPercent = progressPercent,
                Message = message,
                Timestamp = DateTime.UtcNow.ToString("O")
            };

            try
            {
                await progressCallback(progress);
                await channel.Writer.WriteAsync(progress);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error reporting progress: {ex.Message}");
            }
        }
    }
}
