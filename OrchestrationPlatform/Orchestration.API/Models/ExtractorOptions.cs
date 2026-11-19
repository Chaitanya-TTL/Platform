
namespace Orchestration.API.Models;

public sealed class ExtractorOptions
{
    public string WorkspaceRoot { get; set; } = "";
    public string SapExtractorPath { get; set; } = "";
    public string ConfigitExtractorPath { get; set; } = "";
    public string TeamcenterPipelinePath { get; set; } = "";
    public string WindchillExtractorPath { get; set; } = "";
    public string PythonExecutable { get; set; } = "";
    public string SapCatalogRoot { get; set; } = "";
    public int SapCatalogStaleMinutes { get; set; } = 1440;
    public string ConfigitProductIndexPath { get; set; } = "";
    public string JavaExecutable { get; set; } = "java";
    public string JavacExecutable { get; set; } = "javac";
    public bool CompileJavaAtRuntime { get; set; } = true;
    public int SapTimeoutSeconds { get; set; } = 300;
    public int GeneralTimeoutSeconds { get; set; } = 600;
    public int MaxConcurrentSapJobs { get; set; } = 1;
    public int JobRetentionMinutes { get; set; } = 1440;
    public string ResolveWorkspaceRoot() => string.IsNullOrWhiteSpace(WorkspaceRoot)
        ? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."))
        : Path.GetFullPath(WorkspaceRoot);
    public string ResolveSapPath() => string.IsNullOrWhiteSpace(SapExtractorPath)
        ? Path.Combine(ResolveWorkspaceRoot(), "SAP-BOM-Extractor") : Path.GetFullPath(SapExtractorPath);
    public string ResolveConfigitPath() => string.IsNullOrWhiteSpace(ConfigitExtractorPath)
        ? Path.Combine(ResolveWorkspaceRoot(), "configit_extractor", "extractor.py") : Path.GetFullPath(ConfigitExtractorPath);
    public string ResolveWindchillPath() => string.IsNullOrWhiteSpace(WindchillExtractorPath)
        ? Path.Combine(ResolveWorkspaceRoot(), "windchill_extractor", "extractor.py") : Path.GetFullPath(WindchillExtractorPath);
    public string ResolveSapCatalogRoot() => string.IsNullOrWhiteSpace(SapCatalogRoot)
        ? Path.Combine(ResolveSapPath(), "runtime", "catalog") : Path.GetFullPath(SapCatalogRoot);
    public string ResolveConfigitProductIndexPath() => string.IsNullOrWhiteSpace(ConfigitProductIndexPath)
        ? Path.Combine(ResolveWorkspaceRoot(), "configit_extractor", "product-index.json") : Path.GetFullPath(ConfigitProductIndexPath);
    public string ResolvePythonExecutable()
    {
        if (!string.IsNullOrWhiteSpace(PythonExecutable)) return Path.GetFullPath(PythonExecutable);

        var executableName = OperatingSystem.IsWindows() ? "python.exe" : "python3";
        var fromPath = Environment.GetEnvironmentVariable("PATH")?
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Select(directory => Path.Combine(directory, executableName))
            .FirstOrDefault(File.Exists);
        if (fromPath is not null) return fromPath;

        if (OperatingSystem.IsWindows())
        {
            var installRoot = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "Python");
            if (Directory.Exists(installRoot))
            {
                var installed = Directory.GetDirectories(installRoot, "Python*", SearchOption.TopDirectoryOnly)
                    .OrderByDescending(directory => Path.GetFileName(directory), StringComparer.OrdinalIgnoreCase)
                    .Select(directory => Path.Combine(directory, "python.exe"))
                    .FirstOrDefault(File.Exists);
                if (installed is not null) return installed;
            }
        }

        return "python";
    }
    public string ResolveTeamcenterPath() => string.IsNullOrWhiteSpace(TeamcenterPipelinePath)
        ? Path.Combine(ResolveWorkspaceRoot(), "TeamCenter-to-Configit-soa_client", "backend", "samples", "run-teamcenter.bat")
        : Path.GetFullPath(TeamcenterPipelinePath);
}
