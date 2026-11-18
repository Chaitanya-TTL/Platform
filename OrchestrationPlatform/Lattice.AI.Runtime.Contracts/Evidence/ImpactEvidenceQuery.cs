using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Evidence;

public sealed record ImpactEvidenceQuery(
    string InvestigationId,
    ResolvedEntity Subject,
    ImpactScope Scope,
    AuthorizationContext Authorization,
    RuntimeRequestContext RequestContext);
