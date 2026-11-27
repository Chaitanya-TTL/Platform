namespace Lattice.AI.Runtime.Azure.Models;

public sealed class AiRuntimeOptions
{
    public string Endpoint { get; set; } = string.Empty;

    public string DeploymentName { get; set; } = string.Empty;

    public string TokenizerModelName { get; set; } = "gpt-4o";

    public int TimeoutSeconds { get; set; } = 45;

    public int MaxOutputTokens { get; set; } = 1024;

    public int MaxInputTokens { get; set; }

    public void Validate()
    {
        if (!Uri.TryCreate(Endpoint, UriKind.Absolute, out var endpoint) ||
            endpoint.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException("AiRuntime:Endpoint must be an absolute HTTPS URI.");
        }

        if (string.IsNullOrWhiteSpace(DeploymentName))
        {
            throw new InvalidOperationException("AiRuntime:DeploymentName is required.");
        }

        if (string.IsNullOrWhiteSpace(TokenizerModelName))
        {
            throw new InvalidOperationException("AiRuntime:TokenizerModelName is required.");
        }

        if (TimeoutSeconds is < 1 or > 120)
        {
            throw new InvalidOperationException("AiRuntime:TimeoutSeconds must be between 1 and 120.");
        }

        if (MaxOutputTokens is < 1 or > 8192)
        {
            throw new InvalidOperationException("AiRuntime:MaxOutputTokens must be between 1 and 8192.");
        }

        if (MaxInputTokens < 1)
        {
            throw new InvalidOperationException("AiRuntime:MaxInputTokens must be greater than zero.");
        }

        if (MaxOutputTokens >= MaxInputTokens)
        {
            throw new InvalidOperationException("AiRuntime:MaxOutputTokens must be less than AiRuntime:MaxInputTokens.");
        }
    }
}
