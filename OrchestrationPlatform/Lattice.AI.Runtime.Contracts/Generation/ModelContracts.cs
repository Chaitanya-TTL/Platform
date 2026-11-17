using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Contracts.Generation;

public sealed record ModelConfiguration(
    string Id,
    string Provider,
    string ModelName,
    string DeploymentName,
    int MaxOutputTokens);

public sealed record ModelMessage(string Role, string Content);

public sealed record ModelRequest(
    RuntimeRequestContext RequestContext,
    string PromptBundleId,
    string PromptBundleVersion,
    string ContextPackageId,
    string ModelConfigurationId,
    IReadOnlyList<ModelMessage> Messages,
    string OutputSchemaVersion);

public sealed record ModelResponse(
    RuntimeRequestContext RequestContext,
    string Content,
    string Provider,
    string Model,
    string? ModelVersion,
    int? InputTokens,
    int? OutputTokens,
    TimeSpan Duration);
