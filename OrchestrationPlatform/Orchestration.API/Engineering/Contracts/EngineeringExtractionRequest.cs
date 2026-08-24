namespace Orchestration.API.Engineering.Contracts;
public sealed record EngineeringExtractionRequest(string SchemaVersion, string RequestId, string CorrelationId, EngineeringSource Source, SourceCandidate Candidate, IReadOnlyList<string> RequestedEvidence, OrganizationContext? OrganizationContext, TimeoutPolicy TimeoutPolicy, DateTimeOffset InitiatedAt);
public sealed record OrganizationContext(string? Plant = null, string? StorageLocation = null, string? ValuationArea = null, string? CompanyCode = null, string? SalesOrganization = null, IReadOnlyDictionary<string,string>? Additional = null);
