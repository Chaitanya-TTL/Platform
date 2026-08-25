
namespace Orchestration.API.Engineering.Contracts;
public abstract record TypedSourceEvidence(EngineeringSource Source,EvidenceAvailability Availability);
public sealed record TeamcenterTypedEvidence(EvidenceAvailability Availability,object? Structure,IReadOnlyList<StageObservation> Stages):TypedSourceEvidence(EngineeringSource.Teamcenter,Availability);
public sealed record WindchillTypedEvidence(EvidenceAvailability Availability,IReadOnlyList<object> Structures,string? Revision,string? Version,string? LifecycleState):TypedSourceEvidence(EngineeringSource.Windchill,Availability);
public sealed record SapTypedEvidence(EvidenceAvailability Availability,object? Structure,object? BusinessImpact,object? MaterialHistory,string? Plant):TypedSourceEvidence(EngineeringSource.Sap,Availability);
public sealed record ConfigitTypedEvidence(EvidenceAvailability Availability,object? Structure,string? PackagePath,string? ConfigurationDate,IReadOnlyDictionary<string,string>? ProvidedVariables):TypedSourceEvidence(EngineeringSource.Configit,Availability);
public sealed record UnavailableTypedEvidence(EngineeringSource SourceValue,EvidenceAvailability AvailabilityValue,string Reason):TypedSourceEvidence(SourceValue,AvailabilityValue);



