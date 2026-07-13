using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Orchestration.API.Models;

namespace Orchestration.API.Services
{
    public interface IAuditLogger
    {
        Task LogAsync(AuditLog log);
        Task<List<AuditLog>> GetAllLogsAsync();
        Task<AuditLog> GetLogByJobIdAsync(string jobId);
    }

    public class FileAuditLogger : IAuditLogger
    {
        private readonly string _logsDirectory;
        private readonly ILogger<FileAuditLogger> _logger;

        public FileAuditLogger(ILogger<FileAuditLogger> logger)
        {
            _logger = logger;

            var baseDirectory = AppContext.GetData("APP_CONTEXT_BASE_DIRECTORY") as string;
            if (string.IsNullOrWhiteSpace(baseDirectory))
            {
                baseDirectory = AppContext.BaseDirectory;
            }

            _logsDirectory = Path.Combine(baseDirectory, "Logs");

            if (!Directory.Exists(_logsDirectory))
            {
                Directory.CreateDirectory(_logsDirectory);
            }
        }

        public async Task LogAsync(AuditLog log)
        {
            try
            {
                var fileName = $"audit_{log.JobId}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.json";
                var filePath = Path.Combine(_logsDirectory, fileName);

                var json = JsonConvert.SerializeObject(log, Formatting.Indented);
                await File.WriteAllTextAsync(filePath, json);

                _logger.LogInformation($"Audit log written to {filePath}");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error writing audit log: {ex.Message}");
            }
        }

        public async Task<List<AuditLog>> GetAllLogsAsync()
        {
            var logs = new List<AuditLog>();

            try
            {
                if (!Directory.Exists(_logsDirectory))
                    return logs;

                var files = Directory.GetFiles(_logsDirectory, "audit_*.json")
                    .OrderByDescending(file => new FileInfo(file).LastWriteTimeUtc)
                    .ToList();

                foreach (var file in files)
                {
                    try
                    {
                        var json = await File.ReadAllTextAsync(file);
                        var log = JsonConvert.DeserializeObject<AuditLog>(json);
                        if (log != null)
                        {
                            logs.Add(log);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError($"Error reading log file {file}: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error reading audit logs: {ex.Message}");
            }

            return logs;
        }

        public async Task<AuditLog> GetLogByJobIdAsync(string jobId)
        {
            try
            {
                if (!Directory.Exists(_logsDirectory))
                    return null;

                var files = Directory.GetFiles(_logsDirectory, $"audit_{jobId}_*.json")
                    .OrderByDescending(file => new FileInfo(file).LastWriteTimeUtc)
                    .ToList();

                if (files.Count > 0)
                {
                    var json = await File.ReadAllTextAsync(files[0]);
                    return JsonConvert.DeserializeObject<AuditLog>(json);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error retrieving log for job {jobId}: {ex.Message}");
            }

            return null;
        }
    }
}
