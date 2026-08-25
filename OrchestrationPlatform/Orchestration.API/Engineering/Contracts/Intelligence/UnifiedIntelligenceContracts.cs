
namespace Orchestration.API.Engineering.Contracts;
public enum IntelligenceConfidence { Verified, Deterministic, Probable, Ambiguous, Unresolved }
public enum IntelligenceSeverity { Information, Warning, Critical }
public enum EvidenceCompleteness { Complete, Partial, Missing, Unavailable, Unsupported, NotRequested }
public sealed record UnifiedProductIdentity(string IdentityId,string DisplayName,string? PreferredProductId,IntelligenceConfidence Confidence,IReadOnlyList<string> CandidateIds,IReadOnlyList<string> Reasons);
public sealed record IntelligenceEvidenceReference(EngineeringSource Source,string SourceExecutionId,string EvidenceKind,string Reference,string? Checksum=null);
public sealed record EngineeringFinding(string FindingId,string Code,string Title,string Description,IntelligenceSeverity Severity,IntelligenceConfidence Confidence,IReadOnlyList<EngineeringSource> Sources,IReadOnlyList<IntelligenceEvidenceReference> Evidence,IReadOnlyDictionary<string,string?> SafeContext);
public sealed record EvidenceSectionAssessment(string Section,EngineeringSource? Source,EvidenceCompleteness Completeness,string Reason,IReadOnlyList<IntelligenceEvidenceReference> Evidence);
public sealed record SourceIntelligenceEnvelope(EngineeringSource Source,StandardStatus Status,SourceCandidate? Candidate,TypedSourceEvidence Evidence,IReadOnlyList<IntelligenceEvidenceReference> References,IReadOnlyList<StructuredWarning> Warnings,IReadOnlyList<StructuredError> Errors,ResultProvenance Provenance);
public sealed record UnifiedProductIntelligence(string SchemaVersion,string IntelligenceId,UnifiedProductIdentity Identity,IReadOnlyList<SourceIntelligenceEnvelope> Sources,IReadOnlyList<CandidateCorrespondence> Correspondences,IReadOnlyList<EngineeringFinding> Findings,IReadOnlyList<EvidenceSectionAssessment> Completeness,StandardStatus Status,DateTimeOffset AssembledAt);
public sealed record UnifiedIntelligenceInput(string SchemaVersion,string ParentDiscoveryJobId,IReadOnlyList<SourceCandidate> SelectedCandidates,IReadOnlyList<StandardExtractionResult> ExtractionResults,IReadOnlyList<CandidateCorrespondence> Correspondences);



