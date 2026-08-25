namespace Orchestration.API.Engineering.Contracts;
public static class EngineeringContractVersions { public const string V1 = "1.0"; }
public enum EngineeringSource { Teamcenter, Windchill, Sap, Configit }
public enum IdentifierType { Auto, ProductId, ItemId, PartNumber, MaterialNumber, ProductName, NativeId }
public enum SourceReadiness { Ready, Degraded, Unavailable, AuthenticationRequired, CapabilityLimited, Unknown }
public enum DiscoveryMode { ExactId, Name, Number, MaterialCatalog, ProductId, ContextualHandoff, Unsupported }
public enum MatchCategory { VerifiedIdentifierMatch, SourceNativeReference, DeterministicNormalizedIdMatch, ExactNormalizedNameMatch, ExactSourceNameMatch, SourceSearchResult, StructureSupportedProbableMatch, ProbableMatch, AmbiguousCandidate, Unresolved }
public enum ConfidenceClass { Verified, Deterministic, Probable, Ambiguous, Unresolved, Unverified }
public enum StandardStatus { Queued, Resolving, Extracting, Enriching, Success, PartialSuccess, Empty, Failed, Unavailable, Cancelled, TimedOut, CapabilityLimited, AwaitingContext }
public enum EngineeringStage { Validation, Readiness, Discovery, Resolution, Extraction, Enrichment, Normalization, Persistence, Cancellation, Timeout, TeamcenterSession, TeamcenterResolution, TeamcenterStructureExtraction, TeamcenterPlmxmlExport, TeamcenterNormalization, ConfigitTransformation, ConfigitCompilation, ConfigitPublication, CanonicalArtifactCapture }
public enum EvidenceAvailability { Available, Partial, Unavailable, Unsupported, NotRequested, NotObserved }
public enum ProvenanceKind { LiveSource, CachedSourceResult, DeterministicTestFixture, CapabilityOnly, Unavailable }
public enum ArtifactSensitivity { Internal, Sensitive, Restricted }
public enum JobState { Accepted, Queued, CheckingReadiness, Discovering, AwaitingSelection, Resolving, Extracting, Enriching, Success, PartialSuccess, Empty, Failed, Unavailable, CancellationRequested, Cancelled, TimedOut }
public sealed record TimeoutPolicy(int TimeoutMs = 600000, int? PerSourceTimeoutMs = null);
