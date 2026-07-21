using System.Collections.Concurrent;
using System.Threading.Channels;
using Orchestration.API.Models;

namespace Orchestration.API.Services
{
    public interface IPipelineOrchestrator
    {
        Task InitializeProgressChannelAsync(string jobId);
        Task<(bool success, BomRoot finalBom, string outputFilePath, string outputKind)> ExecutePipelineAsync(string jobId, ExtractionRequest request, Func<PipelineProgress, Task> progressCallback);
        Task SubscribeToProgressAsync(string jobId, Func<PipelineProgress, Task> callback);
    }

    public class PipelineOrchestrator : IPipelineOrchestrator
    {
        private readonly ISubprocessExecutor _subprocessExecutor;
        private readonly IAuditLogger _auditLogger;
        private readonly ILogger<PipelineOrchestrator> _logger;
        private readonly ConcurrentDictionary<string, Channel<PipelineProgress>> _progressChannels = new();

        public PipelineOrchestrator(ISubprocessExecutor subprocessExecutor, IAuditLogger auditLogger, ILogger<PipelineOrchestrator> logger)
        { _subprocessExecutor = subprocessExecutor; _auditLogger = auditLogger; _logger = logger; }

        public Task InitializeProgressChannelAsync(string jobId)
        { _progressChannels.TryAdd(jobId, Channel.CreateUnbounded<PipelineProgress>()); return Task.CompletedTask; }

        public async Task SubscribeToProgressAsync(string jobId, Func<PipelineProgress, Task> callback)
        {
            if (_progressChannels.TryGetValue(jobId, out var channel))
                await foreach (var progress in channel.Reader.ReadAllAsync()) await callback(progress);
        }

        public async Task<(bool success, BomRoot finalBom, string outputFilePath, string outputKind)> ExecutePipelineAsync(
            string jobId, ExtractionRequest request, Func<PipelineProgress, Task> progressCallback)
        {
            if (!_progressChannels.TryGetValue(jobId, out var channel))
            { channel = Channel.CreateUnbounded<PipelineProgress>(); _progressChannels.TryAdd(jobId, channel); }
            var source = request.Kind == ExtractionKind.Sap ? "SAP" : request.Kind == ExtractionKind.Configit ? "Configit" : "TeamCenter";
            var auditLog = new AuditLog { JobId = jobId, TeamcenterItemId = request.GetIdentifier(), StartTime = DateTime.UtcNow, Status = "in_progress", Phases = new() };
            await _auditLogger.LogAsync(auditLog);
            var outputKind = request.Kind.ToString().ToLowerInvariant();
            try
            {
                await Report(jobId, "extract", "in_progress", 0, $"Connecting to {source}...", progressCallback, channel);
                var extract = new PhaseLog { Phase = "extract", StartTime = DateTime.UtcNow, ProgressPercent = 0, Status = "in_progress" };
                auditLog.Phases.Add(extract);
                await Report(jobId, "transform", "in_progress", 20, $"Executing {source} extraction...", progressCallback, channel);
                var transform = new PhaseLog { Phase = "transform", StartTime = DateTime.UtcNow, ProgressPercent = 20, Status = "in_progress" };
                auditLog.Phases.Add(transform);

                var (success, output, bom, path) = await _subprocessExecutor.ExecuteAsync(request,
                    message => Report(jobId, "transform", "in_progress", 70, message, progressCallback, channel));
                if (!success || bom == null) throw new Exception($"Pipeline execution failed: {output}");

                extract.Status = "complete"; extract.EndTime = DateTime.UtcNow; extract.ProgressPercent = 20; extract.Message = $"Data extracted from {source}";
                transform.Status = "complete"; transform.EndTime = DateTime.UtcNow; transform.ProgressPercent = 80; transform.Message = "BOM transformed successfully";
                await Report(jobId, "load", "in_progress", 90, "Finalizing...", progressCallback, channel);
                var load = new PhaseLog { Phase = "load", StartTime = DateTime.UtcNow, ProgressPercent = 90, Status = "in_progress" };
                auditLog.Phases.Add(load);
                await Task.Delay(300);
                load.Status = "complete"; load.EndTime = DateTime.UtcNow; load.ProgressPercent = 100; load.Message = "Pipeline completed successfully";
                auditLog.Status = "success"; auditLog.EndTime = DateTime.UtcNow; auditLog.FinalBom = bom; auditLog.OutputFilePath = path; auditLog.OutputKind = outputKind;
                await Report(jobId, "load", "complete", 100, "Pipeline completed successfully!", progressCallback, channel);
                await _auditLogger.LogAsync(auditLog);
                return (true, bom, path, outputKind);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Pipeline failed for job {JobId}", jobId);
                auditLog.Status = "failed"; auditLog.Error = ex.Message; auditLog.EndTime = DateTime.UtcNow;
                await Report(jobId, "error", "error", 0, $"Error: {ex.Message}", progressCallback, channel);
                await _auditLogger.LogAsync(auditLog);
                return (false, null!, null!, outputKind);
            }
            finally { if (_progressChannels.TryGetValue(jobId, out var ch)) ch.Writer.TryComplete(); }
        }

        private async Task Report(string jobId, string phase, string status, int percent, string message,
            Func<PipelineProgress, Task> callback, Channel<PipelineProgress> channel)
        {
            var progress = new PipelineProgress { JobId = jobId, Phase = phase, Status = status, ProgressPercent = percent, Message = message, Timestamp = DateTime.UtcNow.ToString("O") };
            try { await callback(progress); await channel.Writer.WriteAsync(progress); }
            catch (Exception ex) { _logger.LogError(ex, "Error reporting progress"); }
        }
    }
}
