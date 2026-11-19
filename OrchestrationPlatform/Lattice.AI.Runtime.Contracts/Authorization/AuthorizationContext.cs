using System.Text.Json.Serialization;

namespace Lattice.AI.Runtime.Contracts.Authorization;

public sealed record AuthorizationContext(
    AuthorizationScope Scope,
    [property: JsonIgnore]
    string SignedDecisionToken,
    DateTimeOffset ExpiresAt)
{
    public override string ToString() =>
        $"AuthorizationContext {{ Scope = {Scope}, ExpiresAt = {ExpiresAt} }}";
}
