namespace Lattice.AI.Runtime.Prompts;

public sealed record PromptBundle(
    string Id,
    string Version,
    string OutputSchemaVersion,
    string SystemPolicy,
    string DomainGuidance,
    string ImpactTask);
