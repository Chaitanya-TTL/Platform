import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity, IntelligenceProperty, IntelligenceRelationship } from "../contracts/intelligence-v1";

type Identifier = { family: string; value: string; property: string };
const approvedFamilies: ReadonlyArray<{ family: string; keys: RegExp }> = [
  { family: "part", keys: /(^|\.)(part(number|id)|item(number|id)|component(number|id))$/i },
  { family: "material", keys: /(^|\.)(material(number|id))$/i },
  { family: "product", keys: /(^|\.)(product(number|id|code)|model(number|id|code))$/i },
  { family: "configuration", keys: /(^|\.)(feature(code|id)|option(code|id)|configuration(code|id))$/i },
  { family: "document", keys: /(^|\.)(document(number|id)|external(key|id)|reference(number|id))$/i },
];
const values = (property: IntelligenceProperty): string[] => [
  property.text,
  property.reference,
  typeof property.number === "number" ? String(property.number) : undefined,
  ...(property.items ?? []),
].filter((item): item is string => Boolean(item?.trim()));
const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");
const identifiers = (entity: IntelligenceEntity): Identifier[] => Object.entries(entity.properties).flatMap(([key, property]) => {
  const family = approvedFamilies.find((candidate) => candidate.keys.test(key));
  return family ? values(property).map((value) => ({ family: family.family, value: normalize(value), property: key })).filter((item) => item.value.length >= 3) : [];
});
const source = (entity: IntelligenceEntity) => entity.provenance.source ?? "platform";
const relationshipKind = (requirement: IntelligenceEntity, target: IntelligenceEntity): string => {
  if (requirement.kind !== "requirement") return "corresponds-to";
  if (["configuration-feature", "configuration-option", "configuration-family"].includes(target.kind)) return "constrains";
  if (["document", "requirement", "requirement-revision"].includes(target.kind)) return "traced-to";
  return "allocated-to";
};
export function resolveCrossSourceRelationships(input: EngineeringIntelligenceInvestigationV1): IntelligenceRelationship[] {
  const indexed = input.entities.map((entity) => ({ entity, identifiers: identifiers(entity) })).filter((item) => item.identifiers.length);
  const resolved: IntelligenceRelationship[] = [];
  for (let leftIndex = 0; leftIndex < indexed.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < indexed.length; rightIndex++) {
    const left = indexed[leftIndex], right = indexed[rightIndex];
    if (source(left.entity) === source(right.entity)) continue;
    const match = left.identifiers.find((a) => right.identifiers.some((b) => a.family === b.family && a.value === b.value));
    if (!match) continue;
    const requirement = left.entity.kind === "requirement" ? left.entity : right.entity.kind === "requirement" ? right.entity : undefined;
    if (!requirement) continue;
    const target = requirement.id === left.entity.id ? right.entity : left.entity;
    const proof = right.identifiers.find((item) => item.family === match.family && item.value === match.value)!;
    const evidenceIds = [...new Set([
      ...input.relationships.filter((item) => item.sourceEntityId === requirement.id || item.targetEntityId === requirement.id).flatMap((item) => item.evidenceIds),
      ...input.relationships.filter((item) => item.sourceEntityId === target.id || item.targetEntityId === target.id).flatMap((item) => item.evidenceIds),
    ])];
    const id = `cross-source:${relationshipKind(requirement, target)}:${requirement.id}:${target.id}:${match.family}:${match.value}`;
    resolved.push({
      id,
      kind: relationshipKind(requirement, target),
      family: "cross-source",
      sourceEntityId: requirement.id,
      targetEntityId: target.id,
      assertion: "fact",
      confidence: "verified",
      evidenceIds,
      properties: {
        matchMethod: { type: "text", text: "explicit-shared-identifier" },
        identifierFamily: { type: "text", text: match.family },
        identifierValue: { type: "text", text: match.value },
        sourceProperty: { type: "text", text: match.property },
        targetProperty: { type: "text", text: proof.property },
      },
      provenance: { ...requirement.provenance, provider: "lattice-cross-source-resolver", artifactReference: id, authority: "backend-derived" },
      temporal: input.temporal,
    });
  }
  return [...new Map(resolved.map((item) => [item.id, item])).values()];
}
