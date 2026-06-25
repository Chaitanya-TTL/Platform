namespace ConfigitAceIntegration.Config;

public record AcePlatformSettings
{
    public string Uri { get; init; } = string.Empty;
    public string ApiKey { get; init; } = string.Empty;
    public string PackagePath { get; init; } = "samples/pen";
}
