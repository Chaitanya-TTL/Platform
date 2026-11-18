namespace Orchestration.API.AI.Adapters;

public sealed class PlmBrainServiceOptions
{
    public string? BaseAddress { get; set; }
    public string? WorkloadScope { get; set; }
    public string? TenantClaimType { get; set; } = "tid";
    public string? SubjectClaimType { get; set; } = "sub";
    public string? TicketIssuer { get; set; }
    public string? TicketAudience { get; set; }
    public string? SigningKeyVaultUri { get; set; }
    public string? SigningKeyName { get; set; }
    public int MaximumAuthorizationTicketLifetimeSeconds { get; set; } = 60;
}
