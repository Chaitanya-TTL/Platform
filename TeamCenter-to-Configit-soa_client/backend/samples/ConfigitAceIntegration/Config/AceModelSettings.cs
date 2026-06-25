namespace ConfigitAceIntegration.Config;

public record AceModelSettings
{
    public string Uri { get; init; } = string.Empty;
    public string ApiKey { get; init; } = string.Empty;
    public string BrandCode { get; init; } = string.Empty;
    public string WorkItemName { get; init; } = string.Empty;
    public string WorkItemDescription { get; init; } = string.Empty;
    public string[] AssignedUsers { get; init; } = Array.Empty<string>();
}
