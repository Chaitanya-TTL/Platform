using System.Xml.Linq;

namespace Orchestration.API.Tests;

public sealed class RuntimeFoundationSetupTests
{
    [Fact]
    public void Api_targets_net10()
    {
        var projectPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "Orchestration.API",
            "Orchestration.API.csproj"));

        var project = XDocument.Load(projectPath);
        var targetFramework = project
            .Descendants("TargetFramework")
            .Single()
            .Value;

        Assert.Equal("net10.0", targetFramework);
    }
}
