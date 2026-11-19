namespace Orchestration.API.AI.Telemetry;

public sealed class AiRuntimeTelemetryOptions
{
    public bool IncludeInvestigationIdentifier { get; set; }

    public bool IncludeEntityIdentifier { get; set; }

    public bool IncludeTenantIdentifier { get; set; }

    public bool IncludeContextPackageIdentifier { get; set; }
}
