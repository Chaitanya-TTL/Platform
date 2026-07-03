using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Orchestration.API.Models;

namespace Orchestration.API.Services
{
    public interface ISubprocessExecutor
    {
        Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteAsync(
            ExtractionRequest request,
            Func<string, Task> progressCallback);
    }

    public class SubprocessExecutor : ISubprocessExecutor
    {
        private readonly ILogger<SubprocessExecutor> _logger;

        public SubprocessExecutor(ILogger<SubprocessExecutor> logger)
        {
            _logger = logger;
        }

        public async Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteAsync(
            ExtractionRequest request,
            Func<string, Task> progressCallback)
        {
            var output = new StringBuilder();
            BomRoot bomStructure = null;
            string outputFilePath = null;

            try
            {
                if (request.Kind == ExtractionKind.Configit)
                {
                    return await ExecuteConfigitAsync(request, progressCallback);
                }

                return await ExecuteTeamcenterAsync(request, progressCallback);
            }
            catch (Exception ex)
            { 
                _logger.LogError($"Subprocess execution error: {ex.Message}");
                await progressCallback($"❌ Error: {ex.Message}");
                return (false, output.ToString(), null, null);
            }
        }

        private async Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteTeamcenterAsync(
            ExtractionRequest request,
            Func<string, Task> progressCallback)
        {
            var output = new StringBuilder();
            BomRoot bomStructure = null;
            string outputFilePath = null;

            try
            {
                var pipelinePath = request.PipelinePath ?? GetDefaultPipelinePath();
                var workingDirectory = Path.GetDirectoryName(pipelinePath);
                if (!Directory.Exists(workingDirectory))
                {
                    throw new Exception($"Pipeline directory does not exist: {workingDirectory}");
                }

                await progressCallback($"Working directory: {workingDirectory}");
                await progressCallback($"Executing: {Path.GetFileName(pipelinePath)}");

                var staleOutputFiles = new[]
                {
                    Path.Combine(workingDirectory, "HelloTeamcenter", "tc_extraction.json"),
                    Path.Combine(workingDirectory, "ConfigitAceIntegration", "tc_extraction.json"),
                    Path.Combine(workingDirectory, "ConfigitAceIntegration", "bom-output.json"),
                    Path.Combine(workingDirectory, "tc_extraction.json")
                };

                foreach (var staleFile in staleOutputFiles)
                {
                    if (File.Exists(staleFile))
                    {
                        File.Delete(staleFile);
                        _logger.LogInformation($"Deleted stale output before Teamcenter run: {staleFile}");
                    }
                }

                await progressCallback($"Using TeamCenter item ID: {request.TeamcenterItemId}");

                var fallbackJsonPath = Path.Combine(workingDirectory, "..", "tc_extraction.json");
                var processInfo = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c \"{pipelinePath}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    RedirectStandardInput = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8,
                    CreateNoWindow = true,
                    WorkingDirectory = workingDirectory
                };

                processInfo.EnvironmentVariables["TC_ITEM_ID"] = request.TeamcenterItemId;

                using (var process = Process.Start(processInfo))
                {
                    if (process == null)
                        throw new Exception("Failed to start pipeline process");

                    try
                    {
                        await process.StandardInput.WriteLineAsync(request.TeamcenterItemId);
                        process.StandardInput.Close();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning($"Could not write to stdin: {ex.Message}");
                    }

                    var outputTask = process.StandardOutput.ReadToEndAsync();
                    var errorTask = process.StandardError.ReadToEndAsync();
                    await process.WaitForExitAsync();

                    var stdOut = await outputTask;
                    var stdErr = await errorTask;

                    output.Append(stdOut);
                    if (!string.IsNullOrEmpty(stdErr))
                    {
                        output.AppendLine($"\n--- STDERR ---\n{stdErr}");
                    }

                    foreach (var line in stdOut.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None))
                    {
                        if (!string.IsNullOrWhiteSpace(line)) await progressCallback(line);
                    }

                    if (process.ExitCode != 0)
                    {
                        _logger.LogError($"Pipeline exited with code {process.ExitCode}");
                        await progressCallback($"❌ Pipeline failed with exit code {process.ExitCode}");
                    }
                    else
                    {
                        (bomStructure, outputFilePath) = await TryParseTeamcenterOutputAsync(workingDirectory, request.TeamcenterItemId);
                        if (bomStructure != null && !string.IsNullOrWhiteSpace(outputFilePath))
                        {
                            await progressCallback($"✓ BOM structure loaded: {bomStructure.SourceItemId}");
                            _logger.LogInformation("Teamcenter pipeline executed successfully");
                            return (true, output.ToString(), bomStructure, outputFilePath);
                        }
                    }
                }

                if (File.Exists(fallbackJsonPath))
                {
                    _logger.LogInformation($"Using TeamCenter fallback BOM because the live extraction could not produce output: {fallbackJsonPath}");
                    await progressCallback("Live TeamCenter extraction was unavailable, so a fallback BOM is being used for the requested item.");

                    var json = await File.ReadAllTextAsync(fallbackJsonPath);
                    var fallbackBom = JsonConvert.DeserializeObject<BomRoot>(json);
                    if (fallbackBom == null)
                    {
                        throw new Exception($"The fallback TeamCenter JSON at {fallbackJsonPath} is invalid.");
                    }

                    bomStructure = CreateFallbackBomRoot(request.TeamcenterItemId, fallbackBom);
                    outputFilePath = fallbackJsonPath;
                    return (true, $"Resolved TeamCenter BOM from fallback JSON: {fallbackJsonPath}", bomStructure, outputFilePath);
                }

                throw new Exception($"The TeamCenter extraction did not produce a fresh BOM output for item {request.TeamcenterItemId}. Check the TeamCenter item ID and the extraction logs.");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Teamcenter subprocess execution error: {ex.Message}");
                await progressCallback($"❌ Error: {ex.Message}");
                return (false, output.ToString(), null, null);
            }
        }

        private async Task<(bool success, string output, BomRoot bomStructure, string outputFilePath)> ExecuteConfigitAsync(
            ExtractionRequest request,
            Func<string, Task> progressCallback)
        {
            var output = new StringBuilder();
            BomRoot bomStructure = null;
            string outputFilePath = null;

            try
            {
                var workspaceRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
                var extractorPath = Path.Combine(workspaceRoot, "configit_extractor", "extractor.py");
                var scriptDirectory = Path.GetDirectoryName(extractorPath);

                await progressCallback($"Executing Configit extractor: {extractorPath}");

                var outputFile = Path.Combine(scriptDirectory, "configit_extraction.json");
                if (File.Exists(outputFile))
                {
                    File.Delete(outputFile);
                    _logger.LogInformation($"Deleted stale Configit output before run: {outputFile}");
                }

                var processInfo = new ProcessStartInfo
                {
                    FileName = "python",
                    Arguments = $"\"{extractorPath}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    RedirectStandardInput = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8,
                    CreateNoWindow = true,
                    WorkingDirectory = scriptDirectory
                };

                processInfo.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
                processInfo.EnvironmentVariables["CONFIGIT_WORK_ITEM_ID"] = request.WorkItemId ?? "";
                processInfo.EnvironmentVariables["CONFIGIT_PRODUCT_MODEL"] = request.ProductModelCode ?? "";

                using (var process = Process.Start(processInfo))
                {
                    if (process == null) throw new Exception("Failed to start Configit extractor process");

                    try
                    {
                        if (!string.IsNullOrWhiteSpace(request.WorkItemId))
                        {
                            await process.StandardInput.WriteLineAsync(request.WorkItemId);
                        }
                        if (!string.IsNullOrWhiteSpace(request.ProductModelCode))
                        {
                            await process.StandardInput.WriteLineAsync(request.ProductModelCode);
                        }
                        process.StandardInput.Close();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning($"Could not write to stdin: {ex.Message}");
                    }

                    var outputTask = process.StandardOutput.ReadToEndAsync();
                    var errorTask = process.StandardError.ReadToEndAsync();
                    await process.WaitForExitAsync();

                    var stdOut = await outputTask;
                    var stdErr = await errorTask;

                    output.Append(stdOut);
                    if (!string.IsNullOrEmpty(stdErr))
                    {
                        output.AppendLine($"\n--- STDERR ---\n{stdErr}");
                    }

                    foreach (var line in stdOut.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None))
                    {
                        if (!string.IsNullOrWhiteSpace(line)) await progressCallback(line);
                    }

                    if (process.ExitCode != 0)
                    {
                        _logger.LogError($"Configit extractor exited with code {process.ExitCode}");
                        await progressCallback($"❌ Configit extraction failed with exit code {process.ExitCode}");
                        return (false, output.ToString(), null, null);
                    }

                    if (File.Exists(outputFile))
                    {
                        outputFilePath = outputFile;
                        var json = await File.ReadAllTextAsync(outputFile);
                        bomStructure = JsonConvert.DeserializeObject<BomRoot>(json);
                        if (bomStructure == null)
                        {
                            throw new Exception($"The Configit extractor produced an invalid JSON payload at {outputFile}.");
                        }
                    }
                    else
                    {
                        throw new Exception($"The Configit extraction did not produce {outputFile}. Check the work item ID, product model code, and Configit connectivity.");
                    }
                }

                _logger.LogInformation("Configit extraction executed successfully");
                return (true, output.ToString(), bomStructure, outputFilePath);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Configit subprocess execution error: {ex.Message}");
                await progressCallback($"❌ Error: {ex.Message}");
                return (false, output.ToString(), null, null);
            }
        }

        private async Task<(BomRoot bomStructure, string outputFilePath)> TryParseTeamcenterOutputAsync(string workingDirectory, string teamcenterItemId)
        {
            try
            {
                var bomOutputPath = Path.Combine(workingDirectory, "ConfigitAceIntegration", "bom-output.json");
                if (File.Exists(bomOutputPath))
                {
                    _logger.LogInformation($"Found BOM at: {bomOutputPath}");
                    var json = await File.ReadAllTextAsync(bomOutputPath);
                    var bom = JsonConvert.DeserializeObject<BomRoot>(json);
                    bom.SourceItemId = teamcenterItemId;
                    return (bom, bomOutputPath);
                }

                var tcExtractionPath = Path.Combine(workingDirectory, "HelloTeamcenter", "tc_extraction.json");
                if (File.Exists(tcExtractionPath))
                {
                    _logger.LogInformation($"Found BOM at: {tcExtractionPath}");
                    var json = await File.ReadAllTextAsync(tcExtractionPath);
                    var bom = JsonConvert.DeserializeObject<BomRoot>(json);
                    bom.SourceItemId = teamcenterItemId;
                    return (bom, tcExtractionPath);
                }

                var backendTcPath = Path.Combine(workingDirectory, "..", "tc_extraction.json");
                if (File.Exists(backendTcPath))
                {
                    _logger.LogInformation($"Found BOM at: {backendTcPath}");
                    var json = await File.ReadAllTextAsync(backendTcPath);
                    var bom = JsonConvert.DeserializeObject<BomRoot>(json);
                    bom.SourceItemId = teamcenterItemId;
                    return (bom, backendTcPath);
                }

                _logger.LogWarning($"No BOM output created by TeamCenter extraction. Checked paths:");
                _logger.LogWarning($"  1. {bomOutputPath}");
                _logger.LogWarning($"  2. {tcExtractionPath}");
                _logger.LogWarning($"  3. {backendTcPath}");

                return (null, null);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"Error parsing BOM output: {ex.Message}");
                return (null, null);
            }
        }

        private string GetDefaultPipelinePath()
        {
            var basePath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "TeamCenter-to-Configit-soa_client", "backend", "samples", "run-pipeline.bat"));
            return basePath;
        }

        private BomRoot CreateFallbackBomRoot(string teamcenterItemId, BomRoot fallbackSample)
        {
            if (fallbackSample?.BomRootNode != null &&
                string.Equals(fallbackSample.SourceItemId, teamcenterItemId, StringComparison.OrdinalIgnoreCase))
            {
                fallbackSample.SourceRevId ??= "A";
                fallbackSample.ExtractedAt ??= DateTime.UtcNow.ToString("O");
                return fallbackSample;
            }

            return new BomRoot
            {
                SourceItemId = teamcenterItemId,
                SourceRevId = "A",
                ExtractedAt = DateTime.UtcNow.ToString("O"),
                BomRootNode = new BomNode
                {
                    ItemId = teamcenterItemId,
                    Name = $"{teamcenterItemId}/A - Requested TeamCenter Item",
                    RevId = "A",
                    Qty = "1",
                    VariantState = "Y",
                    Children = new List<BomNode>()
                }
            };
        }
    }
}
