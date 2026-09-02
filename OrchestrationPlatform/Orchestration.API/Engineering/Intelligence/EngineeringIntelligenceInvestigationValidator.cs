using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Intelligence;
public sealed record IntelligenceValidationResult(bool IsValid,IReadOnlyList<string> Errors);
public sealed class EngineeringIntelligenceInvestigationValidator
{
 public IntelligenceValidationResult Validate(EngineeringIntelligenceInvestigation value){var errors=new List<string>();
  if(value.ContractVersion!=EngineeringIntelligenceContractVersions.V1)errors.Add("contract-version-unsupported");
  if(string.IsNullOrWhiteSpace(value.InvestigationId)||string.IsNullOrWhiteSpace(value.Subject.Id))errors.Add("investigation-identity-required");
  var entityIds=value.Entities.Select(x=>x.Id).Append(value.Subject.Id).ToHashSet(StringComparer.Ordinal);
  if(entityIds.Count!=value.Entities.Count+1)errors.Add("entity-id-duplicate");
  foreach(var entity in value.Entities)if(string.IsNullOrWhiteSpace(entity.Kind)||string.IsNullOrWhiteSpace(entity.Provenance.Provider))errors.Add($"entity-invalid:{entity.Id}");
  var evidenceIds=value.Evidence.Select(x=>x.Id).ToHashSet(StringComparer.Ordinal);
  if(evidenceIds.Count!=value.Evidence.Count)errors.Add("evidence-id-duplicate");
  foreach(var relationship in value.Relationships){if(!entityIds.Contains(relationship.SourceEntityId)||!entityIds.Contains(relationship.TargetEntityId))errors.Add($"relationship-endpoint-missing:{relationship.Id}");if(relationship.Assertion==IntelligenceAssertionKind.Inference&&(relationship.Confidence is null||relationship.EvidenceIds.Count==0))errors.Add($"inference-unsubstantiated:{relationship.Id}");if(relationship.EvidenceIds.Any(x=>!evidenceIds.Contains(x)))errors.Add($"relationship-evidence-missing:{relationship.Id}");}
  foreach(var finding in value.Findings){if(string.IsNullOrWhiteSpace(finding.Provenance.Provider))errors.Add($"finding-provenance-missing:{finding.Id}");if(finding.SubjectEntityIds.Count==0||finding.SubjectEntityIds.Any(x=>!entityIds.Contains(x)))errors.Add($"finding-subject-missing:{finding.Id}");if(finding.EvidenceIds.Any(x=>!evidenceIds.Contains(x)))errors.Add($"finding-evidence-missing:{finding.Id}");}
  return new(errors.Count==0,errors.Order(StringComparer.Ordinal).ToArray());}
}
