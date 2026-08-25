
using System.Security.Cryptography;using System.Text;using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Intelligence;
public interface IUnifiedIdentityEvaluator{UnifiedProductIdentity Evaluate(IReadOnlyList<SourceCandidate> candidates,IReadOnlyList<CandidateCorrespondence> correspondences);}
public sealed class UnifiedIdentityEvaluator:IUnifiedIdentityEvaluator
{
 public UnifiedProductIdentity Evaluate(IReadOnlyList<SourceCandidate> candidates,IReadOnlyList<CandidateCorrespondence> correspondences){if(candidates.Count==0)return new("identity-unresolved","Unresolved product",null,IntelligenceConfidence.Unresolved,[],["No selected candidates were supplied."]);var ids=candidates.Select(x=>x.NativeId.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();var names=candidates.Select(x=>x.DisplayName.Trim()).Where(x=>x.Length>0).ToArray();var verified=candidates.Any(x=>x.ConfidenceClass==ConfidenceClass.Verified);var deterministic=ids.Length==1||correspondences.Any(x=>x.ConfidenceClass is ConfidenceClass.Verified or ConfidenceClass.Deterministic);var confidence=verified?IntelligenceConfidence.Verified:deterministic?IntelligenceConfidence.Deterministic:names.Distinct(StringComparer.OrdinalIgnoreCase).Count()==1?IntelligenceConfidence.Probable:IntelligenceConfidence.Ambiguous;var preferred=ids.Length==1?ids[0]:candidates.FirstOrDefault(x=>x.ConfidenceClass==ConfidenceClass.Verified)?.NativeId;var display=names.GroupBy(x=>x,StringComparer.OrdinalIgnoreCase).OrderByDescending(x=>x.Count()).ThenBy(x=>x.Key,StringComparer.OrdinalIgnoreCase).First().Key;var stable=string.Join("|",candidates.Select(x=>x.CandidateId).Order(StringComparer.Ordinal));var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(stable))).ToLowerInvariant()[..16];var reasons=new List<string>{verified?"At least one selected candidate was verified by live extraction.":deterministic?"Selected candidates have deterministic identifier evidence.":"Selected candidates require correspondence review."};return new($"identity-{hash}",display,preferred,confidence,candidates.Select(x=>x.CandidateId).Order(StringComparer.Ordinal).ToArray(),reasons);}
}



