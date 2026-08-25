using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Orchestration.API.Engineering.Adapters.Teamcenter;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;
using Xunit;

namespace Orchestration.API.Tests.Engineering;

public sealed class TeamcenterArtifactCaptureTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"tc-capture-{Guid.NewGuid():N}");

    [Fact]
    public async Task CapturesFreshOwnedOutputIntoLogicalArtifacts()
    {
        var legacy = WriteBom("000123");
        var service = CreateService();
        var result = await service.CaptureAsync("job-1", "000123", legacy,
            DateTimeOffset.UtcNow.AddSeconds(-1), [], CancellationToken.None);

        Assert.True(result.Success);
        Assert.Equal("000123", result.Bom!.SourceItemId);
        Assert.Equal(3, result.Artifacts.Count);
        Assert.All(result.Artifacts, artifact => Assert.False(Path.IsPathRooted(artifact.LogicalReference)));
        Assert.DoesNotContain(root, JsonConvert.SerializeObject(result));
        Assert.True(File.Exists(Path.Combine(root, "runtime", "engineering-jobs", "job-1", "teamcenter", "normalized-bom.json")));
    }

    [Fact]
    public async Task RejectsMissingOutput()
    {
        var result = await CreateService().CaptureAsync("job-1", "000123", null,
            DateTimeOffset.UtcNow, [], CancellationToken.None);
        Assert.False(result.Success);
        Assert.Equal("teamcenter-output-missing", result.FailureCode);
    }

    [Fact]
    public async Task RejectsMalformedOutput()
    {
        var path = Path.Combine(root, "malformed.json");
        Directory.CreateDirectory(root);
        await File.WriteAllTextAsync(path, "{not-json");
        var result = await CreateService().CaptureAsync("job-1", "000123", path,
            DateTimeOffset.UtcNow.AddSeconds(-1), [], CancellationToken.None);
        Assert.Equal("teamcenter-output-malformed", result.FailureCode);
    }

    [Fact]
    public async Task RejectsStaleOutput()
    {
        var path = WriteBom("000123");
        File.SetLastWriteTimeUtc(path, DateTime.UtcNow.AddMinutes(-5));
        var result = await CreateService().CaptureAsync("job-1", "000123", path,
            DateTimeOffset.UtcNow, [], CancellationToken.None);
        Assert.Equal("teamcenter-output-stale", result.FailureCode);
    }

    [Fact]
    public async Task RejectsItemIdentityMismatch()
    {
        var path = WriteBom("OTHER");
        var result = await CreateService().CaptureAsync("job-1", "000123", path,
            DateTimeOffset.UtcNow.AddSeconds(-1), [], CancellationToken.None);
        Assert.Equal("teamcenter-output-identity-mismatch", result.FailureCode);
    }

    [Fact]
    public void RetentionCleanupDeletesOnlyExpiredJobDirectories()
    {
        var oldDirectory = Path.Combine(root, "runtime", "engineering-jobs", "old-job");
        var currentDirectory = Path.Combine(root, "runtime", "engineering-jobs", "current-job");
        Directory.CreateDirectory(oldDirectory);
        Directory.CreateDirectory(currentDirectory);
        Directory.SetLastWriteTimeUtc(oldDirectory, DateTime.UtcNow.AddHours(-10));
        Directory.SetLastWriteTimeUtc(currentDirectory, DateTime.UtcNow);

        var removed = CreateService(retentionHours: 2).CleanupExpired(DateTimeOffset.UtcNow);

        Assert.Equal(1, removed);
        Assert.False(Directory.Exists(oldDirectory));
        Assert.True(Directory.Exists(currentDirectory));
    }

    private TeamcenterArtifactCaptureService CreateService(int retentionHours = 24) =>
        new(new TestEnvironment(root), Options.Create(new TeamcenterArtifactCaptureOptions
        {
            RuntimeRoot = "runtime/engineering-jobs",
            RetentionHours = retentionHours,
            StaleToleranceSeconds = 0
        }), NullLogger<TeamcenterArtifactCaptureService>.Instance);

    private string WriteBom(string itemId)
    {
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, $"{Guid.NewGuid():N}.json");
        var bom = new BomRoot
        {
            SourceItemId = itemId,
            SourceRevId = "A",
            ExtractedAt = DateTimeOffset.UtcNow.ToString("O"),
            BomRootNode = new BomNode
            {
                ItemId = itemId, RevId = "A", Name = "Root", Qty = "1",
                Sequence = "10", VariantCondition = "", VariantState = ""
            }
        };
        File.WriteAllText(path, JsonConvert.SerializeObject(bom));
        return path;
    }

    public void Dispose()
    {
        if (Directory.Exists(root)) Directory.Delete(root, true);
    }

    private sealed class TestEnvironment(string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Tests";
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = contentRoot;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
