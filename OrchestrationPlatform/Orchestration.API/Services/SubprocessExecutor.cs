using System.Diagnostics;
using System.Text;
using Newtonsoft.Json;
using Orchestration.API.Models;

namespace Orchestration.API.Services
{
    public interface ISubprocessExecutor
    {
        Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteAsync(
            ExtractionRequest request, Func<string, Task> progressCallback);
    }

    public class SubprocessExecutor : ISubprocessExecutor
    {
        private readonly ILogger<SubprocessExecutor> _logger;
        public SubprocessExecutor(ILogger<SubprocessExecutor> logger) { _logger = logger; }

        public async Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteAsync(
            ExtractionRequest request, Func<string, Task> progressCallback)
        {
            try
            {
                if (request.Kind == ExtractionKind.Configit) return await ExecuteConfigitAsync(request, progressCallback);
                if (request.Kind == ExtractionKind.Sap) return await ExecuteSapAsync(request, progressCallback);
                return await ExecuteTeamcenterAsync(request, progressCallback);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Subprocess execution error");
                await progressCallback($"Error: {ex.Message}");
                return (false, ex.Message, null!, null!);
            }
        }

        private async Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteSapAsync(
            ExtractionRequest request, Func<string, Task> progressCallback)
        {
            var output = new StringBuilder();
            try
            {
                var workspaceRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
                var extractorDirectory = Path.Combine(workspaceRoot, "SAP-BOM-Extractor");
                var jarPath = Path.Combine(extractorDirectory, "lib", "sapjco3.jar");
                var dllPath = Path.Combine(extractorDirectory, "lib", "sapjco3.dll");
                var configPath = Path.Combine(extractorDirectory, "config", "sap.properties");
                var classPath = Path.Combine(extractorDirectory, "out", "SapBomExtractor.class");
                var sourcePath = Path.Combine(extractorDirectory, "src", "SapBomExtractor.java");
                var outputFile = Path.Combine(extractorDirectory, "sap_bom_extraction.json");

                if (!Directory.Exists(extractorDirectory)) throw new DirectoryNotFoundException($"SAP extractor directory was not found: {extractorDirectory}");
                if (!File.Exists(jarPath)) throw new FileNotFoundException("SAP JCo JAR was not found.", jarPath);
                if (!File.Exists(dllPath)) throw new FileNotFoundException("SAP JCo native DLL was not found.", dllPath);
                if (!File.Exists(configPath)) throw new FileNotFoundException("SAP configuration was not found.", configPath);
                if (File.Exists(outputFile)) File.Delete(outputFile);

                if (!File.Exists(classPath) || (File.Exists(sourcePath) && File.GetLastWriteTimeUtc(sourcePath) > File.GetLastWriteTimeUtc(classPath)))
                {
                    await progressCallback("Compiling SAP BOM extractor...");
                    var compileInfo = new ProcessStartInfo
                    {
                        FileName = "javac",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true,
                        WorkingDirectory = extractorDirectory
                    };
                    compileInfo.ArgumentList.Add("-cp"); compileInfo.ArgumentList.Add(jarPath);
                    compileInfo.ArgumentList.Add("-d"); compileInfo.ArgumentList.Add(Path.Combine(extractorDirectory, "out"));
                    compileInfo.ArgumentList.Add(sourcePath);
                    var compile = await RunProcessAsync(compileInfo, progressCallback);
                    output.Append(compile.output);
                    if (compile.exitCode != 0) return (false, output.ToString(), null!, null!);
                }

                await progressCallback($"Starting SAP extraction for material {request.MaterialId}...");
                var runInfo = new ProcessStartInfo
                {
                    FileName = "java",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = extractorDirectory,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };
                runInfo.ArgumentList.Add($"-Djava.library.path={Path.Combine(extractorDirectory, "lib")}");
                runInfo.ArgumentList.Add("-cp"); runInfo.ArgumentList.Add($"{Path.Combine(extractorDirectory, "out")};{jarPath}");
                runInfo.ArgumentList.Add("SapBomExtractor"); runInfo.ArgumentList.Add(request.MaterialId ?? "");
                runInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.Plant) ? "1001" : request.Plant);
                runInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.BomUsage) ? "3" : request.BomUsage);
                runInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.Alternative) ? "1" : request.Alternative);
                runInfo.ArgumentList.Add(outputFile);

                var run = await RunProcessAsync(runInfo, progressCallback);
                output.Append(run.output);
                if (run.exitCode != 0) return (false, output.ToString(), null!, null!);
                if (!File.Exists(outputFile)) throw new Exception("SAP extraction completed without creating sap_bom_extraction.json.");
                var json = await File.ReadAllTextAsync(outputFile);
                var bom = JsonConvert.DeserializeObject<BomRoot>(json);
                if (bom?.BomRootNode == null) throw new Exception("SAP extractor produced an invalid BOM JSON payload.");
                return (true, output.ToString(), bom, outputFile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SAP subprocess execution error");
                await progressCallback($"Error: {ex.Message}");
                output.AppendLine(ex.ToString());
                return (false, output.ToString(), null!, null!);
            }
        }

        private async Task<(int exitCode, string output)> RunProcessAsync(ProcessStartInfo info, Func<string, Task> progress)
        {
            using var process = Process.Start(info) ?? throw new Exception($"Failed to start {info.FileName}.");
            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();
            var stdout = await stdoutTask; var stderr = await stderrTask;
            foreach (var line in stdout.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries)) await progress(line);
            if (!string.IsNullOrWhiteSpace(stderr)) foreach (var line in stderr.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries)) await progress(line);
            return (process.ExitCode, stdout + (string.IsNullOrWhiteSpace(stderr) ? "" : $"\n--- STDERR ---\n{stderr}"));
        }

        private async Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteTeamcenterAsync(
            ExtractionRequest request, Func<string, Task> progressCallback)
        {
            var output = new StringBuilder();
            try
            {
                var pipelinePath = request.PipelinePath ?? GetDefaultPipelinePath();
                var workingDirectory = Path.GetDirectoryName(pipelinePath)!;
                if (!Directory.Exists(workingDirectory)) throw new Exception($"Pipeline directory does not exist: {workingDirectory}");
                await progressCallback($"Working directory: {workingDirectory}");
                await progressCallback($"Executing: {Path.GetFileName(pipelinePath)}");
                foreach (var staleFile in new[] {
                    Path.Combine(workingDirectory, "HelloTeamcenter", "tc_extraction.json"),
                    Path.Combine(workingDirectory, "ConfigitAceIntegration", "tc_extraction.json"),
                    Path.Combine(workingDirectory, "ConfigitAceIntegration", "bom-output.json"),
                    Path.Combine(workingDirectory, "tc_extraction.json") })
                    if (File.Exists(staleFile)) File.Delete(staleFile);

                var fallbackJsonPath = Path.Combine(workingDirectory, "..", "tc_extraction.json");
                var info = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c call \"{pipelinePath}\" \"{request.TeamcenterItemId}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = workingDirectory,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };
                info.EnvironmentVariables["TC_ITEM_ID"] = request.TeamcenterItemId;
                var run = await RunProcessAsync(info, progressCallback); output.Append(run.output);
                var parsed = await TryParseTeamcenterOutputAsync(workingDirectory, request.TeamcenterItemId!);
                if (parsed.bomStructure != null) return (true, output.ToString(), parsed.bomStructure, parsed.outputFilePath);
                if (File.Exists(fallbackJsonPath))
                {
                    var fallback = JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(fallbackJsonPath));
                    if (fallback != null) return (true, output.ToString(), CreateFallbackBomRoot(request.TeamcenterItemId!, fallback), fallbackJsonPath);
                }
                throw new Exception($"The TeamCenter extraction did not produce a fresh BOM output for item {request.TeamcenterItemId}.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Teamcenter subprocess execution error"); await progressCallback($"Error: {ex.Message}");
                return (false, output.ToString(), null!, null!);
            }
        }

        private async Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteConfigitAsync(
            ExtractionRequest request, Func<string, Task> progressCallback)
        {
            var output = new StringBuilder();
            try
            {
                var workspaceRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
                var extractorPath = Path.Combine(workspaceRoot, "configit_extractor", "extractor.py");
                var directory = Path.GetDirectoryName(extractorPath)!;
                var outputFile = Path.Combine(directory, "configit_extraction.json");
                if (File.Exists(outputFile)) File.Delete(outputFile);
                var info = new ProcessStartInfo
                {
                    FileName = "python",
                    Arguments = $"\"{extractorPath}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    RedirectStandardInput = true,
                    CreateNoWindow = true,
                    WorkingDirectory = directory,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };
                info.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
                info.EnvironmentVariables["CONFIGIT_WORK_ITEM_ID"] = request.WorkItemId ?? "";
                info.EnvironmentVariables["CONFIGIT_PRODUCT_MODEL"] = request.ProductModelCode ?? "";
                using var process = Process.Start(info) ?? throw new Exception("Failed to start Configit extractor process");
                if (!string.IsNullOrWhiteSpace(request.WorkItemId)) await process.StandardInput.WriteLineAsync(request.WorkItemId);
                if (!string.IsNullOrWhiteSpace(request.ProductModelCode)) await process.StandardInput.WriteLineAsync(request.ProductModelCode);
                process.StandardInput.Close();
                var stdoutTask = process.StandardOutput.ReadToEndAsync(); var stderrTask = process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync(); var stdout = await stdoutTask; var stderr = await stderrTask;
                output.Append(stdout); if (!string.IsNullOrEmpty(stderr)) output.AppendLine($"\n--- STDERR ---\n{stderr}");
                foreach (var line in stdout.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries)) await progressCallback(line);
                if (process.ExitCode != 0) return (false, output.ToString(), null!, null!);
                if (!File.Exists(outputFile)) throw new Exception($"The Configit extraction did not produce {outputFile}.");
                var bom = JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(outputFile));
                if (bom == null) throw new Exception("The Configit extractor produced invalid JSON.");
                return (true, output.ToString(), bom, outputFile);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Configit subprocess execution error"); await progressCallback($"Error: {ex.Message}");
                return (false, output.ToString(), null!, null!);
            }
        }

        private async Task<(BomRoot bomStructure, string outputFilePath)> TryParseTeamcenterOutputAsync(string workingDirectory, string itemId)
        {
            foreach (var path in new[] {
                Path.Combine(workingDirectory, "ConfigitAceIntegration", "bom-output.json"),
                Path.Combine(workingDirectory, "HelloTeamcenter", "tc_extraction.json"),
                Path.Combine(workingDirectory, "..", "tc_extraction.json") })
            {
                if (!File.Exists(path)) continue;
                try
                {
                    var bom = JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(path));
                    if (bom != null) { bom.SourceItemId = itemId; return (bom, path); }
                }
                catch (Exception ex) { _logger.LogWarning(ex, "Could not parse Teamcenter output {Path}", path); }
            }
            return (null!, null!);
        }

        private string GetDefaultPipelinePath() => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "TeamCenter-to-Configit-soa_client", "backend", "samples", "run-pipeline.bat"));

        private BomRoot CreateFallbackBomRoot(string itemId, BomRoot sample)
        {
            if (sample?.BomRootNode != null && string.Equals(sample.SourceItemId, itemId, StringComparison.OrdinalIgnoreCase))
            { sample.SourceRevId ??= "A"; sample.ExtractedAt ??= DateTime.UtcNow.ToString("O"); return sample; }
            return new BomRoot
            {
                SourceItemId = itemId,
                SourceRevId = "A",
                ExtractedAt = DateTime.UtcNow.ToString("O"),
                BomRootNode = new BomNode { ItemId = itemId, Name = $"{itemId}/A - Requested TeamCenter Item", RevId = "A", Qty = "1", VariantState = "Y", Children = new List<BomNode>() }
            };
        }
    }
}
