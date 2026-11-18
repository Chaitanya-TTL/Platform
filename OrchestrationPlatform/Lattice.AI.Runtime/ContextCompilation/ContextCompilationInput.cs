using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.ContextCompilation;

public sealed record ContextCompilationInput(
    RuntimeRequestContext RequestContext,
    string InvestigationId,
    ResolvedEntity Subject,
    ImpactScope Scope,
    AuthorizationScope Authorization,
    EvidenceRetrievalResult Evidence,
    ContextBudget Budget);
