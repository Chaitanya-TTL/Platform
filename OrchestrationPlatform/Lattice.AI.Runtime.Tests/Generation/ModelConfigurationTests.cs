using System.Globalization;
using Lattice.AI.Runtime.Azure.Models;
using Lattice.AI.Runtime.Contracts.Generation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Lattice.AI.Runtime.SourceEvidence;
using Orchestration.API.AI.Adapters;
using Orchestration.API.AI.Composition;

namespace Lattice.AI.Runtime.Tests.Generation;

public sealed class ModelConfigurationTests
{
    [Fact]
    public void AddAiRuntime_PropagatesConfiguredInputTokenAllowance()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AiRuntime:DeploymentName"] = "test-deployment",
                ["AiRuntime:MaxOutputTokens"] = "1536",
                ["AiRuntime:MaxInputTokens"] = "12288"
            })
            .Build();
        var services = new ServiceCollection();

        services.AddLogging();
        services.AddAiRuntime(configuration, new TestHostEnvironment
        {
            EnvironmentName = Environments.Production
        });
        using var provider = services.BuildServiceProvider();

        var modelConfiguration = provider.GetRequiredService<ModelConfiguration>();

        Assert.Equal(1536, modelConfiguration.MaxOutputTokens);
        Assert.Equal(12288, modelConfiguration.MaxInputTokens);
        Assert.Equal("gpt-4o", modelConfiguration.TokenizerModelName);
        Assert.IsType<PlmBrainSourceEvidenceRetriever>(
            provider.GetRequiredService<ISourceEvidenceRetriever>());
    }

    [Fact]
    public void AddAiRuntime_UsesExistingAzureOpenAiEnvironmentNames()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AZURE_OPENAI_ENDPOINT"] = "https://runtime.example.test",
                ["AZURE_OPENAI_DEPLOYMENT"] = "existing-deployment"
            })
            .Build();
        var services = new ServiceCollection();

        services.AddLogging();
        services.AddAiRuntime(configuration, new TestHostEnvironment());
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<AiRuntimeOptions>>().Value;
        var modelConfiguration = provider.GetRequiredService<ModelConfiguration>();

        Assert.Equal("https://runtime.example.test", options.Endpoint);
        Assert.Equal("existing-deployment", options.DeploymentName);
        Assert.Equal("existing-deployment", modelConfiguration.DeploymentName);
        Assert.Equal("gpt-4o", modelConfiguration.TokenizerModelName);
    }

    [Theory]
    [InlineData(null, 128000)]
    [InlineData(0, 128000)]
    [InlineData(2048, 2048)]
    [InlineData(12288, 12288)]
    public void AddAiRuntime_UsesDevelopmentFallbackOnlyWhenInputAllowanceIsUnset(
        int? maxInputTokens,
        int expectedMaxInputTokens)
    {
        var values = new Dictionary<string, string?>
        {
            ["AiRuntime:Endpoint"] = "https://runtime.example.test",
            ["AiRuntime:DeploymentName"] = "test-deployment",
            ["AiRuntime:MaxOutputTokens"] = "1024"
        };
        if (maxInputTokens is { } configuredInputTokens)
        {
            values["AiRuntime:MaxInputTokens"] =
                configuredInputTokens.ToString(CultureInfo.InvariantCulture);
        }

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAiRuntime(configuration, new TestHostEnvironment());
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<AiRuntimeOptions>>().Value;
        Assert.Equal(expectedMaxInputTokens, options.MaxInputTokens);
        options.Validate();
        Assert.Equal(
            expectedMaxInputTokens,
            provider.GetRequiredService<ModelConfiguration>().MaxInputTokens);
    }

    [Fact]
    public void AddAiRuntime_DoesNotApplyInputAllowanceFallbackOutsideDevelopment()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["AiRuntime:Endpoint"] = "https://runtime.example.test",
                ["AiRuntime:DeploymentName"] = "test-deployment"
            })
            .Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAiRuntime(configuration, new TestHostEnvironment
        {
            EnvironmentName = Environments.Production
        });
        using var provider = services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<AiRuntimeOptions>>().Value;
        Assert.Equal(0, options.MaxInputTokens);
        Assert.Throws<InvalidOperationException>(options.Validate);
    }

    [Fact]
    public void AddAiRuntime_UsesDevelopmentApiKeyAndDoesNotLogIt()
    {
        const string apiKey = "local-development-api-key";
        var configuration = CreateModelConfiguration(apiKey);
        var loggerProvider = new CapturingLoggerProvider();
        var services = new ServiceCollection();
        services.AddLogging(builder => builder.AddProvider(loggerProvider));
        services.AddAiRuntime(configuration, new TestHostEnvironment());
        using var provider = services.BuildServiceProvider();

        _ = provider.GetRequiredService<AzureOpenAiModelGateway>();

        Assert.Contains(
            loggerProvider.Messages,
            message => message.Contains("DevelopmentApiKey", StringComparison.Ordinal));
        Assert.DoesNotContain(
            string.Join(Environment.NewLine, loggerProvider.Messages),
            apiKey,
            StringComparison.Ordinal);
    }

    [Fact]
    public void AddAiRuntime_UsesDefaultAzureCredentialInProductionEvenWhenApiKeyIsConfigured()
    {
        const string apiKey = "production-ignored-api-key";
        var configuration = CreateModelConfiguration(apiKey, maxInputTokens: "4096");
        var loggerProvider = new CapturingLoggerProvider();
        var services = new ServiceCollection();
        services.AddLogging(builder => builder.AddProvider(loggerProvider));
        services.AddAiRuntime(configuration, new TestHostEnvironment
        {
            EnvironmentName = Environments.Production
        });
        using var provider = services.BuildServiceProvider();

        _ = provider.GetRequiredService<AzureOpenAiModelGateway>();

        Assert.Contains(
            loggerProvider.Messages,
            message => message.Contains("DefaultAzureCredential", StringComparison.Ordinal));
        Assert.DoesNotContain(
            string.Join(Environment.NewLine, loggerProvider.Messages),
            apiKey,
            StringComparison.Ordinal);
    }

    private static IConfiguration CreateModelConfiguration(string apiKey, string? maxInputTokens = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["AiRuntime:Endpoint"] = "https://runtime.example.test",
            ["AiRuntime:DeploymentName"] = "test-deployment",
            ["AiRuntime:MaxOutputTokens"] = "1024",
            ["AZURE_OPENAI_API_KEY"] = apiKey
        };
        if (maxInputTokens is not null)
        {
            values["AiRuntime:MaxInputTokens"] = maxInputTokens;
        }

        return new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";

        public string ApplicationName { get; set; } = "Lattice.AI.Runtime.Tests";

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
}
