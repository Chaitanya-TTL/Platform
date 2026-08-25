using Microsoft.Extensions.Hosting;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;

namespace Orchestration.API.Engineering.Adapters.Teamcenter;

public sealed class TeamcenterArtifactCaptureOptions
{
    public string RuntimeRoot { get; set; } = "runtime/engineering-jobs";
    public int RetentionHours { get; set; } = 24;
    public int StaleToleranceSeconds { get; set; } = 2;
}

public sealed record TeamcenterArtifactCaptureResult(
    bool Success,
    string? FailureCode,
    BomRoot? Bom,
    IReadOnlyList<SourceArtifactReference> Artifacts,
    TeamcenterArtifactManifest? Manifest);

public interface ITeamcenterArtifactCaptureService
{
    Task<TeamcenterArtifactCaptureResult> CaptureAsync(
        string jobId,
        string requestedItemId,
        string? legacyOutputPath,
        DateTimeOffset executionStartedAt,
        IReadOnlyList<TeamcenterStageEvidence> stages,
        CancellationToken token);
    int CleanupExpired(DateTimeOffset now);
}

public sealed class TeamcenterArtifactCaptureService : ITeamcenterArtifactCaptureService
{
    private readonly string runtimeRoot;
    private readonly TeamcenterArtifactCaptureOptions options;
    private readonly ILogger<TeamcenterArtifactCaptureService> logger;

    public TeamcenterArtifactCaptureService(
        IHostEnvironment environment,
        IOptions<TeamcenterArtifactCaptureOptions> options,
        ILogger<TeamcenterArtifactCaptureService> logger)
    {
        this.options = options.Value;
        runtimeRoot = Path.GetFullPath(Path.Combine(environment.ContentRootPath, this.options.RuntimeRoot));
        this.logger = logger;
    }

    public async Task<TeamcenterArtifactCaptureResult> CaptureAsync(
        string jobId,
        string requestedItemId,
        string? legacyOutputPath,
        DateTimeOffset executionStartedAt,
        IReadOnlyList<TeamcenterStageEvidence> stages,
        CancellationToken token)
    {
        CleanupExpired(DateTimeOffset.UtcNow);
        if (string.IsNullOrWhiteSpace(legacyOutputPath) || !File.Exists(legacyOutputPath))
            return Failure("teamcenter-output-missing");

        var source = new FileInfo(legacyOutputPath);
        var earliestOwnedWrite = executionStartedAt.UtcDateTime.AddSeconds(-Math.Max(0, options.StaleToleranceSeconds));
        if (source.LastWriteTimeUtc < earliestOwnedWrite)
            return Failure("teamcenter-output-stale");

        byte[] bytes;
        try
        {
            bytes = await File.ReadAllBytesAsync(source.FullName, token);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning("Teamcenter artifact capture could not read the legacy output for JobId={JobId}", jobId);
            return Failure("teamcenter-output-missing");
        }

        BomRoot? bom;
        try
        {
            bom = JsonConvert.DeserializeObject<BomRoot>(System.Text.Encoding.UTF8.GetString(bytes));
        }
        catch (Newtonsoft.Json.JsonException)
        {
            return Failure("teamcenter-output-malformed");
        }

        if (bom?.BomRootNode is null)
            return Failure("teamcenter-output-malformed");
        if (!string.Equals(bom.SourceItemId, requestedItemId, StringComparison.Ordinal))
            return Failure("teamcenter-output-identity-mismatch");

        var safeJobId = RequireSafeSegment(jobId, nameof(jobId));
        var directory = Path.Combine(runtimeRoot, safeJobId, "teamcenter");
        Directory.CreateDirectory(directory);

        var normalizedPath = Path.Combine(directory, "normalized-bom.json");
        var stagePath = Path.Combine(directory, "stage-evidence.json");
        var manifestPath = Path.Combine(directory, "artifact-manifest.json");
        await File.WriteAllBytesAsync(normalizedPath, bytes, token);

        var capturedAt = DateTimeOffset.UtcNow;
        var optionsJson = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
        await File.WriteAllTextAsync(stagePath, System.Text.Json.JsonSerializer.Serialize(stages, optionsJson), token);
        var artifacts = new List<SourceArtifactReference>
        {
            Artifact(jobId, "normalized-bom", normalizedPath, capturedAt, ArtifactSensitivity.Sensitive),
            Artifact(jobId, "stage-evidence", stagePath, capturedAt, ArtifactSensitivity.Internal),
            new($"artifact-{Guid.NewGuid():N}", EngineeringSource.Teamcenter, "artifact-manifest", capturedAt,
                EvidenceAvailability.Available, null,
                $"engineering-jobs/{jobId}/teamcenter/artifact-manifest.json",
                ArtifactSensitivity.Internal, $"delete-after-{Math.Max(1, options.RetentionHours)}-hours")
        };
        var manifest = new TeamcenterArtifactManifest(
            EngineeringContractVersions.V1, jobId, requestedItemId, executionStartedAt, capturedAt, artifacts, stages);
        await File.WriteAllTextAsync(manifestPath, System.Text.Json.JsonSerializer.Serialize(manifest, optionsJson), token);

        return new(true, null, bom, artifacts, manifest);
    }

    public int CleanupExpired(DateTimeOffset now)
    {
        if (!Directory.Exists(runtimeRoot)) return 0;
        var cutoff = now.UtcDateTime.AddHours(-Math.Max(1, options.RetentionHours));
        var removed = 0;
        foreach (var jobDirectory in Directory.EnumerateDirectories(runtimeRoot))
        {
            try
            {
                if (Directory.GetLastWriteTimeUtc(jobDirectory) >= cutoff) continue;
                Directory.Delete(jobDirectory, true);
                removed++;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                logger.LogWarning("Retention cleanup skipped an inaccessible Teamcenter job directory.");
            }
        }
        return removed;
    }

    private SourceArtifactReference Artifact(
        string jobId,
        string type,
        string path,
        DateTimeOffset createdAt,
        ArtifactSensitivity sensitivity)
    {
        var checksum = File.Exists(path) ? Sha256(path) : null;
        return new(
            $"artifact-{Guid.NewGuid():N}",
            EngineeringSource.Teamcenter,
            type,
            createdAt,
            File.Exists(path) ? EvidenceAvailability.Available : EvidenceAvailability.NotObserved,
            checksum,
            $"engineering-jobs/{jobId}/teamcenter/{Path.GetFileName(path)}",
            sensitivity,
            $"delete-after-{Math.Max(1, options.RetentionHours)}-hours");
    }

    private static string Sha256(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static string RequireSafeSegment(string value, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value) || value.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || value.Contains("..", StringComparison.Ordinal))
            throw new ArgumentException("The identifier is not safe for artifact storage.", parameterName);
        return value;
    }

    private static TeamcenterArtifactCaptureResult Failure(string code) =>
        new(false, code, null, Array.Empty<SourceArtifactReference>(), null);
}
