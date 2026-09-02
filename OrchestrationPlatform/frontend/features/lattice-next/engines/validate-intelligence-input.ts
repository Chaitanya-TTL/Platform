import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";

export class IntelligenceAssemblyError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Invalid engineering intelligence investigation: ${issues.join(", ")}`);
    this.name = "IntelligenceAssemblyError";
  }
}

export function validateIntelligenceInput(input: EngineeringIntelligenceInvestigationV1): void {
  const issues: string[] = [];
  const duplicateIds = (values: readonly string[]) => values.filter((id, index) => values.indexOf(id) !== index);
  const entityIds = [input.subject.id, ...input.entities.map((entity) => entity.id)];
  const evidenceIds = input.evidence.map((evidence) => evidence.id);
  const relationshipIds = input.relationships.map((relationship) => relationship.id);
  const entitySet = new Set(entityIds);
  const evidenceSet = new Set(evidenceIds);

  for (const id of duplicateIds(entityIds)) issues.push(`duplicate-entity:${id}`);
  for (const id of duplicateIds(evidenceIds)) issues.push(`duplicate-evidence:${id}`);
  for (const id of duplicateIds(relationshipIds)) issues.push(`duplicate-relationship:${id}`);

  for (const relationship of input.relationships) {
    if (!entitySet.has(relationship.sourceEntityId)) issues.push(`missing-source:${relationship.id}`);
    if (!entitySet.has(relationship.targetEntityId)) issues.push(`missing-target:${relationship.id}`);
    if (relationship.assertion === "inference" && !relationship.confidence) issues.push(`inference-confidence:${relationship.id}`);
    if (relationship.assertion === "inference" && relationship.evidenceIds.length === 0) issues.push(`inference-evidence:${relationship.id}`);
    for (const evidenceId of relationship.evidenceIds) if (!evidenceSet.has(evidenceId)) issues.push(`missing-evidence:${relationship.id}:${evidenceId}`);
  }

  for (const finding of input.findings) {
    if (finding.subjectEntityIds.length === 0) issues.push(`finding-subject:${finding.id}`);
    for (const id of finding.subjectEntityIds) if (!entitySet.has(id)) issues.push(`missing-finding-subject:${finding.id}:${id}`);
    for (const id of finding.evidenceIds) if (!evidenceSet.has(id)) issues.push(`missing-finding-evidence:${finding.id}:${id}`);
  }

  for (const source of input.sources) if (!entitySet.has(source.entityId)) issues.push(`missing-source-representation:${source.source}:${source.entityId}`);
  for (const cluster of input.identityClusters) for (const id of cluster.entityIds) if (!entitySet.has(id)) issues.push(`missing-cluster-member:${cluster.id}:${id}`);

  if (issues.length) throw new IntelligenceAssemblyError([...new Set(issues)].sort());
}
