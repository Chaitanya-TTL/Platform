
using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Intelligence;
public interface ITypedSourceEvidenceMapper{SourceIntelligenceEnvelope Map(StandardExtractionResult result);}
public sealed class TypedSourceEvidenceMapper:ITypedSourceEvidenceMapper
{
 public SourceIntelligenceEnvelope Map(StandardExtractionResult r){var availability=r.Status switch{StandardStatus.Success=>EvidenceAvailability.Available,StandardStatus.PartialSuccess=>EvidenceAvailability.Partial,StandardStatus.Unavailable=>EvidenceAvailability.Unavailable,_=>r.Root is null&&r.Structures.Count==0?EvidenceAvailability.NotObserved:EvidenceAvailability.Partial};TypedSourceEvidence evidence=r.Source switch{EngineeringSource.Teamcenter=>new TeamcenterTypedEvidence(availability,r.Root,r.Stages),EngineeringSource.Windchill=>new WindchillTypedEvidence(availability,r.Structures,r.Resolution.Candidate?.Revision,r.Resolution.Candidate?.Version,r.Resolution.Candidate?.LifecycleState),EngineeringSource.Sap=>new SapTypedEvidence(availability,r.Root,Value(r,"businessImpact"),Value(r,"materialHistory"),Text(r,"plant")??Text(r,"organizationContext")),EngineeringSource.Configit=>new ConfigitTypedEvidence(availability,r.Root,Text(r,"packagePath"),Text(r,"configurationDate"),Dictionary(r,"providedVariables")),_=>new UnavailableTypedEvidence(r.Source,availability,"No typed mapping is available.")};var refs=r.Artifacts.Select(x=>new IntelligenceEvidenceReference(r.Source,r.SourceExecutionId,x.ArtifactType,x.LogicalReference,x.Checksum)).ToArray();return new(r.Source,r.Status,r.Resolution.Candidate,evidence,refs,r.Warnings,r.Errors,r.Provenance);}
 static object? Value(StandardExtractionResult r,string key)=>r.Evidence.TryGetValue(key,out var v)?v:null;
 static string? Text(StandardExtractionResult r,string key)=>Value(r,key)?.ToString();
 static IReadOnlyDictionary<string,string>? Dictionary(StandardExtractionResult r,string key)=>Value(r,key) as IReadOnlyDictionary<string,string>;
}



