import type { TreeNodeData } from "@/types/bom-comparison";
import type { LatticeHandoff } from "../contracts/handoff";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity, IntelligenceRelationship } from "../contracts/intelligence-v1";

const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const property = (value: unknown) => typeof value === "number" ? { type: "number", number: value } : typeof value === "boolean" ? { type: "boolean", boolean: value } : { type: "text", text: String(value) };

export function legacyHandoffToIntelligence(handoff: LatticeHandoff): EngineeringIntelligenceInvestigationV1 {
  const assembledAt = handoff.createdAt;
  const temporal = { assembledAt, capturedAt: handoff.createdAt, freshness: "unknown" as const };
  const subjectId = `subject:${normalize(handoff.subjectLabel) || handoff.handoffId}`;
  const entities: IntelligenceEntity[] = [];
  const relationships: IntelligenceRelationship[] = [];
  const sources: EngineeringIntelligenceInvestigationV1["sources"] = [];
  const clusters: EngineeringIntelligenceInvestigationV1["identityClusters"] = [];

  const visit = (source: LatticeHandoff["sources"][number], node: TreeNodeData, path: number[], parent?: string) => {
    const id = `${source.source}:${path.join(".")}:${node.id}`;
    const provenance = { source: source.source === "excel" ? undefined : source.source, provider: source.label, nativeId: node.id, sourceExecutionId: source.jobId, observedAt: source.capturedAt ?? handoff.createdAt, authority: "source-authoritative" as const };
    entities.push({ id, kind: node.children?.length ? "assembly" : "part-occurrence", displayName: node.name, identityQuality: "deterministic-derived", assertion: "fact", properties: Object.fromEntries(Object.entries(node.attributes ?? {}).map(([key, value]) => [key, property(value)])), provenance, temporal });
    if (parent) relationships.push({ id: `contains:${parent}:${id}`, kind: "contains", family: "structure", sourceEntityId: parent, targetEntityId: id, assertion: "fact", evidenceIds: [], properties: {}, provenance, temporal });
    node.children?.forEach((child, index) => visit(source, child, [...path, index], id));
    return id;
  };

  handoff.sources.forEach((source, sourceIndex) => {
    const rootId = visit(source, source.root, [sourceIndex]);
    const provenance = entities.find((entity) => entity.id === rootId)!.provenance;
    relationships.push({ id: `represented:${subjectId}:${rootId}`, kind: "represented-by", family: "correspondence", sourceEntityId: subjectId, targetEntityId: rootId, assertion: "fact", evidenceIds: [], properties: {}, provenance, temporal });
    sources.push({ entityId: rootId, source: source.source, status: source.completeness === "complete" ? "available" : "partial", provenance });
    clusters.push({ id: `cluster:${normalize(source.nativeId ?? source.root.id)}`, preferredEntityId: subjectId, entityIds: [subjectId, rootId], confidence: source.nativeId ? "deterministic" : "probable", reasons: [source.nativeId ? "legacy native identifier" : "legacy selected representation"], evidenceIds: [] });
  });

  const provenance = { provider: "legacy-handoff-compatibility", nativeId: handoff.subjectLabel, observedAt: handoff.createdAt, authority: "frontend-derived" as const };
  return { contractVersion: "1.0", investigationId: handoff.handoffId, subject: { id: subjectId, displayName: handoff.subjectLabel, preferredProductId: handoff.subjectLabel, candidateIds: handoff.sources.map((source) => source.nativeId).filter((id): id is string => Boolean(id)).sort(), confidence: "deterministic", reasons: ["legacy handoff compatibility"], provenance, temporal }, entities, relationships, evidence: [], findings: [], sources, identityClusters: clusters, temporal, summary: { entityCount: entities.length, relationshipCount: relationships.length, evidenceCount: 0, findingCount: 0, availableSourceCount: sources.filter((source) => source.status === "available").length, partialSourceCount: sources.filter((source) => source.status === "partial").length, status: sources.some((source) => source.status === "partial") ? "partial-success" : "success" } };
}
