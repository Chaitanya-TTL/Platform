import type { CanonicalGraphFixture, Domain, EntityId, EvidenceClass, RelationshipId } from "@lattice-lab/contracts/canonical-graph";

export const DOMAINS: Domain[] = ["product", "plm", "erp", "cpq", "requirements", "change", "document", "supplier", "manufacturing", "source", "data"];
export const EVIDENCE: EvidenceClass[] = ["authoritative-source-fact", "deterministic-calculation", "verified-cross-reference", "heuristic-match", "user-approved-link", "inferred-relationship", "simulated-test-data", "unavailable-evidence"];

export function firstDegree(graph: CanonicalGraphFixture, id: EntityId) {
  const result = new Set<EntityId>([id]);
  for (const edge of graph.relationships) {
    if (edge.sourceId === id) result.add(edge.targetId);
    if (edge.targetId === id) result.add(edge.sourceId);
  }
  return result;
}

export function project(graph: CanonicalGraphFixture, visible: Set<EntityId>, domains: Set<Domain>, evidence: Set<EvidenceClass>) {
  const entities = graph.entities.filter((entity) => visible.has(entity.id) && domains.has(entity.domain) && evidence.has(entity.evidenceClass));
  const ids = new Set(entities.map((entity) => entity.id));
  const relationships = graph.relationships.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId) && evidence.has(edge.evidenceClass));
  return { entities, relationships };
}

export function connected(graph: CanonicalGraphFixture, id: EntityId) {
  return graph.relationships.filter((edge) => edge.sourceId === id || edge.targetId === id);
}

export function shortestEvidencePath(graph: CanonicalGraphFixture, start: EntityId, target: EntityId): RelationshipId[] {
  const preferred = new Set(["satisfies", "represented-in", "has-movement", "posted-through"]);
  const distances = new Map<EntityId, number>([[start, 0]]);
  const previous = new Map<EntityId, { node: EntityId; edge: RelationshipId }>();
  const pending = new Set(graph.entities.map((entity) => entity.id));
  while (pending.size) {
    let current: EntityId | null = null;
    let best = Number.POSITIVE_INFINITY;
    pending.forEach((id) => { const distance = distances.get(id) ?? Number.POSITIVE_INFINITY; if (distance < best) { best = distance; current = id; } });
    if (!current || current === target) break;
    pending.delete(current);
    for (const edge of connected(graph, current)) {
      const next = edge.sourceId === current ? edge.targetId : edge.sourceId;
      if (!pending.has(next)) continue;
      const score = best + (preferred.has(edge.kind) ? 1 : 15);
      if (score < (distances.get(next) ?? Number.POSITIVE_INFINITY)) { distances.set(next, score); previous.set(next, { node: current, edge: edge.id }); }
    }
  }
  const path: RelationshipId[] = [];
  let cursor = target;
  while (cursor !== start) { const step = previous.get(cursor); if (!step) return []; path.unshift(step.edge); cursor = step.node; }
  return path;
}
