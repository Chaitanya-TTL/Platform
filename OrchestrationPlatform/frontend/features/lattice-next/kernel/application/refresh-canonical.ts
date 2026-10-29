import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type { SourceExtractionStatus } from "../../contracts/intelligence-v1";

export interface EntityChangeSummary {
  changedEntityIds: string[];
  addedEntityIds: string[];
  removedEntityIds: string[];
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function stale<T extends { temporal: { freshness: string } }>(value: T): T {
  return { ...value, temporal: { ...value.temporal, freshness: "stale" } };
}

export function retainFailedSourceValues(
  previous: EngineeringIntelligenceInvestigationV1 | undefined,
  refreshed: EngineeringIntelligenceInvestigationV1,
  failedSourceStatuses: ReadonlyMap<string, SourceExtractionStatus>,
): EngineeringIntelligenceInvestigationV1 {
  if (!previous || !failedSourceStatuses.size) return refreshed;

  const failedSources = new Set(failedSourceStatuses.keys());
  const failedEntityIds = new Set(previous.entities
    .filter((entity) => entity.provenance.source && failedSources.has(entity.provenance.source))
    .map((entity) => entity.id));
  const staleRelationships = previous.relationships.filter((relationship) =>
    (relationship.provenance.source && failedSources.has(relationship.provenance.source)) ||
    failedEntityIds.has(relationship.sourceEntityId) || failedEntityIds.has(relationship.targetEntityId));
  const staleFindings = previous.findings.filter((finding) =>
    (finding.provenance.source && failedSources.has(finding.provenance.source)) ||
    finding.subjectEntityIds.some((id) => failedEntityIds.has(id)));
  const retainedEntityIds = new Set(failedEntityIds);
  for (const relationship of staleRelationships) {
    retainedEntityIds.add(relationship.sourceEntityId);
    retainedEntityIds.add(relationship.targetEntityId);
  }
  for (const finding of staleFindings) finding.subjectEntityIds.forEach((id) => retainedEntityIds.add(id));

  const staleEntities = previous.entities
    .filter((entity) => retainedEntityIds.has(entity.id))
    .map((entity) => stale(entity));
  const staleEvidence = previous.evidence
    .filter((item) => item.provenance.source && failedSources.has(item.provenance.source))
    .map((item) => stale(item));
  const staleSources = previous.sources
    .filter((source) => failedSources.has(source.source))
    .map((source) => ({ ...source, status: failedSourceStatuses.get(source.source) ?? "failed" }));
  const sources = uniqueById([
    ...refreshed.sources.filter((source) => !failedSources.has(source.source)).map((source) => ({ ...source, id: source.source })),
    ...staleSources.map((source) => ({ ...source, id: source.source })),
  ]).map(({ id: _id, ...source }) => source);
  const entities = uniqueById([...staleEntities, ...refreshed.entities]);
  const relationships = uniqueById([
    ...staleRelationships.map(stale),
    ...refreshed.relationships,
  ]);
  const evidence = uniqueById([...staleEvidence, ...refreshed.evidence]);
  const findings = uniqueById([...staleFindings.map(stale), ...refreshed.findings]);
  const identityClusters = uniqueById([
    ...previous.identityClusters.filter((cluster) => cluster.entityIds.some((id) => retainedEntityIds.has(id))),
    ...refreshed.identityClusters,
  ]);

  return {
    ...refreshed,
    entities,
    relationships,
    evidence,
    findings,
    sources,
    identityClusters,
    summary: {
      ...refreshed.summary,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      evidenceCount: evidence.length,
      findingCount: findings.length,
      availableSourceCount: sources.filter((source) => source.status === "available").length,
      partialSourceCount: sources.filter((source) => source.status !== "available").length,
      status: sources.every((source) => source.status === "available") ? "success" : "partial-success",
    },
  };
}

export function summarizeEntityChanges(
  previous: EngineeringIntelligenceInvestigationV1 | undefined,
  current: EngineeringIntelligenceInvestigationV1 | undefined,
): EntityChangeSummary {
  const previousEntities = new Map((previous?.entities ?? []).map((entity) => [entity.id, entity]));
  const currentEntities = new Map((current?.entities ?? []).map((entity) => [entity.id, entity]));
  const changedEntityIds = [...currentEntities.keys()].filter((id) => {
    const oldEntity = previousEntities.get(id);
    return oldEntity !== undefined && JSON.stringify(oldEntity) !== JSON.stringify(currentEntities.get(id));
  });
  return {
    changedEntityIds: changedEntityIds.sort(),
    addedEntityIds: [...currentEntities.keys()].filter((id) => !previousEntities.has(id)).sort(),
    removedEntityIds: [...previousEntities.keys()].filter((id) => !currentEntities.has(id)).sort(),
  };
}