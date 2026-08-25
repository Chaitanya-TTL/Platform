
using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Intelligence;
public interface IUnifiedProductIntelligenceAssembler{UnifiedProductIntelligence Assemble(UnifiedIntelligenceInput input);}
public sealed class UnifiedProductIntelligenceAssembler:IUnifiedProductIntelligenceAssembler
{
 readonly ITypedSourceEvidenceMapper mapper;readonly IUnifiedIdentityEvaluator identities;readonly IEvidenceCompletenessEvaluator completeness;readonly IEngineeringFindingEvaluator findings;
 public UnifiedProductIntelligenceAssembler(ITypedSourceEvidenceMapper mapper,IUnifiedIdentityEvaluator identities,IEvidenceCompletenessEvaluator completeness,IEngineeringFindingEvaluator findings){this.mapper=mapper;this.identities=identities;this.completeness=completeness;this.findings=findings;}
 public UnifiedProductIntelligence Assemble(UnifiedIntelligenceInput input){if(input.SchemaVersion!=EngineeringContractVersions.V1)throw new ArgumentException("Unsupported schema version.",nameof(input));var selected=input.SelectedCandidates.ToDictionary(x=>x.Source);var results=input.ExtractionResults.Where(x=>selected.TryGetValue(x.Source,out var c)&&c.CandidateId==x.Resolution.Candidate?.CandidateId).GroupBy(x=>x.Source).Select(x=>x.OrderByDescending(y=>y.CompletedAt).First()).OrderBy(x=>x.Source).ToArray();var envelopes=results.Select(mapper.Map).ToArray();var identity=identities.Evaluate(input.SelectedCandidates,input.Correspondences);var assessments=completeness.Evaluate(envelopes);var evaluated=findings.Evaluate(identity,envelopes,input.Correspondences);var status=envelopes.Length==0?StandardStatus.Empty:envelopes.All(x=>x.Status==StandardStatus.Success)?StandardStatus.Success:envelopes.Any(x=>x.Status is StandardStatus.Success or StandardStatus.PartialSuccess)?StandardStatus.PartialSuccess:envelopes.All(x=>x.Status==StandardStatus.Unavailable)?StandardStatus.Unavailable:StandardStatus.Failed;return new(input.SchemaVersion,$"intelligence-{input.ParentDiscoveryJobId}",identity,envelopes,input.Correspondences.OrderBy(x=>x.CorrespondenceId,StringComparer.Ordinal).ToArray(),evaluated,assessments,status,DateTimeOffset.UtcNow);}
}



