import { ENGINEERING_INTELLIGENCE_CONTRACT_VERSION, type EngineeringIntelligenceInvestigationV1, type EngineeringProvenance, type IntelligenceEntity, type IntelligenceProperty, type IntelligenceRelationship, type TemporalContext } from "../contracts/intelligence-v1";

type RecordValue = Record<string, unknown>;
type StandardExtractionResult = {
  sourceExecutionId?: string;
  status?: string;
  evidence?: {
    requirement?: RecordValue;
    sourceContext?: RecordValue;
    hierarchy?: RecordValue;
    catalog?: RecordValue;
  };
  provenance?: RecordValue;
};

const record = (value: unknown): RecordValue | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
const text = (value: unknown): string | undefined => value === null || value === undefined ? undefined : String(value).trim() || undefined;
const number = (value: unknown): number | undefined => typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : undefined;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [];
const property = (value: unknown): IntelligenceProperty | undefined => {
  if (typeof value === "boolean") return { type: "boolean", boolean: value };
  if (typeof value === "number") return { type: "number", number: value };
  if (Array.isArray(value)) return { type: "list", items: strings(value) };
  const resolved = text(value);
  return resolved ? { type: "text", text: resolved } : undefined;
};
const properties = (values: RecordValue): Record<string, IntelligenceProperty> => Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
  const resolved = property(value);
  return resolved ? [[key, resolved]] : [];
}));
const idPart = (value: unknown) => encodeURIComponent(text(value) ?? "unknown").replace(/%/g, "_");

function extractionFromPayload(payload: unknown): StandardExtractionResult | undefined {
  const resolved = record(payload);
  const intelligence = record(resolved?.intelligencePayload);
  if (!intelligence || !record(intelligence.evidence)?.requirement) return undefined;
  return intelligence as StandardExtractionResult;
}

export function isCodebeamerResolvedEvidence(payload: unknown): boolean {
  return Boolean(extractionFromPayload(payload));
}

export function projectCodebeamerIntelligence(investigationId: string, payload: unknown, observedAt: string): EngineeringIntelligenceInvestigationV1 | undefined {
  const extraction = extractionFromPayload(payload);
  if (!extraction) return undefined;
  const evidence = extraction.evidence ?? {};
  const requirement = evidence.requirement ?? {};
  const context = evidence.sourceContext ?? {};
  const hierarchy = evidence.hierarchy ?? {};
  const catalog = evidence.catalog ?? {};
  const canonicalId = text(requirement.canonicalId) ?? `codebeamer:requirement:${text(requirement.itemId) ?? "unknown"}`;
  const itemId = text(requirement.itemId);
  const externalKey = text(requirement.externalKey);
  const displayName = text(requirement.name) ?? externalKey ?? itemId ?? "Codebeamer requirement";
  const capturedAt = text(catalog.synchronizedAt) ?? text(extraction.provenance?.observedAt) ?? observedAt;
  const assembledAt = new Date().toISOString();
  const stale = requirement.stale === true;
  const temporal: TemporalContext = { capturedAt, assembledAt, freshness: stale ? "stale" : "current" };
  const provenance: EngineeringProvenance = {
    source: "codebeamer",
    provider: text(extraction.provenance?.provider) ?? "codebeamer_extractor",
    nativeId: itemId,
    nativeRevision: text(requirement.version),
    sourceExecutionId: extraction.sourceExecutionId,
    artifactReference: canonicalId,
    observedAt: capturedAt,
    authority: "source-authoritative",
  };
  const evidenceId = `evidence:${canonicalId}`;
  const subjectId = `investigation-subject:${canonicalId}`;
  const projectId = text(context.projectId);
  const projectName = text(context.projectName);
  const trackerId = text(context.trackerId);
  const trackerName = text(context.trackerName);
  const parentName = text(hierarchy.parentName);
  const childNames = strings(hierarchy.childNames);
  const projectEntityId = projectId ? `codebeamer:project:${idPart(projectId)}` : undefined;
  const trackerEntityId = trackerId ? `codebeamer:tracker:${idPart(trackerId)}` : undefined;
  const parentEntityId = parentName ? `codebeamer:requirement-context:${idPart(parentName)}` : undefined;

  const entities: IntelligenceEntity[] = [{
    id: canonicalId,
    kind: "requirement",
    displayName,
    identityQuality: "native",
    assertion: "fact",
    properties: properties({
      canonicalId, itemId, externalKey, description: requirement.description, status: requirement.status,
      priority: requirement.priority, categories: requirement.categories, severities: requirement.severities,
      version: requirement.version, stale, projectId, projectName, trackerId, trackerName,
      parentName, childNames, catalogRevision: catalog.revision, catalogStatus: catalog.status,
      catalogSynchronizedAt: catalog.synchronizedAt, catalogRequirementCount: catalog.requirementCount,
      sourceExecutionId: extraction.sourceExecutionId,
      presentationRole: "selected-requirement",
      requirementId: externalKey ?? itemId,
    }),
    provenance,
    temporal,
  }];
  if (projectEntityId) entities.push({ id: projectEntityId, kind: "product-context", displayName: projectName ?? `Project ${projectId}`, identityQuality: "native", assertion: "fact", properties: properties({ projectId, projectName, presentationRole: "project" }), provenance: { ...provenance, nativeId: projectId, artifactReference: projectEntityId }, temporal });
  if (trackerEntityId) entities.push({ id: trackerEntityId, kind: "source-representation", displayName: trackerName ?? `Tracker ${trackerId}`, identityQuality: "native", assertion: "fact", properties: properties({ trackerId, trackerName, projectId, presentationRole: "tracker" }), provenance: { ...provenance, nativeId: trackerId, artifactReference: trackerEntityId }, temporal });
  if (parentEntityId) entities.push({ id: parentEntityId, kind: "requirement", displayName: parentName!, identityQuality: "deterministic-derived", assertion: "fact", properties: properties({ relationshipContext: "parent", selectedRequirementId: canonicalId, presentationRole: "parent-requirement" }), provenance: { ...provenance, nativeId: undefined, artifactReference: parentEntityId }, temporal });
  const childEntityIds = childNames.map((name, index) => `codebeamer:requirement-context:${idPart(name)}:${index}`);
  childNames.forEach((name, index) => entities.push({ id: childEntityIds[index], kind: "requirement", displayName: name, identityQuality: "deterministic-derived", assertion: "fact", properties: properties({ relationshipContext: "child", selectedRequirementId: canonicalId, presentationRole: "child-requirement" }), provenance: { ...provenance, nativeId: undefined, artifactReference: childEntityIds[index] }, temporal }));

  const relationships: IntelligenceRelationship[] = [];
  const relation = (id: string, kind: string, sourceEntityId: string, targetEntityId: string, family: string, label: string) => relationships.push({ id, kind, family, sourceEntityId, targetEntityId, assertion: "fact", confidence: "verified", evidenceIds: [evidenceId], properties: properties({ label }), provenance, temporal });
  if (projectEntityId && trackerEntityId) relation(`rel:${projectEntityId}:contains:${trackerEntityId}`, "contains", projectEntityId, trackerEntityId, "source-context", "contains tracker");
  if (trackerEntityId) relation(`rel:${trackerEntityId}:manages:${parentEntityId ?? canonicalId}`, "manages", trackerEntityId, parentEntityId ?? canonicalId, "requirements", parentEntityId ? "manages requirement hierarchy" : "manages requirement");
  if (parentEntityId) relation(`rel:${parentEntityId}:parent-of:${canonicalId}`, "parent-of", parentEntityId, canonicalId, "requirements", "parent of");
  childEntityIds.forEach((childId) => relation(`rel:${canonicalId}:parent-of:${childId}`, "parent-of", canonicalId, childId, "requirements", "parent of"));
  relation(`rel:${subjectId}:represented-by:${canonicalId}`, "represented-by", subjectId, canonicalId, "identity", "represented by selected Codebeamer requirement");

  return {
    contractVersion: ENGINEERING_INTELLIGENCE_CONTRACT_VERSION,
    investigationId,
    subject: { id: subjectId, displayName, preferredProductId: externalKey ?? itemId, candidateIds: [canonicalId], confidence: "verified", reasons: ["Selected Codebeamer requirement resolved from the synchronized source catalog."], provenance: { ...provenance, artifactReference: subjectId }, temporal },
    entities,
    relationships,
    evidence: [{ id: evidenceId, kind: "source-extraction", summary: `Codebeamer requirement ${displayName} with project, tracker and hierarchy context.`, source: "codebeamer", provenance, temporal }],
    findings: [],
    sources: [{ entityId: canonicalId, source: "codebeamer", status: extraction.status === "partial-success" ? "partial" : "available", provenance }],
    identityClusters: [{ id: `identity:${canonicalId}`, preferredEntityId: canonicalId, entityIds: [canonicalId], confidence: "verified", reasons: ["Canonical Codebeamer item identity."], evidenceIds: [evidenceId] }],
    temporal,
    summary: { entityCount: entities.length, relationshipCount: relationships.length, evidenceCount: 1, findingCount: 0, availableSourceCount: 1, partialSourceCount: extraction.status === "partial-success" ? 1 : 0, status: extraction.status === "partial-success" ? "partial" : "available" },
  };
}
