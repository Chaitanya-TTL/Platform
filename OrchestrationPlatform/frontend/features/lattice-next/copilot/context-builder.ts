import type {
  EngineeringIntelligenceInvestigationV1,
  IntelligenceEntity,
} from "../contracts/intelligence-v1";
import type { InvestigationSnapshot, SourceExecutionSnapshot } from "../kernel/contracts/investigation-snapshot";
import type {
  CopilotCitation,
  CopilotConflictContext,
  CopilotContextPacket,
  CopilotEntityContext,
  CopilotEvidenceContext,
  CopilotFindingContext,
  CopilotRelationshipContext,
  CopilotSourceContext,
  CopilotUnresolvedEvaluationContext,
} from "./contracts";
import {
  parseRelationshipGuidance,
  selectRelationshipGuidance,
  type RelationshipApplicationPair,
} from "./relationship-guidance";

const DEFAULT_MAX_CHARS = 24_000;
const DEFAULT_MAX_ITEMS = 60;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_FIELD_CHARS = 1_200;

export interface ContextBuilderOptions {
  maxContextChars?: number;
  maxItemsPerCategory?: number;
  relationshipDocument?: string;
}

type Canonical = EngineeringIntelligenceInvestigationV1;
type CanonicalEvidence = Canonical["evidence"][number];
type CanonicalFinding = Canonical["findings"][number];
type RelationshipLike = {
  id: string;
  kind?: string;
  type?: string;
  family?: string;
  sourceEntityId: string;
  targetEntityId: string;
  evidenceIds?: readonly string[];
  evidenceId?: string;
  assertion?: string;
  status?: string;
  provenance?: { source?: string };
  confidence?: string;
};
type EvidenceLike = {
  id: string;
  kind?: string;
  summary?: string;
  reason?: string;
  source?: string;
  provenance?: { source?: string; observedAt?: string };
  temporal?: { capturedAt?: string; freshness?: string };
  evaluatedAt?: string;
};

function short(value: unknown, max = MAX_FIELD_CHARS): string {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function stableCitationId(kind: string, id: string): string {
  return `cite:${kind}:${encodeURIComponent(id)}`;
}

function isCanonical(value: unknown): value is Canonical {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Canonical>;
  return item.contractVersion === "1.0" && Array.isArray(item.entities) && Array.isArray(item.relationships);
}

function propertyText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return short(value, 300);
  if (!value || typeof value !== "object") return "";
  const property = value as Record<string, unknown>;
  if (typeof property.text === "string") return short(property.text, 300);
  if (typeof property.number === "number") return String(property.number);
  if (typeof property.boolean === "boolean") return String(property.boolean);
  if (typeof property.timestamp === "string") return short(property.timestamp, 100);
  if (typeof property.reference === "string") return short(property.reference, 300);
  if (Array.isArray(property.items)) return property.items.map((item) => short(item, 80)).join(", ").slice(0, 300);
  return "";
}

function normalizedEntity(entity: IntelligenceEntity): CopilotEntityContext {
  const source = entity.provenance.source;
  return {
    entityId: entity.id,
    citationId: stableCitationId("entity", entity.id),
    displayName: short(entity.displayName, 240),
    kind: short(entity.kind, 120),
    identityQuality: entity.identityQuality,
    ...(source ? { source } : {}),
    ...(entity.provenance.nativeId ? { nativeId: short(entity.provenance.nativeId, 300) } : {}),
    properties: Object.fromEntries(Object.entries(entity.properties ?? {})
      .map(([key, value]) => [short(key, 100), propertyText(value)])
      .filter(([, value]) => Boolean(value))
      .sort(([left], [right]) => left.localeCompare(right))),
    freshness: entity.temporal.freshness === "stale" ? "stale" : entity.temporal.freshness === "current" ? "current" : "unknown",
  };
}

function relevance(query: string, values: readonly string[]): number {
  const normalizedQuery = query.toLocaleLowerCase();
  const joined = values.join(" ").toLocaleLowerCase();
  if (!normalizedQuery.trim()) return 1;
  let score = 0;
  if (values.some((value) => value && normalizedQuery.includes(value.toLocaleLowerCase()))) score += 100;
  const terms = normalizedQuery.split(/[^a-z0-9]+/).filter((term) => term.length > 1);
  for (const term of terms) if (joined.includes(term)) score += Math.min(12, term.length);
  return score;
}

function identifierCandidates(message: string): string[] {
  const candidates = message.match(/\b(?:[A-Z]{1,12}(?:[-_:][A-Z0-9]+)+|[A-Za-z][A-Za-z0-9:._-]*\d[A-Za-z0-9:._-]*)\b/g) ?? [];
  return [...new Set(candidates.filter((candidate) => !["WINDCHILL", "TEAMCENTER", "CODEBEAMER", "CONFIGIT", "SAP"].includes(candidate.toUpperCase())))];
}

function containsExactIdentifier(message: string, identifier: string): boolean {
  const normalizedMessage = message.toLocaleLowerCase();
  const normalizedIdentifier = identifier.toLocaleLowerCase();
  let fromIndex = 0;
  while (fromIndex < normalizedMessage.length) {
    const index = normalizedMessage.indexOf(normalizedIdentifier, fromIndex);
    if (index < 0) return false;
    const before = normalizedMessage[index - 1];
    const after = normalizedMessage[index + normalizedIdentifier.length];
    if ((!before || !/[a-z0-9]/i.test(before)) && (!after || !/[a-z0-9]/i.test(after))) return true;
    fromIndex = index + normalizedIdentifier.length;
  }
  return false;
}

function latestExecution(executions: Readonly<Record<string, SourceExecutionSnapshot>>, source: string): SourceExecutionSnapshot | undefined {
  return Object.values(executions)
    .filter((execution) => execution.identity.source === source && execution.identity.operation === "gather-intelligence")
    .sort((left, right) => (right.completedAt ?? right.startedAt ?? "").localeCompare(left.completedAt ?? left.startedAt ?? ""))[0];
}

function sourceContext(snapshot: InvestigationSnapshot, canonical?: Canonical): CopilotSourceContext[] {
  const sources = [...new Set(snapshot.selections.map((selection) => selection.source))].sort();
  return sources.map((source) => {
    const selection = snapshot.selections.find((item) => item.source === source)!;
    const execution = latestExecution(snapshot.executions, source);
    const canonicalSource = canonical?.sources.find((item) => item.source === source);
    const sourceStatus = execution?.status ?? (canonicalSource?.status === "available" ? "succeeded" : canonicalSource?.status === "partial" ? "partial" : canonicalSource?.status === "failed" ? "failed" : canonicalSource?.status === "unavailable" ? "unavailable" : "not-started");
    const freshness = execution?.freshness ?? (canonical?.entities.some((entity) => entity.provenance.source === source && entity.temporal.freshness === "stale") ? "stale" : canonicalSource?.status === "available" ? "current" : "unknown");
    return {
      citationId: stableCitationId("source", source),
      source,
      nativeId: short(selection.nativeId, 300),
      displayName: short(selection.displayName, 240),
      status: sourceStatus,
      ...(execution?.capturedAt ? { capturedAt: execution.capturedAt } : {}),
      freshness: freshness === "current" ? "current" : freshness === "stale" ? "stale" : "unknown",
    };
  });
}

function relationshipList(canonical?: Canonical): RelationshipLike[] {
  if (!canonical) return [];
  const plm = canonical.plmBrain?.relationships.map((relationship) => ({
    id: relationship.id,
    type: relationship.type,
    kind: relationship.type,
    sourceEntityId: relationship.sourceEntityId,
    targetEntityId: relationship.targetEntityId,
    evidenceId: relationship.evidenceId,
    status: relationship.status,
  })) ?? [];
  const universal = canonical.universalRelationshipEvidence?.map((evidence) => ({
    id: evidence.id,
    kind: evidence.ruleId,
    type: evidence.ruleId,
    sourceEntityId: evidence.source.entityId,
    targetEntityId: evidence.target.entityId,
    evidenceId: evidence.id,
    status: evidence.status,
  })) ?? [];
  return [...canonical.relationships, ...plm, ...universal];
}

function evidenceList(canonical?: Canonical): EvidenceLike[] {
  if (!canonical) return [];
  const canonicalEvidence: EvidenceLike[] = canonical.evidence.map((item: CanonicalEvidence) => ({
    id: item.id,
    kind: item.kind,
    summary: item.summary,
    source: item.source,
    provenance: item.provenance,
    temporal: item.temporal,
  }));
  const plmEvidence: EvidenceLike[] = canonical.plmBrain?.evidence.map((item) => ({
    id: item.evidenceId,
    kind: "validated-relationship-evidence",
    summary: `${item.source.attributePath}=${item.source.value} -> ${item.target.attributePath}=${item.target.value}`,
    source: item.source.application,
    provenance: { source: item.source.application, observedAt: item.source.observedAt },
    evaluatedAt: item.evaluatedAt,
  })) ?? [];
  const universalEvidence: EvidenceLike[] = canonical.universalRelationshipEvidence?.map((item) => ({
    id: item.id,
    kind: item.mechanism,
    summary: item.reason,
    source: item.source.application,
    provenance: { source: item.source.application, observedAt: item.source.observedAt },
    evaluatedAt: item.evaluatedAt,
  })) ?? [];
  return [...canonicalEvidence, ...plmEvidence, ...universalEvidence]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
}

function normalizedEvidence(item: EvidenceLike): CopilotEvidenceContext {
  return {
    evidenceId: item.id,
    citationId: stableCitationId("evidence", item.id),
    kind: short(item.kind ?? "evidence", 120),
    summary: short(item.summary ?? item.reason ?? "Evidence summary unavailable."),
    ...(item.source ?? item.provenance?.source ? { source: item.source ?? item.provenance?.source } : {}),
    ...(item.temporal?.capturedAt ?? item.provenance?.observedAt ? { capturedAt: item.temporal?.capturedAt ?? item.provenance?.observedAt } : {}),
    freshness: item.temporal?.freshness === "stale" ? "stale" : item.temporal?.freshness === "current" ? "current" : "unknown",
  };
}

function normalizedRelationship(
  relation: RelationshipLike,
  entities: ReadonlyMap<string, CopilotEntityContext>,
  evidence: ReadonlyMap<string, CopilotEvidenceContext>,
  semanticGuidanceAvailable: boolean,
): CopilotRelationshipContext | undefined {
  const source = entities.get(relation.sourceEntityId);
  const target = entities.get(relation.targetEntityId);
  if (!source || !target) return undefined;
  const evidenceIds = [...(relation.evidenceIds ?? []), ...(relation.evidenceId ? [relation.evidenceId] : [])];
  return {
    relationshipId: relation.id,
    citationId: stableCitationId("relationship", relation.id),
    kind: short(relation.kind ?? relation.type ?? "relationship", 120),
    ...(relation.family ? { family: short(relation.family, 120) } : {}),
    sourceEntityId: relation.sourceEntityId,
    sourceCitationId: source.citationId,
    ...(source.nativeId ? { sourceNativeId: source.nativeId } : {}),
    targetEntityId: relation.targetEntityId,
    targetCitationId: target.citationId,
    ...(target.nativeId ? { targetNativeId: target.nativeId } : {}),
    evidenceCitationIds: evidenceIds.flatMap((id) => evidence.has(id) ? [evidence.get(id)!.citationId] : []),
    semanticGuidanceAvailable,
    identitySupported: source.identityQuality !== "provisional" && target.identityQuality !== "provisional",
    ...(relation.assertion ? { assertion: relation.assertion } : {}),
    ...(relation.status ? { status: relation.status } : {}),
    summary: `${source.displayName} (${source.source ?? "unknown source"}${source.nativeId ? `:${source.nativeId}` : ""}) ${short(relation.kind ?? relation.type ?? "relates to", 100)} ${target.displayName} (${target.source ?? "unknown source"}${target.nativeId ? `:${target.nativeId}` : ""})`,
  };
}

function normalizeFinding(finding: CanonicalFinding): CopilotFindingContext {
  return {
    findingId: finding.id,
    citationId: stableCitationId("finding", finding.id),
    kind: short(finding.kind, 100),
    title: short(finding.title, 240),
    summary: short(finding.summary),
    subjectEntityIds: [...finding.subjectEntityIds],
    evidenceCitationIds: finding.evidenceIds.map((id) => stableCitationId("evidence", id)),
  };
}

function conflictsFor(entities: readonly CopilotEntityContext[]): CopilotConflictContext[] {
  const values = new Map<string, Map<string, { entityId: string; source?: string; value: string }>>();
  for (const entity of entities) {
    for (const [property, value] of Object.entries(entity.properties)) {
      if (!value || !entity.source) continue;
      const key = property.toLocaleLowerCase();
      const group = values.get(key) ?? new Map<string, { entityId: string; source?: string; value: string }>();
      group.set(`${entity.source}:${value}`, { entityId: entity.entityId, source: entity.source, value });
      values.set(key, group);
    }
  }
  return [...values.entries()]
    .filter(([, group]) => new Set([...group.values()].map((value) => value.source)).size > 1 && new Set([...group.values()].map((value) => value.value)).size > 1)
    .map(([property, group]) => ({ property, values: [...group.values()].sort((left, right) => `${left.source}:${left.entityId}`.localeCompare(`${right.source}:${right.entityId}`)) }))
    .sort((left, right) => left.property.localeCompare(right.property));
}

function unresolvedEvaluations(
  canonical: Canonical | undefined,
  documentedPairs: ReadonlySet<string>,
): CopilotUnresolvedEvaluationContext[] {
  return (canonical?.universalRelationshipEvaluations ?? [])
    .filter((evaluation) => evaluation.status === "unresolved")
    .map((evaluation) => ({
      citationId: stableCitationId("evaluation", `${evaluation.ruleId}:${evaluation.evaluatedAt}`),
      ruleId: evaluation.ruleId,
      relationshipType: evaluation.relationshipType,
      sourceApplication: evaluation.sourceApplication,
      targetApplication: evaluation.targetApplication,
      semanticGuidanceAvailable: documentedPairs.has(applicationPairKey(evaluation.sourceApplication, evaluation.targetApplication)),
      reasonCode: evaluation.reasonCode,
      reason: short(evaluation.reason),
      sourceEntityIds: evaluation.sourceCandidates.map((candidate) => candidate.entityId),
      targetEntityIds: evaluation.targetCandidates.map((candidate) => candidate.entityId),
      evidenceCitationIds: evaluation.evidenceIds.map((id) => stableCitationId("evidence", id)),
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

function applicationPairKey(sourceApplication: string, targetApplication: string): string {
  return `${sourceApplication.trim().replace(/\s+/g, " ").toLocaleLowerCase()}\u0000${targetApplication.trim().replace(/\s+/g, " ").toLocaleLowerCase()}`;
}

function orderRelationshipsFromFocus(
  relationships: readonly { relation: RelationshipLike; score: number }[],
  focalEntityId?: string,
): { relation: RelationshipLike; score: number; distance: number }[] {
  if (!focalEntityId) {
    return relationships.map((item) => ({ ...item, distance: 0 }));
  }

  const relationshipsByEntity = new Map<string, typeof relationships[number][]>();
  for (const item of relationships) {
    for (const entityId of [item.relation.sourceEntityId, item.relation.targetEntityId]) {
      const connected = relationshipsByEntity.get(entityId) ?? [];
      connected.push(item);
      relationshipsByEntity.set(entityId, connected);
    }
  }

  const distances = new Map<string, number>([[focalEntityId, 0]]);
  const selected = new Map<string, { relation: RelationshipLike; score: number; distance: number }>();
  const queue = [focalEntityId];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const currentEntityId = queue[cursor];
    const distance = distances.get(currentEntityId)!;
    for (const item of relationshipsByEntity.get(currentEntityId) ?? []) {
      if (selected.has(item.relation.id)) continue;
      selected.set(item.relation.id, { ...item, distance });
      const connectedEntityId = item.relation.sourceEntityId === currentEntityId
        ? item.relation.targetEntityId
        : item.relation.sourceEntityId;
      if (!distances.has(connectedEntityId)) {
        distances.set(connectedEntityId, distance + 1);
        queue.push(connectedEntityId);
      }
    }
  }

  return [...selected.values()].sort((left, right) => (
    left.distance - right.distance || right.score - left.score || left.relation.id.localeCompare(right.relation.id)
  ));
}

function citationsFor(
  sourceSelections: readonly CopilotSourceContext[],
  unresolvedEvaluations: readonly CopilotUnresolvedEvaluationContext[],
  entities: readonly CopilotEntityContext[],
  relationships: readonly CopilotRelationshipContext[],
  findings: readonly CopilotFindingContext[],
  evidence: readonly CopilotEvidenceContext[],
): CopilotCitation[] {
  const sourceCitations: CopilotCitation[] = sourceSelections.map((selection) => ({
    citationId: selection.citationId,
    kind: "source",
    label: `${selection.source} source status`,
    source: selection.source,
    nativeId: selection.nativeId,
    summary: `Status: ${selection.status}; freshness: ${selection.freshness}${selection.capturedAt ? `; captured at: ${selection.capturedAt}` : ""}. The snapshot does not establish why this status occurred.`,
  }));
  const evaluationCitations: CopilotCitation[] = unresolvedEvaluations.map((evaluation) => ({
    citationId: evaluation.citationId,
    kind: "evaluation",
    label: `${evaluation.relationshipType} unresolved`,
    summary: `${evaluation.ruleId}: ${evaluation.reasonCode}. ${evaluation.reason} Evidence IDs: ${evaluation.evidenceCitationIds.length ? evaluation.evidenceCitationIds.join(", ") : "none"}.`,
  }));
  const entityCitations: CopilotCitation[] = entities.map((entity) => ({
    citationId: entity.citationId,
    kind: "entity",
    label: entity.displayName,
    ...(entity.source ? { source: entity.source } : {}),
    ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
    summary: `${entity.kind}: ${entity.displayName}`,
  }));
  const relationshipCitations: CopilotCitation[] = relationships.map((relationship) => ({
    citationId: relationship.citationId,
    kind: "relationship",
    label: relationship.kind,
    summary: relationship.summary,
  }));
  const findingCitations: CopilotCitation[] = findings.map((finding) => ({
    citationId: finding.citationId,
    kind: "finding",
    label: finding.title,
    summary: finding.summary,
  }));
  const evidenceCitations: CopilotCitation[] = evidence.map((item) => ({
    citationId: item.citationId,
    kind: "evidence",
    label: item.kind,
    ...(item.source ? { source: item.source } : {}),
    summary: item.summary,
  }));
  return [...sourceCitations, ...evaluationCitations, ...entityCitations, ...relationshipCitations, ...findingCitations, ...evidenceCitations]
    .sort((left, right) => left.citationId.localeCompare(right.citationId));
}

function buildUncertainties(
  hasCanonicalEvidence: boolean,
  partialSources: readonly string[],
  staleSources: readonly string[],
  conflicts: readonly CopilotConflictContext[],
  unsupportedIdentifiers: readonly string[],
): string[] {
  const values: string[] = [];
  if (!hasCanonicalEvidence) values.push("The active snapshot contains no canonical evidence summaries; do not state source facts as verified.");
  if (partialSources.length) values.push(`Source coverage is partial or unavailable for: ${partialSources.join(", ")}.`);
  if (staleSources.length) values.push(`Source values may be stale for: ${staleSources.join(", ")}.`);
  if (conflicts.length) values.push(`Conflicting source values were observed for: ${conflicts.map((conflict) => conflict.property).join(", ")}.`);
  if (unsupportedIdentifiers.length) values.push(`Requested identifier(s) were not found in the active snapshot: ${unsupportedIdentifiers.join(", ")}.`);
  return values;
}

export function buildInvestigationContext(
  snapshot: InvestigationSnapshot,
  userMessage: string,
  options: ContextBuilderOptions = {},
): CopilotContextPacket {
  const maxContextChars = Math.max(2_048, Math.min(80_000, Math.floor(options.maxContextChars ?? DEFAULT_MAX_CHARS)));
  const maxItems = Math.max(1, Math.min(200, Math.floor(options.maxItemsPerCategory ?? DEFAULT_MAX_ITEMS)));
  const message = short(userMessage.trim(), MAX_MESSAGE_CHARS);
  const canonical = isCanonical(snapshot.canonical?.value) ? snapshot.canonical.value : undefined;
  const selectedSources = sourceContext(snapshot, canonical).slice(0, 60);
  const allEntityContexts = (canonical?.entities ?? []).map(normalizedEntity);
  const entityById = new Map(allEntityContexts.map((entity) => [entity.entityId, entity]));
  const entitiesByRelevance = allEntityContexts.sort((left, right) => {
    const leftScore = relevance(message, [left.entityId, left.displayName, left.kind, left.source ?? "", left.nativeId ?? "", ...Object.entries(left.properties).flat()]);
    const rightScore = relevance(message, [right.entityId, right.displayName, right.kind, right.source ?? "", right.nativeId ?? "", ...Object.entries(right.properties).flat()]);
    return rightScore - leftScore || left.entityId.localeCompare(right.entityId);
  });
  const allEvidence = evidenceList(canonical).map(normalizedEvidence).sort((left, right) => {
    const leftScore = relevance(message, [left.evidenceId, left.kind, left.summary, left.source ?? ""]);
    const rightScore = relevance(message, [right.evidenceId, right.kind, right.summary, right.source ?? ""]);
    return rightScore - leftScore || left.evidenceId.localeCompare(right.evidenceId);
  });
  const allFindings = (canonical?.findings ?? []).map(normalizeFinding).sort((left, right) => {
    const leftScore = relevance(message, [left.findingId, left.title, left.summary, left.kind]);
    const rightScore = relevance(message, [right.findingId, right.title, right.summary, right.kind]);
    return rightScore - leftScore || left.findingId.localeCompare(right.findingId);
  });
  const scoredRelationships = relationshipList(canonical).map((relation) => ({
    relation,
    score: relevance(message, [relation.id, relation.kind ?? "", relation.type ?? "", relation.family ?? "", relation.sourceEntityId, relation.targetEntityId]),
  }));
  const focusEntity = allEntityContexts
    .filter((entity) => entity.nativeId && containsExactIdentifier(message, entity.nativeId))
    .sort((left, right) => (right.nativeId?.length ?? 0) - (left.nativeId?.length ?? 0) || left.entityId.localeCompare(right.entityId))[0]
    ?? entitiesByRelevance[0];
  const focalEntityId = focusEntity?.entityId;
  const allRelationships = orderRelationshipsFromFocus(scoredRelationships, focalEntityId);
  const relationshipSections = parseRelationshipGuidance(options.relationshipDocument ?? "");
  const relevantUnresolvedEvaluations = (canonical?.universalRelationshipEvaluations ?? [])
    .filter((evaluation) => evaluation.status === "unresolved")
    .filter((evaluation) => (
      !focalEntityId ||
      evaluation.sourceCandidates.some((candidate) => candidate.entityId === focalEntityId) ||
      evaluation.targetCandidates.some((candidate) => candidate.entityId === focalEntityId)
    ));
  const guidancePairs: RelationshipApplicationPair[] = [
    ...allRelationships.flatMap(({ relation }) => {
      const source = entityById.get(relation.sourceEntityId)?.source;
      const target = entityById.get(relation.targetEntityId)?.source;
      return source && target ? [{ sourceApplication: source, targetApplication: target }] : [];
    }),
    ...relevantUnresolvedEvaluations.map((evaluation) => ({
      sourceApplication: evaluation.sourceApplication,
      targetApplication: evaluation.targetApplication,
    })),
  ];
  const selectedGuidance = selectRelationshipGuidance(relationshipSections, guidancePairs);
  const guidanceByPair = new Map(selectedGuidance.map((section) => [
    applicationPairKey(section.sourceApplication, section.targetApplication),
    section,
  ]));
  const relationshipGuidance = [...new Set(guidancePairs.map((pair) => applicationPairKey(pair.sourceApplication, pair.targetApplication)))]
    .flatMap((key) => guidanceByPair.has(key) ? [guidanceByPair.get(key)!] : []);
  const documentedPairs = new Set(relationshipSections.map((section) => applicationPairKey(section.sourceApplication, section.targetApplication)));
  const relevantUnresolvedCitationIds = new Set(relevantUnresolvedEvaluations.map((evaluation) => (
    stableCitationId("evaluation", `${evaluation.ruleId}:${evaluation.evaluatedAt}`)
  )));
  const allUnresolved = unresolvedEvaluations(canonical, documentedPairs)
    .filter((evaluation) => !focalEntityId || relevantUnresolvedCitationIds.has(evaluation.citationId));
  const identifierCandidatesInQuestion = identifierCandidates(message);
  const knownIdentifiers = new Set<string>();
  for (const entity of allEntityContexts) {
    for (const value of [entity.entityId, entity.nativeId ?? "", entity.displayName, ...Object.values(entity.properties)]) {
      if (value) knownIdentifiers.add(value.toLocaleLowerCase());
    }
  }
  for (const selection of selectedSources) knownIdentifiers.add(selection.nativeId.toLocaleLowerCase());
  const unsupportedIdentifiers = identifierCandidatesInQuestion.filter((candidate) => !knownIdentifiers.has(candidate.toLocaleLowerCase()));
  const partialSources = [...new Set([
    ...snapshot.completeness.partialSources,
    ...snapshot.completeness.failedSources,
    ...selectedSources.filter((source) => ["partial", "failed", "unavailable", "timed-out"].includes(source.status)).map((source) => source.source),
  ])].sort();
  const staleSources = [...new Set([
    ...selectedSources.filter((source) => source.freshness === "stale").map((source) => source.source),
    ...allEntityContexts.filter((entity) => entity.freshness === "stale").flatMap((entity) => entity.source ? [entity.source] : []),
  ])].sort();
  const conflicts = conflictsFor(allEntityContexts);
  const hasCanonicalEvidence = allEvidence.length > 0;
  const base = {
    schemaVersion: "1.0" as const,
    investigationId: snapshot.identity.investigationId,
    snapshotRevision: snapshot.identity.revision,
    lifecycle: snapshot.lifecycle,
    subject: short(snapshot.subjectLabel, 300),
    userMessage: message,
    sourceSelections: selectedSources,
    grounding: { hasCanonicalEvidence, partialSources, staleSources, unsupportedIdentifiers },
  };

  const counts = {
    entities: Math.min(maxItems, entitiesByRelevance.length),
    relationships: Math.min(maxItems, allRelationships.length),
    evidence: Math.min(maxItems, allEvidence.length),
    findings: Math.min(maxItems, allFindings.length),
    unresolvedEvaluations: Math.min(maxItems, allUnresolved.length),
    sourceSelections: selectedSources.length,
    relationshipGuidance: Math.min(maxItems, relationshipGuidance.length),
  };
  const trimOrder: (keyof typeof counts)[] = ["relationships", "evidence", "findings", "unresolvedEvaluations", "entities", "sourceSelections", "relationshipGuidance"];

  const compose = (): CopilotContextPacket => {
    const selectedRelationshipCandidates: typeof allRelationships = [];
    const requiredEntityIds = new Set<string>();
    const requiredEvidenceIds = new Set<string>();
    for (const candidate of allRelationships) {
      if (selectedRelationshipCandidates.length >= counts.relationships) break;
      const { relation } = candidate;
      const source = entityById.get(relation.sourceEntityId);
      const target = entityById.get(relation.targetEntityId);
      if (!source || !target) continue;
      const relationshipEvidenceIds = [...new Set([...(relation.evidenceIds ?? []), ...(relation.evidenceId ? [relation.evidenceId] : [])])]
        .filter((id) => allEvidence.some((item) => item.evidenceId === id));
      const additionalEntities = [source.entityId, target.entityId].filter((id) => !requiredEntityIds.has(id));
      const additionalEvidence = relationshipEvidenceIds.filter((id) => !requiredEvidenceIds.has(id));
      if (requiredEntityIds.size + additionalEntities.length > counts.entities) continue;
      if (requiredEvidenceIds.size + additionalEvidence.length > counts.evidence) continue;
      selectedRelationshipCandidates.push(candidate);
      for (const id of [source.entityId, target.entityId]) requiredEntityIds.add(id);
      for (const id of relationshipEvidenceIds) requiredEvidenceIds.add(id);
    }
    const prioritizedEntities = [
      ...[...requiredEntityIds].map((id) => entityById.get(id)!).filter(Boolean),
      ...entitiesByRelevance.filter((entity) => !requiredEntityIds.has(entity.entityId)),
    ];
    const entities = prioritizedEntities.slice(0, counts.entities);
    const entitiesMap = new Map(entities.map((entity) => [entity.entityId, entity]));
    const prioritizedEvidence = [
      ...[...requiredEvidenceIds].map((id) => allEvidence.find((item) => item.evidenceId === id)!).filter(Boolean),
      ...allEvidence.filter((item) => !requiredEvidenceIds.has(item.evidenceId)),
    ];
    const evidence = prioritizedEvidence.slice(0, counts.evidence);
    const evidenceMap = new Map(evidence.map((item) => [item.evidenceId, item]));
    const selectedGuidance = relationshipGuidance.slice(0, counts.relationshipGuidance);
    const selectedGuidancePairs = new Set(selectedGuidance.map((section) => applicationPairKey(section.sourceApplication, section.targetApplication)));
    const relationships: CopilotRelationshipContext[] = selectedRelationshipCandidates
      .flatMap(({ relation }) => {
        const source = entityById.get(relation.sourceEntityId);
        const target = entityById.get(relation.targetEntityId);
        const semanticGuidanceAvailable = Boolean(source?.source && target?.source && selectedGuidancePairs.has(applicationPairKey(source.source, target.source)));
        const normalized = normalizedRelationship(relation, entitiesMap, evidenceMap, semanticGuidanceAvailable);
        return normalized ? [normalized] : [];
      });
    const findings = allFindings.slice(0, counts.findings);
    const unresolved = allUnresolved.slice(0, counts.unresolvedEvaluations).map((evaluation) => ({
      ...evaluation,
      evidenceCitationIds: evaluation.evidenceCitationIds.filter((citationId) => evidenceMap.has(citationId)),
      semanticGuidanceAvailable: selectedGuidancePairs.has(applicationPairKey(evaluation.sourceApplication, evaluation.targetApplication)),
    }));
    const citations = citationsFor(selectedSources.slice(0, counts.sourceSelections), unresolved, entities, relationships, findings, evidence);
    const omittedCounts = {
      entities: allEntityContexts.length - entities.length,
      relationships: allRelationships.length - relationships.length,
      evidence: allEvidence.length - evidence.length,
      findings: allFindings.length - findings.length,
      unresolvedEvaluations: allUnresolved.length - unresolved.length,
      sourceSelections: sourceContext(snapshot, canonical).length - counts.sourceSelections,
      relationshipGuidance: relationshipGuidance.length - selectedGuidance.length,
    };
    const categories = Object.entries(omittedCounts).filter(([, count]) => count > 0).map(([category]) => category).sort();
    const uncertainties = buildUncertainties(hasCanonicalEvidence, partialSources, staleSources, conflicts, unsupportedIdentifiers);
    if (categories.length) uncertainties.push(`Context limit omitted items from: ${categories.join(", ")}; omitted content is unknown, not evidence of absence.`);
    const omittedRelationshipCount = allRelationships.length - relationships.length;
    if (omittedRelationshipCount > 0) {
      uncertainties.push(`Context limit omitted ${omittedRelationshipCount} relationship path(s); omitted path content is unknown.`);
    }
    for (const relationship of relationships) {
      if (!relationship.identitySupported) {
        uncertainties.push(`Relationship path ${relationship.relationshipId} has provisional identity; it is not a confirmed consequence path.`);
      }
      if (!relationship.semanticGuidanceAvailable) {
        uncertainties.push(`Observed relationship ${relationship.relationshipId} cannot be interpreted from the authoritative relationship model.`);
      }
    }
    for (const evaluation of unresolved) {
      if (!evaluation.semanticGuidanceAvailable) {
        uncertainties.push(`Unresolved relationship ${evaluation.ruleId} cannot be interpreted from the authoritative relationship model.`);
      }
    }
    return {
      ...base,
      sourceSelections: selectedSources.slice(0, counts.sourceSelections),
      entities,
      relationships,
      relationshipGuidance: selectedGuidance,
      findings,
      unresolvedEvaluations: unresolved,
      evidence,
      conflicts: conflicts.filter((conflict) => conflict.values.some((item) => entitiesMap.has(item.entityId))),
      citations,
      uncertainties,
      omissions: { categories, omittedCounts, maxContextChars },
    };
  };

  let packet = compose();
  let cursor = 0;
  while (JSON.stringify(packet).length > maxContextChars && trimOrder.some((key) => counts[key] > 0)) {
    for (let checked = 0; checked < trimOrder.length; checked++) {
      const key = trimOrder[cursor % trimOrder.length];
      cursor++;
      if (counts[key] > 0) {
        counts[key]--;
        break;
      }
    }
    packet = compose();
  }
  return packet;
}