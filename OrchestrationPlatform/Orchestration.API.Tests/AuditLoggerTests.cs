using Microsoft.Extensions.Logging;
using Orchestration.API.Models;
using Orchestration.API.Services;
using Xunit;

namespace Orchestration.API.Tests;

public class AuditLoggerTests
{
    [Fact]
    public async Task GetLogByJobIdAsync_ReturnsLatestLog_WhenJobProgressUpdates()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), "orchestration-api-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        var originalBaseDir = AppContext.GetData("APP_CONTEXT_BASE_DIRECTORY") as string;
        AppContext.SetData("APP_CONTEXT_BASE_DIRECTORY", tempDir);

        try
        {
            var logger = LoggerFactory.Create(builder => builder.AddDebug()).CreateLogger<FileAuditLogger>();
            var auditLogger = new FileAuditLogger(logger);

            var initialLog = new AuditLog
            {
                JobId = "job_123",
                TeamcenterItemId = "000575",
                StartTime = DateTime.UtcNow,
                Status = "in_progress"
            };

            await auditLogger.LogAsync(initialLog);

            var completedLog = new AuditLog
            {
                JobId = "job_123",
                TeamcenterItemId = "000575",
                StartTime = initialLog.StartTime,
                EndTime = DateTime.UtcNow,
                Status = "success",
                FinalBom = new BomRoot { SourceItemId = "000575" }
            };

            await auditLogger.LogAsync(completedLog);

            var fetched = await auditLogger.GetLogByJobIdAsync("job_123");

            Assert.NotNull(fetched);
            Assert.Equal("job_123", fetched.JobId);
            Assert.Equal("success", fetched.Status);
            Assert.NotNull(fetched.FinalBom);
        }
        finally
        {
            if (originalBaseDir is null)
            {
                AppContext.SetData("APP_CONTEXT_BASE_DIRECTORY", null);
            }
            else
            {
                AppContext.SetData("APP_CONTEXT_BASE_DIRECTORY", originalBaseDir);
            }

            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }
}
