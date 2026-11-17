using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Evidence;

public sealed record ImpactEvidenceQuery(
    ResolvedEntity Subject,
    ImpactScope Scope,
    AuthorizationScope Authorization,
    RuntimeRequestContext RequestContext);
