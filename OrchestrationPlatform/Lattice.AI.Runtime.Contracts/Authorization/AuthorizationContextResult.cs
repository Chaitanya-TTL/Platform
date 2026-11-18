namespace Lattice.AI.Runtime.Contracts.Authorization;

public enum AuthorizationDenialCode
{
    MissingIdentity,
    MissingPolicyDecision,
    InvestigationAccessDenied,
    MissingProviderConfiguration,
    ExpiredPolicyDecision
}

public abstract record AuthorizationContextResult
{
    private AuthorizationContextResult()
    {
    }

    public sealed record Authorized(AuthorizationContext Context) : AuthorizationContextResult;

    public sealed record Denied(AuthorizationDenialCode Code) : AuthorizationContextResult;
}
