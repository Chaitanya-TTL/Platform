import type { CanonicalEntity, CanonicalGraphFixture, CanonicalRelationship, Domain, EntityId, EvidenceClass } from "@lattice-lab/contracts/canonical-graph";

export const ALL_DOMAINS: Domain[] = ["product", "plm", "erp", "cpq", "requirements", "change", "document", "supplier", "manufacturing", "source", "data"];
export const ALL_EVIDENCE: EvidenceClass[] = ["authoritative-source-fact", "deterministic-calculation", "verified-cross-reference", "heuristic-match", "user-approved-link", "inferred-relationship", "simulated-test-data", "unavailable-evidence"];

const domainAngles: Record<Domain, number> = {
  product: -Math.PI / 2, plm: Math.PI, erp: 0, cpq: Math.PI / 3,
  requirements: -Math.PI / 3, change: -2 * Math.PI / 3, document: 2 * Math.PI / 3,
  supplier: Math.PI / 2, manufacturing: Math.PI / 6, source: 5 * Math.PI / 6, data: 3 * Math.PI / 4,
};

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(result);
}

export function stablePosition(entity: CanonicalEntity, focusId: EntityId) {
  if (entity.id === focusId) return { x: 0, y: 0 };
  const angle = domainAngles[entity.domain] + ((hash(entity.id) % 17) - 8) * 0.045;
  const kindOffset = entity.kind === "assembly" ? 260 : entity.kind === "occurrence" ? 420 : 560;
  const radius = kindOffset + (hash(entity.id) % 4) * 105;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

export function neighborhood(graph: CanonicalGraphFixture, seed: EntityId, hops = 1) {
  const ids = new Set<EntityId>([seed]);
  for (let hop = 0; hop < hops; hop += 1) {
    const snapshot = new Set(ids);
    for (const relationship of graph.relationships) {
      if (snapshot.has(relationship.sourceId) || snapshot.has(relationship.targetId)) {
        ids.add(relationship.sourceId); ids.add(relationship.targetId);
      }
    }
  }
  return ids;
}

export function projectGraph(
  graph: CanonicalGraphFixture,
  visibleIds: Set<EntityId>,
  domains: Set<Domain>,
  evidence: Set<EvidenceClass>,
) {
  const entities = graph.entities.filter((entity) => visibleIds.has(entity.id) && domains.has(entity.domain) && evidence.has(entity.evidenceClass));
  const allowed = new Set(entities.map((entity) => entity.id));
  const relationships = graph.relationships.filter((relationship) => allowed.has(relationship.sourceId) && allowed.has(relationship.targetId) && evidence.has(relationship.evidenceClass));
  return { entities, relationships };
}

export function connectedEntities(graph: CanonicalGraphFixture, entityId: EntityId) {
  const ids = new Set<EntityId>();
  for (const relationship of graph.relationships) {
    if (relationship.sourceId === entityId) ids.add(relationship.targetId);
    if (relationship.targetId === entityId) ids.add(relationship.sourceId);
  }
  return ids;
}

export function relationshipLabel(relationship: CanonicalRelationship) {
  return relationship.kind.replaceAll("-", " ");
}
