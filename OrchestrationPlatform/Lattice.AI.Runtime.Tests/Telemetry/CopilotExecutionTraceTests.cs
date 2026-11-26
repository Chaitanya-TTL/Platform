using System.Text.Json;
using Lattice.AI.Runtime.Telemetry;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Orchestration.API.AI.Telemetry;

namespace Lattice.AI.Runtime.Tests.Telemetry;

public sealed class CopilotExecutionTraceTests
{
    [Fact]
    public void SummaryModeOmitsFullPayloadAndRedactsSensitiveFields()
    {
        using var provider = new CapturingLoggerProvider();
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddProvider(provider));
        var trace = new CopilotExecutionTraceLogger(
            loggerFactory.CreateLogger<CopilotExecutionTraceLogger>(),
            Options.Create(new CopilotExecutionTraceOptions { Enabled = true }),
            CreateEnvironment("Development"));

        trace.Write(CreateEvent("summary"));

        var output = Assert.Single(provider.Messages);
        Assert.Contains("\"routeSource\":\"UnifiedRuntime\"", output, StringComparison.Ordinal);
        Assert.Contains("\"requestId\":\"request-1\"", output, StringComparison.Ordinal);
        Assert.DoesNotContain("full investigation payload", output, StringComparison.Ordinal);
        Assert.DoesNotContain("unit-test-secret", output, StringComparison.Ordinal);
        Assert.DoesNotContain("apiKey", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("authorization", output, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void FullPayloadModeIncludesPayloadButRedactsCredentialFields()
    {
        using var provider = new CapturingLoggerProvider();
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddProvider(provider));
        var trace = new CopilotExecutionTraceLogger(
            loggerFactory.CreateLogger<CopilotExecutionTraceLogger>(),
            Options.Create(new CopilotExecutionTraceOptions
            {
                Enabled = true,
                FullPayloadTraceEnabled = true
            }),
            CreateEnvironment("Testing"));

        trace.Write(CreateEvent("full"));

        var output = Assert.Single(provider.Messages);
        Assert.Contains("full investigation payload", output, StringComparison.Ordinal);
        Assert.DoesNotContain("unit-test-secret", output, StringComparison.Ordinal);
        Assert.DoesNotContain("apiKey", output, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("authorization", output, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ProductionRejectsFullPayloadTraceConfiguration()
    {
        using var provider = new CapturingLoggerProvider();
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddProvider(provider));

        Assert.Throws<InvalidOperationException>(() => new CopilotExecutionTraceLogger(
            loggerFactory.CreateLogger<CopilotExecutionTraceLogger>(),
            Options.Create(new CopilotExecutionTraceOptions
            {
                Enabled = true,
                FullPayloadTraceEnabled = true
            }),
            CreateEnvironment("Production")));
    }

    [Fact]
    public void TraceSinkFailureDoesNotEscapeIntoAnswerExecution()
    {
        var trace = new CopilotExecutionTraceLogger(
            new ThrowingLogger(),
            Options.Create(new CopilotExecutionTraceOptions { Enabled = true }),
            CreateEnvironment("Development"));

        var exception = Record.Exception(() => trace.Write(CreateEvent("summary")));

        Assert.Null(exception);
    }

    private static CopilotExecutionTraceEvent CreateEvent(string payloadDetail)
    {
        using var input = JsonDocument.Parse("""{"question":"Summarize this","authorization":"Bearer unit-test-secret"}""");
        using var payload = JsonDocument.Parse("""{"snapshot":"full investigation payload","apiKey":"unit-test-secret"}""");

        return new CopilotExecutionTraceEvent(
            "1",
            "stage.completed",
            "prompt",
            "UnifiedRuntime",
            payloadDetail,
            DateTimeOffset.UtcNow,
            "request-1",
            "trace-1",
            "investigation-1",
            4,
            12,
            "completed",
            input.RootElement.Clone(),
            null,
            [],
            [],
            [],
            [],
            "payload-1",
            payload.RootElement.Clone(),
            null);
    }

    private static TestHostEnvironment CreateEnvironment(string environmentName) =>
        new() { EnvironmentName = environmentName };

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = string.Empty;
        public string ApplicationName { get; set; } = "Orchestration.API.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public List<string> Messages { get; } = [];

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(Messages);

        public void Dispose()
        {
        }
    }

    private sealed class CapturingLogger(List<string> messages) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            messages.Add(formatter(state, exception));
    }

    private sealed class ThrowingLogger : ILogger<CopilotExecutionTraceLogger>
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull =>
            throw new InvalidOperationException("test sink failure");

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            throw new InvalidOperationException("test sink failure");
    }
}
