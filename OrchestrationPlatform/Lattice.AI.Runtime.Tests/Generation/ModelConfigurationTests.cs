using Lattice.AI.Runtime.Contracts.Generation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
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

        services.AddAiRuntime(configuration, new TestHostEnvironment());
        using var provider = services.BuildServiceProvider();

        var modelConfiguration = provider.GetRequiredService<ModelConfiguration>();

        Assert.Equal(1536, modelConfiguration.MaxOutputTokens);
        Assert.Equal(12288, modelConfiguration.MaxInputTokens);
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";

        public string ApplicationName { get; set; } = "Lattice.AI.Runtime.Tests";

        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
