using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Authorization;

public sealed record AuthorizationScope(
    string TenantId,
    string SubjectId,
    string PolicyVersion,
    string DecisionId,
    [property: JsonConverter(typeof(ReadOnlyStringSetJsonConverter))]
    IReadOnlySet<string> Grants);
