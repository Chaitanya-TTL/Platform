using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Contracts.Context;

public sealed record ContextPackage(
    RuntimeRequestContext RequestContext,
    string PackageId,
    string SchemaVersion,
    string CompilerVersion,
    string AuthorizationDecisionId,
    ResolvedEntity Subject,
    ImpactScope Scope,
    IReadOnlyList<ImpactClaim> Claims,
    IReadOnlyList<EvidenceSourceReference> Sources,
    IReadOnlyList<ContextOmission> Omissions);

public sealed record ContextOmission(string ClaimId, string Reason);

public enum CompilationDisposition
{
    Ready,
    Empty,
    InsufficientEvidence,
    Denied
}

public sealed record ContextCompilationResult(
    ContextPackage? Package,
    CompilationDisposition Disposition,
    IReadOnlyList<string> Diagnostics);

public sealed record ImpactClaim(
    string ClaimId,
    string Statement,
    IReadOnlyList<string> EntityIds,
    IReadOnlyList<string> RelationshipIds,
    IReadOnlyList<string> EvidenceIds,
    string? Rationale);
