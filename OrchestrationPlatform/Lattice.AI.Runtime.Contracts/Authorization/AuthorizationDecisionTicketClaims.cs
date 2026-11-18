namespace Lattice.AI.Runtime.Contracts.Authorization;

public sealed record AuthorizationDecisionTicketClaims(
    string Issuer,
    string Audience,
    string TenantId,
    string SubjectId,
    string InvestigationId,
    string Operation,
    IReadOnlyList<string> Grants,
    string PolicyVersion,
    string DecisionId,
    string RequestId,
    string TokenId,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt);
