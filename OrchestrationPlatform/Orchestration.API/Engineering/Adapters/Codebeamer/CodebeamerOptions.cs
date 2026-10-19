namespace Orchestration.API.Engineering.Adapters.Codebeamer;
public sealed class CodebeamerOptions { public string WorkingDirectory {get;set;}="../../codebeamer_extractor"; public string? ExecutablePath {get;set;} public int CommandTimeoutSeconds {get;set;}=30; public int MaximumOutputCharacters {get;set;}=2_000_000; }
