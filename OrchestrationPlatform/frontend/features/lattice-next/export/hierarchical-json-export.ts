import type { EngineeringEntity, InvestigationGraph } from "../domain/model";
import { INTELLIGENCE_DOMAINS, domainForEntity } from "../projection/intelligence-domain-registry";

const safeName = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "lattice";
const keyOf = (entity: EngineeringEntity) => String(entity.attributes.attributeKey ?? entity.attributes.key ?? entity.name).toLowerCase().replace(/[^a-z0-9]/g, "");
const allowedMovementFields = new Set(["quantity", "quantitychange", "movementtype", "type", "inventoryvalue", "inventorychangevalue"]);
const normalizedAttributes = (entity: EngineeringEntity) => Object.fromEntries(Object.entries(entity.attributes).map(([key, value]) => [key, key.toLowerCase() === "value" && typeof value === "string" ? value.replace(/\s*\(Design\)\s*$/i, "").trim() : value]));
const displayLabel = (entity: EngineeringEntity, sapChanges: EngineeringEntity[], windchillChanges: EngineeringEntity[]) => {
  const kind = entity.canonicalKind ?? entity.kind;
  if (kind === "material-movement") return `Manufacturing Change ${sapChanges.findIndex((item) => item.id === entity.id) + 1}`;
  if (entity.source === "windchill" && ["change-notice", "change-task"].includes(kind)) return `Engineering Change ${windchillChanges.findIndex((item) => item.id === entity.id) + 1}`;
  const key = keyOf(entity);
  if (entity.source === "sap" && kind === "sap-field") {
    if (["quantity", "quantitychange"].includes(key)) return "Quantity Change";
    if (["movementtype", "type"].includes(key)) return "Type";
    if (["inventoryvalue", "inventorychangevalue"].includes(key)) return "Inventory Change Value";
  }
  return entity.name;
};

export function buildHierarchicalLatticeExport(graph: InvestigationGraph) {
  const subject = graph.entities.find((entity) => entity.kind === "identity") ?? graph.byId[graph.roots[0]];
  const contains = graph.relationships.filter((relationship) => relationship.kind === "contains");
  const parentByChild = new Map(contains.map((relationship) => [relationship.to, relationship.from]));
  const children = new Map<string, string[]>();
  for (const relationship of contains) children.set(relationship.from, [...(children.get(relationship.from) ?? []), relationship.to]);
  const sapChanges = graph.entities.filter((entity) => entity.source === "sap" && (entity.canonicalKind ?? entity.kind) === "material-movement").sort((a, b) => a.id.localeCompare(b.id));
  const windchillChanges = graph.entities.filter((entity) => entity.source === "windchill" && ["change-notice", "change-task"].includes(entity.canonicalKind ?? entity.kind)).sort((a, b) => a.id.localeCompare(b.id));
  const explicit = new Map(graph.entities.map((entity) => [entity.id, domainForEntity(entity.canonicalKind ?? entity.kind)]));
  const resolveDomain = (id: string, seen = new Set<string>()): string | undefined => { if (explicit.get(id)) return explicit.get(id); if (seen.has(id)) return undefined; seen.add(id); const parent = parentByChild.get(id); return parent ? resolveDomain(parent, seen) : undefined; };
  const domainById = new Map(graph.entities.map((entity) => [entity.id, resolveDomain(entity.id)]));
  const include = (entity: EngineeringEntity) => {
    const parent = parentByChild.get(entity.id); const parentEntity = parent ? graph.byId[parent] : undefined;
    return !(parentEntity?.source === "sap" && (parentEntity.canonicalKind ?? parentEntity.kind) === "material-movement" && !allowedMovementFields.has(keyOf(entity)));
  };
  const entityJson = (entity: EngineeringEntity, memberIds: Set<string>, seen = new Set<string>()): Record<string, unknown> | null => {
    if (seen.has(entity.id) || !include(entity)) return null; const next = new Set(seen).add(entity.id);
    return { id: entity.id, label: displayLabel(entity, sapChanges, windchillChanges), source: entity.source, kind: entity.canonicalKind ?? entity.kind, nativeIdentifier: entity.sourceNodeId, attributes: normalizedAttributes(entity), children: (children.get(entity.id) ?? []).filter((id) => memberIds.has(id)).map((id) => entityJson(graph.byId[id], memberIds, next)).filter(Boolean) };
  };
  const domains = INTELLIGENCE_DOMAINS.map((definition) => {
    const members = graph.entities.filter((entity) => entity.id !== subject?.id && domainById.get(entity.id) === definition.id && include(entity));
    if (!members.length) return null; const memberIds = new Set(members.map((entity) => entity.id));
    const roots = members.filter((entity) => !memberIds.has(parentByChild.get(entity.id) ?? ""));
    return { id: `projection:domain:${definition.id}`, label: definition.title, children: roots.map((entity) => entityJson(entity, memberIds)).filter(Boolean) };
  }).filter(Boolean);
  return { subject: subject ? { id: subject.id, label: subject.name, source: subject.source, domains } : null, relationships: graph.relationships.map((relationship) => ({ id: relationship.id, source: relationship.from, target: relationship.to, kind: relationship.kind, label: relationship.label, confidence: relationship.confidence })), metadata: { exportedAt: new Date().toISOString(), investigationId: graph.metadata?.investigationId, contractVersion: graph.metadata?.contractVersion, sources: [...new Set(graph.entities.map((entity) => entity.source).filter((source) => !["platform", "unified"].includes(source)))].sort() } };
}
export function downloadHierarchicalLatticeJson(graph: InvestigationGraph) {
  const blob = new Blob([JSON.stringify(buildHierarchicalLatticeExport(graph), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); const subject = graph.roots[0] ? graph.byId[graph.roots[0]]?.name : "lattice";
  anchor.href = url; anchor.download = `${safeName(subject ?? "lattice")}-lattice-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}
