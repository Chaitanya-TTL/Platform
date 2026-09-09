using System.Diagnostics;
using System.Text;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Orchestration.API.Models;
namespace Orchestration.API.Services;

public sealed class SubprocessResult
{
    public bool Success { get; init; }
    public string Output { get; init; } = "";
    public BomRoot? Bom { get; init; }
    public string? BomOutputPath { get; init; }
    public SapBusinessImpactResult? SapImpact { get; init; }
    public string? SapImpactOutputPath { get; init; }
    public SapMaterialHistoryResult? SapHistory { get; init; }
    public string? SapHistoryOutputPath { get; init; }
    public string? OptionalStageWarning { get; init; }
    public int? ProcessExitCode { get; init; }
}
public interface ISubprocessExecutor { Task<SubprocessResult> ExecuteAsync(ExtractionRequest request, Func<string, Task> progressCallback, CancellationToken cancellationToken = default); }
public sealed class SubprocessExecutor : ISubprocessExecutor
{
    private readonly ILogger<SubprocessExecutor> _logger; private readonly ExtractorOptions _options; private readonly IProcessRunner _runner; private readonly SemaphoreSlim _sapGate;
    public SubprocessExecutor(ILogger<SubprocessExecutor> logger, IOptions<ExtractorOptions> options, IProcessRunner runner) { _logger = logger; _options = options.Value; _runner = runner; _sapGate = new SemaphoreSlim(Math.Max(1, _options.MaxConcurrentSapJobs)); }
    public async Task<SubprocessResult> ExecuteAsync(ExtractionRequest request, Func<string, Task> progress, CancellationToken cancellationToken = default)
    {
        try { return request.Kind switch { ExtractionKind.Configit => await ExecuteConfigitAsync(request, progress, cancellationToken), ExtractionKind.Sap => await ExecuteSapAsync(request, progress, cancellationToken), _ => await ExecuteTeamcenterAsync(request, progress, cancellationToken) }; }
        catch (OperationCanceledException) { throw; }
        catch (TimeoutException) { throw; }
        catch (Exception ex) { _logger.LogError(ex, "Subprocess execution error"); await progress($"Error: {ex.Message}"); return new() { Success = false, Output = ex.Message }; }
    }
    private async Task<SubprocessResult> ExecuteSapAsync(ExtractionRequest request, Func<string, Task> progress, CancellationToken cancellationToken)
    {
        await _sapGate.WaitAsync(cancellationToken);
        try
        {
            var dir = _options.ResolveSapPath();
            var jar = Path.Combine(dir, "lib", "sapjco3.jar");
            var dll = Path.Combine(dir, "lib", "sapjco3.dll");
            var config = Path.Combine(dir, "config", "sap.properties");
            var bomSource = Path.Combine(dir, "src", "SapBomExtractor.java");
            var bomClass = Path.Combine(dir, "out", "SapBomExtractor.class");
            var impactSource = Path.Combine(dir, "src", "SapMaterialImpactResilientRunner.java");
            var impactClass = Path.Combine(dir, "out", "SapMaterialImpactResilientRunner.class");
            var historySource = Path.Combine(dir, "src", "SapMaterialHistoryResilientRunner.java");
            var historyClass = Path.Combine(dir, "out", "SapMaterialHistoryResilientRunner.class");
            foreach (var file in new[] { jar, dll, config, bomSource }) if (!File.Exists(file)) throw new FileNotFoundException("Required SAP runtime file was not found.", file);
            if (request.IncludeSapBusinessImpact && !File.Exists(impactSource)) throw new FileNotFoundException("SAP impact resilient runner source was not found.", impactSource);
            if (request.IncludeSapBusinessImpact && !File.Exists(historySource)) throw new FileNotFoundException("SAP history resilient runner source was not found.", historySource);

            var runtime = Path.Combine(dir, "runtime", "jobs", SafeSegment(request.JobId ?? Guid.NewGuid().ToString("N")));
            Directory.CreateDirectory(runtime);
            var output = new StringBuilder();
            var materialQuery = request.GetMaterialQuery()?.Trim() ?? "";
            var plant = string.IsNullOrWhiteSpace(request.Plant) ? "1001" : request.Plant.Trim();
            const string historyStorageLocation = "1D";
            var fallbackEligible = IsValidatedFallbackRequest(materialQuery, plant, historyStorageLocation);
            var sapAvailability = SapAvailability.Unknown;
            string resolvedMaterialId;
            try
            {
                resolvedMaterialId = await ResolveSapMaterialAsync(dir, jar, runtime, materialQuery, plant, progress, output, cancellationToken);
                sapAvailability = SapAvailability.Live;
            }
            catch (Exception ex) when (fallbackEligible && IsSapUnavailableFailure(ex.Message))
            {
                resolvedMaterialId = "31";
                sapAvailability = SapAvailability.Unavailable;
                output.AppendLine($"SAP material resolution unavailable: {ex.Message}");
                output.AppendLine("SAP_MATERIAL_RESOLVED_USING_VALIDATED_FALLBACK: Stearing -> Material 31.");
                await progress("SAP is unavailable. Using validated fallback mapping for Stearing.");
            }
            request.MaterialId = resolvedMaterialId;

            var bomPath = Path.Combine(runtime, "sap_bom_extraction.json");
            if (File.Exists(bomPath)) File.Delete(bomPath);
            BomRoot? bom = null;
            string? bomFailure = null;
            if (sapAvailability == SapAvailability.Unavailable)
            {
                bomFailure = $"SAP_BOM_UNAVAILABLE: SAP BOM extraction was unavailable for material {resolvedMaterialId}.";
                await progress("SAP live runtime is unavailable. Skipping repeated BOM connection attempt.");
            }
            else
            {
                await CompileIfNeeded(bomSource, bomClass, jar, dir, progress, output, cancellationToken);
                var bomRun = JavaInfo(dir, jar, "SapBomExtractor", resolvedMaterialId, plant, string.IsNullOrWhiteSpace(request.BomUsage) ? "3" : request.BomUsage, string.IsNullOrWhiteSpace(request.Alternative) ? "1" : request.Alternative, bomPath);
                await progress($"Extracting SAP BOM for {resolvedMaterialId}...");
                var bomExecuted = await _runner.RunAsync(bomRun, SapOuterTimeout(), progress, cancellationToken);
                output.Append(bomExecuted.output);
                if (IsSapUnavailableFailure(bomExecuted.output)) sapAvailability = SapAvailability.Unavailable;
                if (bomExecuted.exitCode == 0 && File.Exists(bomPath))
                {
                    try
                    {
                        bom = JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(bomPath, cancellationToken));
                        if (bom?.BomRootNode == null) { bom = null; bomFailure = "SAP extractor produced invalid BOM JSON."; }
                    }
                    catch (Exception ex) { bomFailure = $"SAP BOM JSON could not be parsed: {ex.Message}"; }
                }
                else bomFailure = $"SAP_BOM_UNAVAILABLE: SAP BOM extraction was unavailable for material {resolvedMaterialId}.";
            }

            if (!request.IncludeSapBusinessImpact)
            {
                if (bom == null) return new() { Success = false, Output = AppendReason(output, bomFailure) };
                return new() { Success = true, Output = output.ToString(), Bom = bom, BomOutputPath = bomPath };
            }

            await CompileIfNeeded(impactSource, impactClass, jar, dir, progress, output, cancellationToken);
            var materials = bom?.BomRootNode != null
                ? CollectMaterials(bom.BomRootNode).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                : new List<string> { resolvedMaterialId };
            var result = new SapBusinessImpactResult { SourceMaterialId = resolvedMaterialId, Plant = plant, Status = "in_progress", ExtractedAt = DateTime.UtcNow.ToString("O") };
            if (bom == null) result.Warnings.Add($"SAP_BOM_UNAVAILABLE: SAP BOM extraction was unavailable for material {resolvedMaterialId}. Business impact was extracted for the requested material only.");
            if (sapAvailability == SapAvailability.Unavailable) result.Warnings.Add("SAP_DATA_NOT_LIVE: SAP live runtime was unavailable; validated snapshot evidence was requested.");
            if (output.ToString().Contains("SAP_MATERIAL_RESOLVED_USING_VALIDATED_FALLBACK", StringComparison.Ordinal)) result.Warnings.Add("SAP_MATERIAL_RESOLVED_USING_VALIDATED_FALLBACK: Stearing was resolved to Material 31 using the approved offline mapping.");

            var impactDir = Path.Combine(runtime, "impact-items");
            Directory.CreateDirectory(impactDir);
            foreach (var (material, index) in materials.Select((value, index) => (value, index)))
            {
                await progress($"Retrieving SAP stock, inventory and cost for {material} ({index + 1}/{materials.Count})...");
                var itemPath = Path.Combine(impactDir, $"{SafeSegment(material)}.json");
                if (File.Exists(itemPath)) File.Delete(itemPath);
                var impactRun = JavaInfo(dir, jar, "SapMaterialImpactResilientRunner", material, plant, itemPath);
                if (sapAvailability == SapAvailability.Unavailable) impactRun.Environment["SAP_LIVE_UNAVAILABLE"] = "1";
                var impactExecuted = await _runner.RunAsync(impactRun, SapOuterTimeout(), progress, cancellationToken);
                output.Append(impactExecuted.output);
                if (impactExecuted.exitCode != 0 || !File.Exists(itemPath)) { result.Warnings.Add($"Impact extraction failed for {material}."); continue; }
                try
                {
                    var itemJson = await File.ReadAllTextAsync(itemPath, cancellationToken);
                    ValidateImpactOutput(itemJson, plant);
                    var item = JsonConvert.DeserializeObject<SapMaterialImpact>(itemJson);
                    if (item == null) throw new InvalidDataException("Impact JSON deserialized to null.");
                    result.Materials.Add(item);
                    if (IsFallbackJson(itemJson)) result.Warnings.Add("SAP_CURRENT_IMPACT_FALLBACK_USED: Validated SAP current-impact snapshot was used.");
                }
                catch (Exception ex) { result.Warnings.Add($"Could not accept impact for {material}: {ex.Message}"); }
            }
            result.Status = result.Materials.Count == materials.Count && result.Materials.All(x => string.Equals(x.Status, "complete", StringComparison.OrdinalIgnoreCase)) ? "complete" : result.Materials.Count > 0 ? "partial_success" : "failed";
            result.ExtractedAt = DateTime.UtcNow.ToString("O");
            var impactPath = Path.Combine(runtime, "sap_material_impact.json");
            await File.WriteAllTextAsync(impactPath, JsonConvert.SerializeObject(result, Formatting.Indented), cancellationToken);

            await CompileIfNeeded(historySource, historyClass, jar, dir, progress, output, cancellationToken);
            await progress($"Retrieving SAP material movements and financial trace for {resolvedMaterialId}...");
            var historyPath = Path.Combine(runtime, "sap_material_history.json");
            if (File.Exists(historyPath)) File.Delete(historyPath);
            var historyRun = JavaInfo(dir, jar, "SapMaterialHistoryResilientRunner", resolvedMaterialId, plant, historyStorageLocation, historyPath);
            if (sapAvailability == SapAvailability.Unavailable) historyRun.Environment["SAP_LIVE_UNAVAILABLE"] = "1";
            var historyExecuted = await _runner.RunAsync(historyRun, SapOuterTimeout(), progress, cancellationToken);
            output.Append(historyExecuted.output);
            SapMaterialHistoryResult? history = null;
            if (historyExecuted.exitCode == 0 && File.Exists(historyPath))
            {
                try
                {
                    var historyJson = await File.ReadAllTextAsync(historyPath, cancellationToken);
                    ValidateHistoryOutput(historyJson, plant, historyStorageLocation);
                    history = JsonConvert.DeserializeObject<SapMaterialHistoryResult>(historyJson);
                    if (history == null) throw new InvalidDataException("History JSON deserialized to null.");
                    if (IsFallbackJson(historyJson)) result.Warnings.Add("SAP_HISTORY_FALLBACK_USED: Validated SAP material-history snapshot was used.");
                }
                catch (Exception ex) { result.Warnings.Add($"SAP history could not be accepted: {ex.Message}"); }
            }
            else result.Warnings.Add("SAP movement history was unavailable. Current stock and valuation remain usable.");

            var success = bom != null || result.Materials.Count > 0 || history?.Events.Count > 0 || history?.Movements.Count > 0;
            return new()
            {
                Success = success,
                Output = AppendReason(output, bomFailure),
                Bom = bom,
                BomOutputPath = bom == null ? null : bomPath,
                SapImpact = result,
                SapImpactOutputPath = impactPath,
                SapHistory = history,
                SapHistoryOutputPath = history == null ? null : historyPath
            };
        }
        finally { _sapGate.Release(); }
    }

    private async Task<string> ResolveSapMaterialAsync(string dir, string jar, string runtime, string query, string? plant, Func<string, Task> progress, StringBuilder output, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query)) throw new InvalidOperationException("An SAP material description or material number is required.");
        var source = Path.Combine(dir, "src", "SapMaterialCatalogExtractor.java");
        var cls = Path.Combine(dir, "out", "SapMaterialCatalogExtractor.class");
        if (!File.Exists(source)) throw new FileNotFoundException("SAP material catalogue extractor source was not found.", source);
        await CompileIfNeeded(source, cls, jar, dir, progress, output, cancellationToken);
        var catalogDir = Path.Combine(runtime, "material-resolution"); Directory.CreateDirectory(catalogDir);
        var jsonPath = Path.Combine(catalogDir, "sap_material_catalog.json"); if (File.Exists(jsonPath)) File.Delete(jsonPath);
        await progress($"Resolving SAP material for {query}...");
        var run = JavaInfo(dir, jar, "SapMaterialCatalogExtractor", query, "20", catalogDir, string.IsNullOrWhiteSpace(plant) ? "1001" : plant);
        var executed = await _runner.RunAsync(run, TimeSpan.FromSeconds(Math.Max(30, _options.SapTimeoutSeconds)), progress, cancellationToken); output.Append(executed.output);
        if (executed.exitCode != 0 || !File.Exists(jsonPath)) throw new InvalidOperationException($"SAP material resolution failed for '{query}'.");
        var root = JObject.Parse(await File.ReadAllTextAsync(jsonPath, cancellationToken));
        var materials = (root["materials"] as JArray)?.OfType<JObject>().ToList() ?? new List<JObject>();
        if (materials.Count == 0) throw new InvalidOperationException($"No SAP material matched '{query}'.");
        static string Read(JObject item, string name) => item[name]?.ToString().Trim() ?? "";
        var exact = materials.Where(item => string.Equals(Read(item, "materialId"), query, StringComparison.OrdinalIgnoreCase) || string.Equals(Read(item, "internalMaterialId"), query, StringComparison.OrdinalIgnoreCase) || string.Equals(Read(item, "description"), query, StringComparison.OrdinalIgnoreCase)).ToList();
        var selected = exact.Count == 1 ? exact[0] : exact.Count == 0 && materials.Count == 1 ? materials[0] : null;
        if (selected == null)
        {
            var choices = string.Join(", ", materials.Take(5).Select(item => $"{Read(item, "materialId")} ({Read(item, "description")})"));
            throw new InvalidOperationException($"SAP material query '{query}' is ambiguous. Refine the name or enter a material number. Matches: {choices}");
        }
        var resolved = Read(selected, "materialId");
        if (string.IsNullOrWhiteSpace(resolved)) throw new InvalidOperationException("SAP material resolution returned a candidate without a material number.");
        await progress($"Resolved SAP material '{query}' to {resolved}.");
        return resolved;
    }


    private enum SapAvailability { Unknown, Live, Unavailable }
    private TimeSpan SapOuterTimeout() => TimeSpan.FromSeconds(Math.Max(60, _options.SapTimeoutSeconds));
    private static bool IsValidatedFallbackRequest(string query, string plant, string storageLocation)
    {
        var materialMatch = string.Equals(query, "Stearing", StringComparison.OrdinalIgnoreCase) || query == "31" || query == "000000000000000031";
        return materialMatch && plant == "1001" && string.Equals(storageLocation, "1D", StringComparison.OrdinalIgnoreCase);
    }
    private static bool IsSapUnavailableFailure(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var text = value.ToLowerInvariant();
        return text.Contains("jco_error_communication") || text.Contains("connection refused") || text.Contains("partner not reached") || text.Contains("connect timed out") || text.Contains("connection timed out") || text.Contains("sap material resolution failed") || text.Contains("sap runtime unavailable");
    }
    private static bool IsFallbackJson(string json) => json.Contains("\"dataSource\"", StringComparison.OrdinalIgnoreCase) && json.Contains("fallback-snapshot", StringComparison.OrdinalIgnoreCase);
    private static void ValidateImpactOutput(string json, string plant)
    {
        if (string.IsNullOrWhiteSpace(json)) throw new InvalidDataException("SAP impact output was empty.");
        var root = JObject.Parse(json);
        if (!IsFallbackJson(json)) return;
        if (root["fallback"]?["active"]?.Value<bool>() != true) throw new InvalidDataException("Fallback impact output was not marked active.");
        var id = root["materialId"]?.ToString() ?? root["internalMaterialId"]?.ToString();
        if (id is not ("31" or "000000000000000031")) throw new InvalidDataException("Fallback impact material did not match Material 31.");
        if (root["organization"]?["plant"]?.ToString() != plant) throw new InvalidDataException("Fallback impact plant did not match the request.");
        if (string.IsNullOrWhiteSpace(root["fallback"]?["snapshotCapturedAt"]?.ToString())) throw new InvalidDataException("Fallback impact snapshot timestamp was missing.");
    }
    private static void ValidateHistoryOutput(string json, string plant, string storageLocation)
    {
        if (string.IsNullOrWhiteSpace(json)) throw new InvalidDataException("SAP history output was empty.");
        var root = JObject.Parse(json);
        if (!IsFallbackJson(json)) return;
        if (root["fallback"]?["active"]?.Value<bool>() != true) throw new InvalidDataException("Fallback history output was not marked active.");
        var id = root["material"]?["materialId"]?.ToString() ?? root["materialId"]?.ToString();
        if (id is not ("31" or "000000000000000031")) throw new InvalidDataException("Fallback history material did not match Material 31.");
        if (root["material"]?["plant"]?.ToString() != plant) throw new InvalidDataException("Fallback history plant did not match the request.");
        if (!string.Equals(root["material"]?["storageLocation"]?.ToString(), storageLocation, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Fallback history storage location did not match the request.");
        if (string.IsNullOrWhiteSpace(root["fallback"]?["snapshotCapturedAt"]?.ToString())) throw new InvalidDataException("Fallback history snapshot timestamp was missing.");
    }
    private static string AppendReason(StringBuilder output, string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason)) return output.ToString();
        if (output.Length > 0 && !char.IsWhiteSpace(output[output.Length - 1])) output.AppendLine();
        output.AppendLine(reason); return output.ToString();
    }
    private async Task CompileIfNeeded(string source, string cls, string jar, string dir, Func<string, Task> progress, StringBuilder output, CancellationToken cancellationToken)
    {
        if (!_options.CompileJavaAtRuntime || (File.Exists(cls) && File.GetLastWriteTimeUtc(source) <= File.GetLastWriteTimeUtc(cls))) return;
        await progress($"Compiling {Path.GetFileName(source)}..."); var info = BaseInfo(_options.JavacExecutable, dir); info.ArgumentList.Add("-cp"); info.ArgumentList.Add(jar); info.ArgumentList.Add("-d"); info.ArgumentList.Add(Path.Combine(dir, "out")); info.ArgumentList.Add(source);
        var compiled = await _runner.RunAsync(info, TimeSpan.FromSeconds(90), progress, cancellationToken); output.Append(compiled.output); if (compiled.exitCode != 0) throw new Exception($"Compilation failed for {Path.GetFileName(source)}.");
    }
    private static IEnumerable<string> CollectMaterials(BomNode root) { yield return root.ItemId; foreach (var child in root.Children ?? new()) foreach (var id in CollectMaterials(child)) yield return id; }
    private static ProcessStartInfo JavaInfo(string dir, string jar, string className, params string[] args) { var info = BaseInfo("java", dir); info.ArgumentList.Add($"-Djava.library.path={Path.Combine(dir, "lib")}"); info.ArgumentList.Add("-cp"); info.ArgumentList.Add($"{Path.Combine(dir, "out")};{jar}"); info.ArgumentList.Add(className); foreach (var arg in args) info.ArgumentList.Add(arg); return info; }
    private async Task<SubprocessResult> ExecuteConfigitAsync(ExtractionRequest request, Func<string, Task> progress, CancellationToken cancellationToken) { var script = _options.ResolveConfigitPath(); var dir = Path.GetDirectoryName(script)!; var outputFile = Path.Combine(dir, "configit_extraction.json"); if (File.Exists(outputFile)) File.Delete(outputFile); var info = BaseInfo("python", dir); info.ArgumentList.Add(script); info.Environment["PYTHONIOENCODING"] = "utf-8"; info.Environment["CONFIGIT_WORK_ITEM_ID"] = request.WorkItemId ?? ""; info.Environment["CONFIGIT_PRODUCT_MODEL"] = request.ProductModelCode ?? ""; var run = await _runner.RunAsync(info, TimeSpan.FromSeconds(Math.Max(30, _options.GeneralTimeoutSeconds)), progress, cancellationToken); if (run.exitCode != 0 || !File.Exists(outputFile)) return new() { Success = false, Output = run.output }; var bom = JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(outputFile)); return new() { Success = bom != null, Output = run.output, Bom = bom, BomOutputPath = outputFile }; }
    private async Task<SubprocessResult> ExecuteTeamcenterAsync(ExtractionRequest request, Func<string, Task> progress, CancellationToken cancellationToken)
    {
        var runner = request.PipelinePath ?? _options.ResolveTeamcenterPath();
        var dir = Path.GetDirectoryName(runner)!;
        if (!File.Exists(runner)) throw new FileNotFoundException("Teamcenter runner was not found.", runner);
        var outputPath = Path.Combine(dir, "HelloTeamcenter", "tc_extraction.json");
        var diagnosticPath = outputPath + ".search.json";
        foreach (var stale in new[] { outputPath, diagnosticPath }) if (File.Exists(stale)) File.Delete(stale);
        var query = request.GetTeamcenterQuery()?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(query)) throw new InvalidOperationException("A Teamcenter product name or Item ID is required.");
        var info = BaseInfo("cmd.exe", dir); info.ArgumentList.Add("/c"); info.ArgumentList.Add("call"); info.ArgumentList.Add(runner); info.ArgumentList.Add(query);
        await progress($"Resolving and extracting Teamcenter structure for {query}...");
        var run = await _runner.RunAsync(info, TimeSpan.FromSeconds(Math.Max(30, _options.GeneralTimeoutSeconds)), progress, cancellationToken);
        if (run.exitCode != 0 || !File.Exists(outputPath)) return new() { Success = false, Output = run.output, ProcessExitCode = run.exitCode };
        try
        {
            var bom = JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(outputPath, cancellationToken));
            if (bom?.BomRootNode == null) return new() { Success = false, Output = run.output + Environment.NewLine + "Teamcenter produced invalid extraction JSON.", ProcessExitCode = run.exitCode };
            return new() { Success = true, Output = run.output, Bom = bom, BomOutputPath = outputPath, ProcessExitCode = run.exitCode };
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Could not parse Teamcenter output {Path}", outputPath); return new() { Success = false, Output = run.output + Environment.NewLine + ex.Message, ProcessExitCode = run.exitCode }; }
    }

    private static ProcessStartInfo BaseInfo(string file, string cwd) => new() { FileName = file, WorkingDirectory = cwd, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8 };
    private static string SafeSegment(string value) => string.Concat(value.Select(c => char.IsLetterOrDigit(c) || c is '-' or '_' ? c : '_'));
}
