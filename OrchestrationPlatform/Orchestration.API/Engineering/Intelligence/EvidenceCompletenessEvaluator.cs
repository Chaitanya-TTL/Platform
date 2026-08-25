
using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Intelligence;
public interface IEvidenceCompletenessEvaluator{IReadOnlyList<EvidenceSectionAssessment> Evaluate(IReadOnlyList<SourceIntelligenceEnvelope> sources);}
public sealed class EvidenceCompletenessEvaluator:IEvidenceCompletenessEvaluator
{
 public IReadOnlyList<EvidenceSectionAssessment> Evaluate(IReadOnlyList<SourceIntelligenceEnvelope> sources)=>sources.OrderBy(x=>x.Source).Select(x=>new EvidenceSectionAssessment("source-evidence",x.Source,Map(x),Reason(x),x.References)).ToArray();
 static EvidenceCompleteness Map(SourceIntelligenceEnvelope x)=>x.Status switch{StandardStatus.Success=>EvidenceCompleteness.Complete,StandardStatus.PartialSuccess=>EvidenceCompleteness.Partial,StandardStatus.Unavailable=>EvidenceCompleteness.Unavailable,StandardStatus.Empty=>EvidenceCompleteness.Missing,StandardStatus.AwaitingContext=>EvidenceCompleteness.Missing,_=>x.Evidence.Availability==EvidenceAvailability.Unsupported?EvidenceCompleteness.Unsupported:EvidenceCompleteness.Partial};
 static string Reason(SourceIntelligenceEnvelope x)=>x.Status switch{StandardStatus.Success=>"The selected source returned usable evidence.",StandardStatus.PartialSuccess=>"The selected source returned usable but incomplete evidence.",StandardStatus.Empty=>"The selected source completed without usable evidence.",StandardStatus.Unavailable=>"The selected source was unavailable.",StandardStatus.AwaitingContext=>"The selected source requires additional context.",_=>"The selected source did not produce complete evidence."};
}



