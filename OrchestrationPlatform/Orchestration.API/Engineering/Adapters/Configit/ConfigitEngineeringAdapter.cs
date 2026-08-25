using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Orchestration.API.Engineering.Adapters;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Models;
using Orchestration.API.Services;

namespace Orchestration.API.Engineering.Adapters.Configit;

public sealed class ConfigitEngineeringAdapter : IEngineeringSourceAdapter
{
    private readonly ExtractorOptions options;
    private readonly IProcessRunner runner;

    public ConfigitEngineeringAdapter(IOptions<ExtractorOptions> options, IProcessRunner runner)
    {
        this.options = options.Value;
        this.runner = runner;
    }

    public EngineeringSource Source => EngineeringSource.Configit;

    public Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        return Task.FromResult(Capability());
    }

    public async Task<SourceDiscoveryOutcome> DiscoverAsync(EngineeringDiscoveryRequest request, QueryNormalizationRecord normalized, CancellationToken token)
    {
        var packagePath = request.Query.ProductName?.Trim();
        var explicitProductId = request.Query.ProductId?.Trim();
        if (string.IsNullOrWhiteSpace(packagePath))
            return Failed("configit-package-path-required", "A Configit package path is required for discovery.", false);

        var script = options.ResolveConfigitPath();
        if (!File.Exists(script))
            return Failed("configit-runtime-unavailable", "The Configit extractor is unavailable.", false);

        var runtime = EngineeringAdapterSupport.CreateRuntimeDirectory(request.RequestId, Source);
        var output = Path.Combine(runtime, "package-resolution.json");
        var info = CreateProcess(script, packagePath, output, explicitProductId, true);

        try
        {
            var run = await runner.RunAsync(info, TimeSpan.FromMilliseconds((long)request.TimeoutPolicy.PerSourceTimeoutMs), _ => Task.CompletedTask, token);
            if (run.exitCode != 0 || !File.Exists(output))
                return Failed("configit-package-resolution-failed", "Configit could not resolve the requested package.", true);

            using var document = JsonDocument.Parse(await File.ReadAllTextAsync(output, token));
            if (!document.RootElement.TryGetProperty("packageResolution", out var package) || !document.RootElement.TryGetProperty("productResolution", out var product))
                return Failed("configit-resolution-output-malformed", "Configit returned malformed package-resolution output.", true);

            var selectedProductId = Text(product, "selectedProductId");
            var selectedProductName = Text(product, "selectedProductName") ?? selectedProductId;
            var logicalPackagePath = Text(package, "logicalPackagePath") ?? packagePath;
            var resolvedPackagePath = Text(package, "resolvedPackagePath");
            var versionId = Text(package, "versionId");
            if (string.IsNullOrWhiteSpace(selectedProductId) || string.IsNullOrWhiteSpace(resolvedPackagePath))
                return Failed("configit-resolution-output-malformed", "Configit did not return a resolved product and package version.", true);

            var now = DateTimeOffset.UtcNow;
            var metadata = new Dictionary<string, string?>
            {
                ["requestedPackagePath"] = Text(package, "requestedPackagePath") ?? packagePath,
                ["logicalPackagePath"] = logicalPackagePath,
                ["packagePath"] = resolvedPackagePath,
                ["resolvedPackagePath"] = resolvedPackagePath,
                ["versionId"] = versionId,
                ["packageState"] = Text(package, "state"),
                ["publishedAt"] = Text(package, "publishedAt"),
                ["visibility"] = Text(package, "visibility"),
                ["withSource"] = Text(package, "withSource"),
                ["selectionMethod"] = Text(product, "selectionMethod"),
                ["configurableProductCount"] = Text(product, "configurableProductCount")
            };
            var candidate = new SourceCandidate(
                $"configit:{logicalPackagePath}:{selectedProductId}", Source, selectedProductId, selectedProductName!,
                "configit-configurable-product", null, versionId, Text(product, "selectedProductDescription"), Text(package, "state"),
                MatchCategory.VerifiedIdentifierMatch, $"Resolved from Configit package '{logicalPackagePath}' at version '{versionId}'.",
                ConfidenceClass.Verified, ["package-resolution", "direct-solve"], metadata,
                new(ProvenanceKind.LiveSource, "configit-package-api", now, resolvedPackagePath), true);
            return new(Source, StandardStatus.Success, Capability(), [candidate], [], [], false);
        }
        catch (OperationCanceledException) { throw; }
        catch (TimeoutException) { return Failed("configit-resolution-timeout", "Configit package resolution timed out.", true); }
        catch (JsonException) { return Failed("configit-resolution-output-malformed", "Configit returned malformed package-resolution output.", true); }
        catch { return Failed("configit-package-resolution-failed", "Configit package resolution failed.", true); }
    }

    public async Task<StandardExtractionResult> ExtractAsync(string jobId, EngineeringExtractionRequest request, IProgress<StandardProgress> progress, CancellationToken token)
    {
        var started = DateTimeOffset.UtcNow;
        var capability = Capability();
        try
        {
            var script = options.ResolveConfigitPath();
            if (!File.Exists(script)) return Failure(jobId, request, started, capability, "configit-runtime-unavailable", "The Configit extractor is unavailable.", false);
            var package = Metadata(request.Candidate, "resolvedPackagePath") ?? Metadata(request.Candidate, "packagePath") ?? request.ConfigurationContext?.PackagePath;
            if (string.IsNullOrWhiteSpace(package)) return Failure(jobId, request, started, capability, "configit-package-context-required", "A resolved Configit package path is required for extraction.", false, StandardStatus.AwaitingContext);
            var output = Path.Combine(EngineeringAdapterSupport.CreateRuntimeDirectory(jobId, Source), "normalized-bom.json");
            var info = CreateProcess(script, package, output, request.Candidate.NativeId, false);
            if (!string.IsNullOrWhiteSpace(request.ConfigurationContext?.ConfigurationDate)) { info.ArgumentList.Add("--date"); info.ArgumentList.Add(request.ConfigurationContext.ConfigurationDate); }
            progress.Report(Progress(jobId, JobState.Extracting, 10, "Starting Configit solve extraction."));
            var run = await runner.RunAsync(info, TimeSpan.FromMilliseconds(request.TimeoutPolicy.TimeoutMs), _ => Task.CompletedTask, token);
            if (run.exitCode != 0 || !File.Exists(output)) return Failure(jobId, request, started, capability, "configit-solve-failed", "Configit did not produce a usable solved structure.", true);
            var bom = EngineeringAdapterSupport.ParseNormalizedBom(output, request.Candidate.NativeId);
            var now = DateTimeOffset.UtcNow;
            var verified = request.Candidate with { ConfidenceClass = ConfidenceClass.Verified, MatchCategory = MatchCategory.VerifiedIdentifierMatch, MatchReason = "The Configit solve operation verified the selected product and package version.", Provenance = new(ProvenanceKind.LiveSource, "configit-solve-api", now, package) };
            var artifact = EngineeringAdapterSupport.Artifact(jobId, Source, "normalized-bom", output);
            return new(EngineeringContractVersions.V1, request.RequestId, request.CorrelationId, jobId, Source, StandardStatus.Success, new(StandardStatus.Success, verified, request.Candidate.NativeId, [], []), capability, bom, [], new Dictionary<string, object?> { ["packagePath"] = package, ["packageContextSource"] = "candidate-resolution", ["providedVariables"] = request.ConfigurationContext?.ProvidedVariables }, [], [], Progress(jobId, JobState.Success, 100, "Configit extraction completed."), [artifact], new(ProvenanceKind.LiveSource, "configit-solve-api", now, package), [new(EngineeringStage.Extraction, EvidenceAvailability.Available, StandardStatus.Success, "Configit solved structure extracted from the resolved package version.")], started, now, (long)(now - started).TotalMilliseconds);
        }
        catch (OperationCanceledException) { throw; }
        catch (TimeoutException) { return Failure(jobId, request, started, capability, "configit-timeout", "Configit extraction timed out.", true, StandardStatus.TimedOut); }
        catch (JsonException) { return Failure(jobId, request, started, capability, "configit-output-malformed", "Configit returned malformed output.", true); }
        catch { return Failure(jobId, request, started, capability, "configit-solve-failed", "Configit extraction failed.", true); }
    }

    private static ProcessStartInfo CreateProcess(string script, string packagePath, string output, string? productId, bool resolveOnly)
    {
        var info = new ProcessStartInfo { FileName = "python", WorkingDirectory = Path.GetDirectoryName(script)!, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        info.ArgumentList.Add(script); info.ArgumentList.Add("--package-path"); info.ArgumentList.Add(packagePath);
        if (!string.IsNullOrWhiteSpace(productId)) { info.ArgumentList.Add("--product-id"); info.ArgumentList.Add(productId); }
        if (resolveOnly) info.ArgumentList.Add("--resolve-only");
        info.ArgumentList.Add("--output"); info.ArgumentList.Add(output);
        return info;
    }

    private static string? Metadata(SourceCandidate candidate, string key) => candidate.SourceMetadata.TryGetValue(key, out var value) ? value : null;
    private static StandardProgress Progress(string id, JobState state, int percent, string message) => new(id, EngineeringSource.Configit, EngineeringStage.Extraction, state, percent, message, DateTimeOffset.UtcNow);
    private static StandardExtractionResult Failure(string id, EngineeringExtractionRequest request, DateTimeOffset started, SourceCapability capability, string code, string message, bool retryable, StandardStatus status = StandardStatus.Failed)
    {
        var now = DateTimeOffset.UtcNow; var error = new StructuredError(code, EngineeringSource.Configit, EngineeringStage.Extraction, message, message, retryable, now);
        var state = status switch { StandardStatus.TimedOut => JobState.TimedOut, StandardStatus.AwaitingContext => JobState.Unavailable, _ => JobState.Failed };
        return new(EngineeringContractVersions.V1, request.RequestId, request.CorrelationId, id, EngineeringSource.Configit, status, new(status, request.Candidate, null, [], [error]), capability, null, [], new Dictionary<string, object?>(), [], [error], Progress(id, state, 100, message), [], new(ProvenanceKind.Unavailable, "configit-solve-api", now), [new(EngineeringStage.Extraction, EvidenceAvailability.Unavailable, status, message)], started, now, (long)(now - started).TotalMilliseconds);
    }
    private SourceDiscoveryOutcome Failed(string code, string message, bool retryable) => new(Source, StandardStatus.Failed, Capability(), [], [], [new(code, Source, EngineeringStage.Discovery, message, message, retryable, DateTimeOffset.UtcNow)], retryable);
    private static string? Text(JsonElement item, string name) => item.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Null ? value.ToString() : null;
    private static SourceCapability Capability() => new(EngineeringSource.Configit, SourceReadiness.Ready, [DiscoveryMode.Name, DiscoveryMode.ProductId], true, true, false, true, false, false, false, false, true, true, true, true, [], ["Package-path discovery requires live Configit connectivity and credentials."]);
}
