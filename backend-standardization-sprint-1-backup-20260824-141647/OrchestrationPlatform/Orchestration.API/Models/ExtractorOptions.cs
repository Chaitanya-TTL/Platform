namespace Orchestration.API.Models;

public sealed class ExtractorOptions
{
    public string WorkspaceRoot { get; set; } = "";
    public string SapExtractorPath { get; set; } = "";
    public string ConfigitExtractorPath { get; set; } = "";
    public string TeamcenterPipelinePath { get; set; } = "";
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
    public string ResolveTeamcenterPath() => string.IsNullOrWhiteSpace(TeamcenterPipelinePath)
        ? Path.Combine(ResolveWorkspaceRoot(), "TeamCenter-to-Configit-soa_client", "backend", "samples", "run-pipeline.bat")
        : Path.GetFullPath(TeamcenterPipelinePath);
}
