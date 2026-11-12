import type {
  EngineeringIntelligenceInvestigationV1,
  IntelligenceEntity,
  IntelligenceRelationship,
} from "../contracts/intelligence-v1";
import type { InvestigationSnapshot, SourceExecutionSnapshot } from "../kernel/contracts/investigation-snapshot";
import type {
  CopilotCitation,
  ConsequenceEvidenceState,
  CopilotConflictContext,
  CopilotContextPacket,
  CopilotEntityCandidate,
  CopilotEntityContext,
  CopilotEvidenceContext,
  CopilotFindingContext,
  CopilotRelationshipContext,
  CopilotSourceContext,
  CopilotUnresolvedEvaluationContext,
  EngineeringBrief,
  EngineeringImpactChain,
  EngineeringFinding,
  EntityImportance,
  MissingEvidence,
  ReasoningNarrative,
  ReasoningPackage,
  ReasoningPath,
  InvestigationReasoningSummary,
  RelationshipFlowDiagnostics,
  SubjectTraceabilityNarrative,
  SubjectTraceabilityRelationshipArtifact,
  SubjectApplicationParticipation,
} from "./contracts";
import { COPILOT_RETRIEVAL_CONFIG } from "./retrieval-config";
import type { RetrievalEvidence } from "./retrieval/contracts";
import {
  parseRelationshipGuidance,
  selectRelationshipGuidance,
  type RelationshipApplicationPair,
} from "./relationship-guidance";
import type { InvestigationKnowledgeGraph, OntologyRelationshipPath } from "../plm-brain/contracts/relationship-ontology";

const DEFAULT_MAX_CHARS = 24_000;
const DEFAULT_MAX_ITEMS = 60;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_FIELD_CHARS = 1_200;
const APPLICATION_PRESENTATION_ORDER = ["codebeamer", "windchill", "sap", "configit"] as const;

export interface ContextBuilderOptions {
  maxContextChars?: number;
  maxItemsPerCategory?: number;
  maxTraversalDepth?: number;
  relationshipDocument?: string;
}

type Canonical = EngineeringIntelligenceInvestigationV1;
type CanonicalEvidence = Canonical["evidence"][number];
type CanonicalFinding = Canonical["findings"][number];
type RelationshipDirection = "forward" | "reverse" | "either";
type RelationshipLike = {
  id: string;
  category?: CopilotRelationshipContext["category"];
  kind?: string;
  type?: string;
  family?: string;
  sourceEntityId: string;
  targetEntityId: string;
  evidenceIds?: readonly string[];
  evidenceId?: string;
  strength?: string;
  assertion?: string;
  status?: string;
  provenance?: {
    source?: string;
    provider?: string;
    authority?: string;
    observedAt?: string;
    ontologyVersion?: string;
    sourceApplication?: string;
    sourceNativeId?: string;
    sourceProvider?: string;
    sourceAuthority?: string;
    sourceObservedAt?: string;
  };
  confidence?: string;
  evidenceRuleId?: string;
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
    importanceScore: 0,
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

function normalizedSubjectEntity(entity: InvestigationKnowledgeGraph["entities"][number]): CopilotEntityContext {
  return {
    entityId: entity.id,
    citationId: entity.citationId,
    displayName: short(entity.label, 240),
    kind: entity.kind,
    identityQuality: "deterministic-derived",
    properties: {},
    freshness: entity.provenance.freshness === "stale"
      ? "stale"
      : entity.provenance.freshness === "current"
        ? "current"
        : "unknown",
  };
}

function compactInvestigationEntity(entity: CopilotEntityContext): CopilotEntityContext {
  return {
    ...entity,
    displayName: short(entity.displayName, 160),
    kind: short(entity.kind, 80),
    ...(entity.nativeId ? { nativeId: short(entity.nativeId, 120) } : {}),
    properties: {},
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

function relationshipDirection(message: string): RelationshipDirection {
  const forward = [
    /\bdownstream\b/i,
    /\b(?:impact|impacts|impacted|impacting|consequence|consequences|effect|effects)\s+(?:of|from|for)\b/i,
    /\bwhat\s+depends\s+on\b/i,
    /\bdependents?\s+of\b/i,
    /\bwhat\s+(?:happens|changes)\s+(?:if|when)\b/i,
  ].some((pattern) => pattern.test(message));
  const reverse = [
    /\bupstream\b/i,
    /\bwhat\s+(?:affects|impacts|influences|feeds|drives|causes)\b/i,
    /\b(?:affected|impacted|influenced|fed|driven|caused)\s+by\b/i,
    /\b(?:dependencies|inputs|causes)\s+(?:of|for)\b/i,
  ].some((pattern) => pattern.test(message));

  if (forward === reverse) return "either";
  return forward ? "forward" : "reverse";
}

function classifyQuestion(message: string): CopilotContextPacket["questionIntent"] {
  if (/\b(root cause|why did|why does|caused by)\b/i.test(message)) return "root-cause";
  if (/\b(risk|hazard|failure mode|exposure)\b/i.test(message)) return "risk";
  if (/\b(changes?|changed|revision|notice|task)\b/i.test(message)) return "change-analysis";
  if (/\b(impact|impacted|affected|downstream|consequence)\b/i.test(message)) return "impact";
  if (/\b(depend|dependency|dependencies|upstream|input|feeds)\b/i.test(message)) return "dependency";
  if (/\b(evidence|prove|support|citation|source)\b/i.test(message)) return "evidence";
  if (/\b(relationship|connected|linked|trace|path|related)\b/i.test(message) ||
      /\b(?:what|which)\s+(?:entities|applications?)\s+(?:participate|are involved)\b/i.test(message)) return "relationship";
  if (/\b(document|specification|requirements?|manual)\b/i.test(message)) return "document";
  return "summary";
}

function isInvestigationScopedQuestion(
  message: string,
  questionIntent: CopilotContextPacket["questionIntent"],
): boolean {
  if (identifierCandidates(message).length > 0) return false;
  if (questionIntent === "summary") return true;
  if (questionIntent === "evidence") return true;
  return [
    /\bapplication(?:s)?\b.*\b(involved|connected|represented|covered)\b/i,
    /\bhow\s+are\s+(?:the\s+)?(?:applications|systems)\s+connected\b/i,
    /\bwhat\s+entities\s+(?:participate|are involved)\b/i,
    /\b(?:cross[- ]system|system[- ]level)\b/i,
    /\b(?:relationship|connection|link|traceability)\b.*\b(?:exist|overview|involved|connected|investigation)\b/i,
    /\b(?:evidence|finding|findings)\b.*\b(?:exist|overview|available|investigation|top)\b/i,
    /\b(?:impact|consequence|effect)\b.*\b(?:represented|connected|relationship|system|application|investigation)\b/i,
    /\bprimary entities\b/i,
    /\bin this investigation\b/i,
  ].some((pattern) => pattern.test(message));
}

function exactQueryMatch(message: string, value: string): boolean {
  return Boolean(value && containsExactIdentifier(message, value));
}

function normalizedBusinessText(value: string): string {
  return value.toLocaleLowerCase().replace(/[-_:]/g, " ").replace(/\s+/g, " ").trim();
}

function businessWeight(entity: Pick<CopilotEntityContext, "kind" | "displayName">): number {
  const text = normalizedBusinessText(`${entity.kind} ${entity.displayName}`);
  const weights: readonly [string, number][] = [
    ["investigation subject", 1],
    ["product", 0.95],
    ["requirement detail", 0.2],
    ["requirement", 0.9],
    ["part", 0.85],
    ["material", 0.85],
    ["configuration", 0.8],
    ["change", 0.75],
    ["document", 0.6],
    ["lifecycle", 0.15],
    ["origin", 0.15],
    ["catalog revision", 0.15],
    ["catalog status", 0.15],
    ["priority", 0.15],
    ["severity", 0.15],
    ["status", 0.15],
    ["metadata", 0.1],
    ["attribute", 0.05],
  ];
  return weights.find(([label]) => text.includes(label))?.[1] ?? 0.5;
}

function relationshipBusinessWeightValue(kind?: string, family?: string): number {
  const text = normalizedBusinessText(`${kind ?? ""} ${family ?? ""}`).replace(/\s+/g, "_");
  const weights: readonly [string, number][] = [
    ["specifies", 100],
    ["impacts", 100],
    ["validated_by", 95],
    ["represented_as", 95],
    ["operational_representation_as", 95],
    ["operationally_represented_as", 95],
    ["configured_by", 90],
    ["implemented_by", 90],
    ["traced_to", 85],
    ["contains", 20],
    ["has_field", 10],
    ["metadata", 5],
  ];
  return weights.find(([label]) => text.includes(label))?.[1] ?? 50;
}

function relationshipBusinessWeight(relationship: CopilotRelationshipContext): number {
  return relationshipBusinessWeightValue(relationship.kind, relationship.family);
}

function rankEntityCandidates(
  message: string,
  entities: readonly CopilotEntityContext[],
  canonical?: Canonical,
): CopilotEntityCandidate[] {
  const ontologyPaths = new Set((canonical?.knowledgeGraph?.ontology.relationshipDefinitions ?? [])
    .flatMap((definition) => definition.evidenceRules.flatMap((rule) => [rule.sourcePath, rule.targetPath])));
  const exactMatches = new Set<string>();
  const candidates = entities.map((entity) => {
    if (exactQueryMatch(message, entity.nativeId ?? "") || exactQueryMatch(message, entity.entityId)) {
      exactMatches.add(entity.entityId);
      return { entity, score: COPILOT_RETRIEVAL_CONFIG.exactIdentifierScore, matchBasis: "exact-identifier" as const };
    }
    const governedPropertyMatch = Object.entries(entity.properties).some(([key, value]) =>
      ontologyPaths.has(key) && exactQueryMatch(message, value),
    );
    if (governedPropertyMatch) {
      exactMatches.add(entity.entityId);
      return { entity, score: COPILOT_RETRIEVAL_CONFIG.governedPropertyScore, matchBasis: "governed-property" as const };
    }
    const lexicalScore = relevance(message, [entity.displayName, entity.kind, entity.source ?? "", ...Object.entries(entity.properties).flat()]);
    return { entity, score: lexicalScore ? Math.min(COPILOT_RETRIEVAL_CONFIG.lexicalFallbackMaximum, lexicalScore / 100) : 0, matchBasis: "lexical" as const };
  });
  const pathConnected = new Set<string>();
  for (const relationship of canonical?.knowledgeGraph?.resolvedRelationships ?? []) {
    if (exactMatches.has(relationship.sourceEntityId)) pathConnected.add(relationship.targetEntityId);
    if (exactMatches.has(relationship.targetEntityId)) pathConnected.add(relationship.sourceEntityId);
  }
  const eligible = candidates.map((candidate) => {
    if (candidate.matchBasis === "lexical" && pathConnected.has(candidate.entity.entityId))
      return { ...candidate, score: COPILOT_RETRIEVAL_CONFIG.relationshipPathScore, matchBasis: "relationship-path" as const };
    return candidate;
  }).filter((candidate) => candidate.score > 0);
  return eligible.sort((left, right) =>
    right.score - left.score ||
    businessWeight(right.entity) - businessWeight(left.entity) ||
    left.entity.entityId.localeCompare(right.entity.entityId),
  ).slice(0, 10).map(({ entity, score, matchBasis }) => ({
    entityId: entity.entityId,
    label: entity.displayName,
    ...(entity.source ? { source: entity.source } : {}),
    ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
    score,
    matchBasis,
    citationId: entity.citationId,
  }));
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

function relationshipList(canonical?: Canonical, includeSubjectTraceability = false): RelationshipLike[] {
  if (!canonical) return [];
  const identityRelationships: RelationshipLike[] = [];
  const entitiesById = new Map(canonical.entities.map((entity) => [entity.id, entity]));
  const addIdentityRelationships = (groupId: string, entityIds: readonly string[], evidenceIds: readonly string[] = []) => {
    const members = [...new Set(entityIds)]
      .map((entityId) => entitiesById.get(entityId))
      .filter((entity): entity is Canonical["entities"][number] => Boolean(entity));
    for (let sourceIndex = 0; sourceIndex < members.length; sourceIndex += 1) {
      for (let targetIndex = sourceIndex + 1; targetIndex < members.length; targetIndex += 1) {
        const source = members[sourceIndex];
        const target = members[targetIndex];
        if (source.provenance.source === target.provenance.source) continue;
        identityRelationships.push({
          id: `projection:domain:cross-source:${encodeURIComponent(groupId)}:${encodeURIComponent(source.id)}:${encodeURIComponent(target.id)}`,
          kind: "cross-source-traceability",
          type: "cross-source-traceability",
          family: "projection:domain:cross-source",
          sourceEntityId: source.id,
          targetEntityId: target.id,
          evidenceIds,
          assertion: "inference",
          status: "CALCULATED",
          strength: "MEDIUM",
          provenance: {
            provider: "identity-domain",
            authority: "backend-derived",
            observedAt: canonical.temporal.assembledAt,
            ontologyVersion: canonical.knowledgeGraph?.ontologyVersion,
          },
        });
      }
    }
  };
  for (const cluster of canonical.identityClusters) addIdentityRelationships(cluster.id, cluster.entityIds, cluster.evidenceIds);
  const canonicalRelationships = canonical.relationships.map((relationship) => ({
    ...relationship,
    category: "canonical" as const,
  }));
  const resolved = canonical.knowledgeGraph?.resolvedRelationships.map((relationship) => ({
    id: relationship.id,
    category: "ontology-resolved" as const,
    kind: relationship.forwardType,
    type: relationship.forwardType,
    family: relationship.definitionId,
    sourceEntityId: relationship.sourceEntityId,
    targetEntityId: relationship.targetEntityId,
    evidenceIds: relationship.evidenceIds,
    assertion: "fact",
    status: relationship.status,
    strength: relationship.strength,
    evidenceRuleId: relationship.evidenceRuleId,
    provenance: relationship.provenance,
    confidence: relationship.strength,
  })) ?? [];
  const subjectTraceability = includeSubjectTraceability
    ? canonical.knowledgeGraph?.subjectTraceabilityRelationships.map((relationship) => ({
        id: relationship.id,
        category: relationship.category,
        kind: relationship.relationshipType,
        type: relationship.relationshipType,
        sourceEntityId: relationship.sourceEntityId,
        targetEntityId: relationship.targetEntityId,
        evidenceIds: [],
        assertion: "inference",
        status: relationship.status,
        strength: relationship.strength,
        provenance: relationship.provenance,
      })) ?? []
    : [];
  const contextualIdentityRelationships = includeSubjectTraceability ? [] : identityRelationships;
  if (canonical.knowledgeGraph)
    return [...canonicalRelationships, ...resolved, ...contextualIdentityRelationships, ...subjectTraceability]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
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
  return [...canonicalRelationships, ...plm, ...universal, ...resolved, ...contextualIdentityRelationships]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
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
  const universalEvidence: EvidenceLike[] = canonical.knowledgeGraph ? [] : canonical.universalRelationshipEvidence?.map((item) => ({
    id: item.id,
    kind: item.mechanism,
    summary: item.reason,
    source: item.source.application,
    provenance: { source: item.source.application, observedAt: item.source.observedAt },
    evaluatedAt: item.evaluatedAt,
  })) ?? [];
  const ontologyEvidence: EvidenceLike[] = canonical.knowledgeGraph?.relationshipEvidence.map((item) => ({
    id: item.id,
    kind: "ontology-relationship-property",
    summary: [
      `${item.application ?? "source"} ${item.path}=${item.value} (provider: ${item.provider}; authority: ${item.authority})`,
      ...(item.mappingId ? [
        `mappingId=${item.mappingId}`,
        `mappingReference=${item.mappingReference ?? "unavailable"}`,
        `mappingBasis=${item.mappingBasis ?? "unavailable"}`,
        `handshakeEvidenceId=${item.handshakeEvidenceId ?? "unavailable"}`,
        `ontologyRuleId=${item.ontologyRuleId ?? "unavailable"}`,
        `ontologyField=${item.ontologyFieldPath ?? "unavailable"}=${item.ontologyFieldValue ?? "unavailable"}`,
      ] : []),
    ].join("; "),
    source: item.application,
    provenance: { source: item.application, observedAt: item.observedAt },
  })) ?? [];
  return [...canonicalEvidence, ...plmEvidence, ...universalEvidence, ...ontologyEvidence]
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
    ...(relation.category ? { category: relation.category } : {}),
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
    ...(relation.strength ?? relation.confidence ? { strength: relation.strength ?? relation.confidence } : {}),
    ...(relation.evidenceRuleId ? { evidenceRuleId: relation.evidenceRuleId } : {}),
    ...(relation.provenance ? {
      provenance: {
        ...(relation.provenance.provider ? { provider: relation.provenance.provider } : {}),
        ...(relation.provenance.authority ? { authority: relation.provenance.authority } : {}),
        ...(relation.provenance.observedAt ? { observedAt: relation.provenance.observedAt } : {}),
        ...(relation.provenance.ontologyVersion ? { ontologyVersion: relation.provenance.ontologyVersion } : {}),
        ...(relation.provenance.sourceApplication ? { sourceApplication: relation.provenance.sourceApplication } : {}),
        ...(relation.provenance.sourceNativeId ? { sourceNativeId: relation.provenance.sourceNativeId } : {}),
        ...(relation.provenance.sourceProvider ? { sourceProvider: relation.provenance.sourceProvider } : {}),
        ...(relation.provenance.sourceAuthority ? { sourceAuthority: relation.provenance.sourceAuthority } : {}),
        ...(relation.provenance.sourceObservedAt ? { sourceObservedAt: relation.provenance.sourceObservedAt } : {}),
      },
    } : {}),
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
  const persistedEvaluations = (canonical?.knowledgeGraph ? [] : canonical?.universalRelationshipEvaluations ?? [])
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
    }));
  const ontologyEvaluations = canonical?.knowledgeGraph?.unresolvedEvaluations.map((evaluation) => {
    const definition = canonical.knowledgeGraph?.ontology.relationshipDefinitions.find((item) => item.id === evaluation.definitionId);
    return {
      citationId: stableCitationId("evaluation", evaluation.id),
      ruleId: evaluation.definitionId,
      relationshipType: definition?.forward.type ?? "unresolved relationship",
      sourceApplication: evaluation.sourceApplication,
      targetApplication: evaluation.targetApplication,
      semanticGuidanceAvailable: true,
      reasonCode: evaluation.reason,
      reason: evaluation.reason === "evidence-not-found"
        ? "Compatible endpoints exist, but no declared ontology evidence rule matched their investigation properties."
        : "No compatible source and target endpoints were found in this investigation snapshot.",
      sourceEntityIds: evaluation.sourceCandidates,
      targetEntityIds: evaluation.targetCandidates,
      evidenceCitationIds: evaluation.citationIds,
    };
  }) ?? [];
  return [...persistedEvaluations, ...ontologyEvaluations]
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId) || left.citationId.localeCompare(right.citationId));
}

function consequenceEvidenceState(
  message: string,
  enabled: boolean,
  entities: readonly CopilotEntityContext[],
  relationships: readonly RelationshipLike[],
  impactPaths: readonly OntologyRelationshipPath[],
  unresolvedEvaluations: readonly CopilotUnresolvedEvaluationContext[],
  graph: InvestigationKnowledgeGraph | undefined,
): ConsequenceEvidenceState | undefined {
  if (!enabled) return undefined;

  const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));
  const matchesRequestedPair = (sourceId: string, targetId: string): boolean =>
    entityById.get(sourceId)?.source?.toLocaleLowerCase() === "windchill" &&
    entityById.get(targetId)?.source?.toLocaleLowerCase() === "sap";
  const resolvedRelationships = relationships.filter((relationship) =>
    relationship.category === "ontology-resolved" &&
    relationship.family === "WC_PART_TO_SAP_MATERIAL" &&
    relationship.kind === "operationally-represented-as" &&
    matchesRequestedPair(relationship.sourceEntityId, relationship.targetEntityId),
  );
  const matchingEvaluations = unresolvedEvaluations.filter((evaluation) =>
    evaluation.ruleId === "WC_PART_TO_SAP_MATERIAL" &&
    evaluation.sourceApplication.toLocaleLowerCase() === "windchill" &&
    evaluation.targetApplication.toLocaleLowerCase() === "sap",
  );
  const firstResolved = resolvedRelationships[0];
  const matchingEvaluation = matchingEvaluations[0];
  const selectEndpoint = (application: "windchill" | "sap", candidates: readonly string[], kindHint: string): CopilotEntityContext | undefined => {
    const candidateIds = new Set(candidates);
    return entities
      .filter((entity) =>
        entity.source?.toLocaleLowerCase() === application &&
        !entity.kind.toLocaleLowerCase().includes("investigation-subject") &&
        !entity.entityId.toLocaleLowerCase().startsWith("subject:") &&
        (!candidateIds.size || candidateIds.has(entity.entityId)),
      )
      .sort((left, right) =>
        relevance(message, [right.displayName, right.kind, right.nativeId ?? "", ...Object.values(right.properties)]) -
          relevance(message, [left.displayName, left.kind, left.nativeId ?? "", ...Object.values(left.properties)]) ||
        Number(right.kind.toLocaleLowerCase().includes(kindHint)) - Number(left.kind.toLocaleLowerCase().includes(kindHint)) ||
        left.entityId.localeCompare(right.entityId),
      )[0];
  };
  const sourceCandidateIds = matchingEvaluation?.sourceEntityIds ?? [];
  const targetCandidateIds = matchingEvaluation?.targetEntityIds ?? [];
  const source = firstResolved
    ? entityById.get(firstResolved.sourceEntityId)
    : selectEndpoint("windchill", sourceCandidateIds, "part");
  const target = firstResolved
    ? entityById.get(firstResolved.targetEntityId)
    : selectEndpoint("sap", targetCandidateIds, "material");
  const sourceEntityId = source?.entityId;
  const targetEntityId = target?.entityId;
  const endpointPairMatches = (sourceId: string, targetId: string): boolean =>
    Boolean(sourceEntityId && targetEntityId &&
      (sourceId === sourceEntityId && targetId === targetEntityId ||
        sourceId === targetEntityId && targetId === sourceEntityId));
  const resolvedRelationshipIds = new Set(resolvedRelationships.map((relationship) => relationship.id));
  const matchingImpactPaths = impactPaths.filter((path) =>
    path.impactEligible &&
    endpointPairMatches(path.sourceEntityId, path.targetEntityId) &&
    path.relationshipIds.some((id) => resolvedRelationshipIds.has(id)),
  );
  const matchingImpactChains = (graph?.impactChains ?? []).filter((chain) =>
    endpointPairMatches(chain.sourceEntityId, chain.impactedEntityId) &&
    chain.relationshipIds.some((id) => resolvedRelationshipIds.has(id)),
  );
  const impactPathCitationIds = [...new Set(matchingImpactPaths.flatMap((path) => path.citationIds))];
  const impactChainCitationIds = [...new Set(matchingImpactChains.flatMap((chain) => chain.citationIds))];
  const unresolvedEvaluationCitationIds = matchingEvaluation ? [matchingEvaluation.citationId] : [];
  const resolvedRelationshipCitationIds = resolvedRelationships.map((relationship) =>
    stableCitationId("relationship", relationship.id),
  );
  const sourceEntityCitationIds = source ? [source.citationId] : [];
  const targetEntityCitationIds = target ? [target.citationId] : [];
  const sameSubjectEntityIds = new Set<string>();
  const subjectTraceabilityCitationIds: string[] = [];
  for (const edge of graph?.subjectTraceabilityRelationships ?? []) {
    const sourceEntity = entityById.get(edge.sourceEntityId);
    const targetEntity = entityById.get(edge.targetEntityId);
    const subjectEntityId = graph?.entities.find((entity) =>
      entity.kind === "investigation-subject" &&
      (entity.id === edge.sourceEntityId || entity.id === edge.targetEntityId),
    )?.id;
    if (!subjectEntityId) continue;
    const participant = edge.sourceEntityId === subjectEntityId ? targetEntity : sourceEntity;
    if (participant?.source?.toLocaleLowerCase() === "windchill" ||
        participant?.source?.toLocaleLowerCase() === "sap") {
      sameSubjectEntityIds.add(`${subjectEntityId}\u0000${participant.source.toLocaleLowerCase()}`);
    }
  }
  const subjectIds = new Set([...sameSubjectEntityIds].map((item) => item.split("\u0000")[0]));
  const sameInvestigationSubject = [...subjectIds].some((subjectId) =>
    sameSubjectEntityIds.has(`${subjectId}\u0000windchill`) &&
    sameSubjectEntityIds.has(`${subjectId}\u0000sap`),
  );
  const effectCitationIds = [...new Set([...impactPathCitationIds, ...impactChainCitationIds])];
  const effectCategories: Readonly<Record<string, RegExp>> = {
    inventory: /\binventory|stock\b/i,
    "production-planning": /\bproduction|planning\b/i,
    procurement: /\bprocurement|purchas/i,
    compliance: /\bcompliance|regulatory\b/i,
    "manufacturing-disruption": /\bmanufactur|disruption\b/i,
    "material-management": /\bmaterial.?management\b/i,
    "downstream-cost": /\bdownstream cost|cost impact\b/i,
    "automatic-sap-changes": /\bautomatic(?:ally)? (?:update|change|propagat)/i,
    "guaranteed-propagation": /\bguaranteed propagation|guarantee(?:d)? (?:impact|change|propagation)/i,
  };
  const specificEffectCitationIdsByCategory = Object.fromEntries(
    Object.entries(effectCategories).map(([category, pattern]) => [
      category,
      [...new Set(effectCitationIds.filter((citationId) =>
        graph?.relationshipEvidence.some((item) =>
          stableCitationId("evidence", item.id) === citationId &&
          pattern.test(`${item.path} ${item.value}`),
        ) ?? false,
      ))],
    ]),
  );
  const specificEffectCitationIds = [...new Set(Object.values(specificEffectCitationIdsByCategory).flat())];
  const allowedCitationIds = [...new Set([
    ...sourceEntityCitationIds,
    ...targetEntityCitationIds,
    ...subjectTraceabilityCitationIds,
    ...unresolvedEvaluationCitationIds,
    ...resolvedRelationshipCitationIds,
    ...impactPathCitationIds,
    ...impactChainCitationIds,
    ...specificEffectCitationIds,
  ])].sort();
  const ontologyRelationshipEstablished = resolvedRelationships.length > 0;
  const eligibleImpactPathAvailable = matchingImpactPaths.length > 0;
  const eligibleImpactChainAvailable = matchingImpactChains.length > 0;

  return {
    intent: "consequence",
    requestedRelationshipType: "operationally-represented-as",
    sourceApplication: "windchill",
    targetApplication: "sap",
    ...(sourceEntityId ? { sourceEntityId } : {}),
    ...(targetEntityId ? { targetEntityId } : {}),
    sameInvestigationSubject,
    ontologyRelationshipEstablished,
    eligibleImpactPathAvailable,
    eligibleImpactChainAvailable,
    unresolvedEvaluationAvailable: matchingEvaluations.length > 0,
    allowedConclusion: ontologyRelationshipEstablished && (eligibleImpactPathAvailable || eligibleImpactChainAvailable)
      ? "evidence-backed-potential-impact"
      : "insufficient-evidence",
    allowedCitationIds,
    sourceEntityCitationIds,
    targetEntityCitationIds,
    subjectTraceabilityCitationIds,
    unresolvedEvaluationCitationIds,
    resolvedRelationshipCitationIds,
    impactPathIds: matchingImpactPaths.map((path) => path.id),
    impactChainIds: matchingImpactChains.map((chain) => chain.id),
    impactPathCitationIds,
    impactChainCitationIds,
    specificEffectCitationIds,
    specificEffectCitationIdsByCategory,
    prohibitedClaimCategories: [
      "unsupported-operational-representation",
      "unsupported-dependency",
      "unsupported-operational-impact",
      "inventory-effects-without-specific-evidence",
      "production-planning-effects-without-specific-evidence",
      "procurement-effects-without-specific-evidence",
      "compliance-effects-without-specific-evidence",
      "manufacturing-disruption-without-specific-evidence",
      "downstream-cost-without-specific-evidence",
      "automatic-sap-changes",
      "guaranteed-operational-propagation",
    ],
  };
}

function applicationPairKey(sourceApplication: string, targetApplication: string): string {
  return `${sourceApplication.trim().replace(/\s+/g, " ").toLocaleLowerCase()}\u0000${targetApplication.trim().replace(/\s+/g, " ").toLocaleLowerCase()}`;
}

function orderRelationshipsFromFocus(
  relationships: readonly { relation: RelationshipLike; score: number }[],
  focalEntityId?: string,
  direction: RelationshipDirection = "either",
  maxDepth: number = COPILOT_RETRIEVAL_CONFIG.maxTraversalDepth,
): { relation: RelationshipLike; score: number; distance: number }[] {
  if (!focalEntityId) {
    return relationships.map((item) => ({ ...item, distance: 0 }));
  }

  const relationshipsByEntity = new Map<string, typeof relationships[number][]>();
  for (const item of relationships) {
    const startEntityIds = direction === "forward"
      ? [item.relation.sourceEntityId]
      : direction === "reverse"
        ? [item.relation.targetEntityId]
        : [item.relation.sourceEntityId, item.relation.targetEntityId];
    for (const entityId of startEntityIds) {
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
    if (distance >= maxDepth) continue;
    for (const item of relationshipsByEntity.get(currentEntityId) ?? []) {
      if (selected.has(item.relation.id)) continue;
      selected.set(item.relation.id, { ...item, distance });
      const connectedEntityId = direction === "forward"
        ? item.relation.targetEntityId
        : direction === "reverse"
          ? item.relation.sourceEntityId
          : item.relation.sourceEntityId === currentEntityId
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

function strengthScore(value?: string): number {
  if (value === "STRONG") return 1;
  if (value === "MEDIUM") return 0.65;
  if (value === "WEAK") return 0.3;
  return 0.45;
}

function displayApplicationName(value: string): string {
  const knownNames: Readonly<Record<string, string>> = {
    codebeamer: "Codebeamer",
    configit: "Configit",
    sap: "SAP",
    windchill: "Windchill",
  };
  return knownNames[value.toLocaleLowerCase()] ??
    value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

function compareApplications(left: string, right: string): number {
  const leftOrder = APPLICATION_PRESENTATION_ORDER.indexOf(left.toLocaleLowerCase() as typeof APPLICATION_PRESENTATION_ORDER[number]);
  const rightOrder = APPLICATION_PRESENTATION_ORDER.indexOf(right.toLocaleLowerCase() as typeof APPLICATION_PRESENTATION_ORDER[number]);
  return (leftOrder < 0 ? Number.MAX_SAFE_INTEGER : leftOrder) -
    (rightOrder < 0 ? Number.MAX_SAFE_INTEGER : rightOrder) ||
    left.localeCompare(right);
}

function joinApplicationNames(applications: readonly string[]): string {
  if (applications.length < 2) return applications[0] ?? "";
  if (applications.length === 2) return `${applications[0]} and ${applications[1]}`;
  return `${applications.slice(0, -1).join(", ")}, and ${applications.at(-1)}`;
}

const FOUR_APPLICATION_SUBJECT_SET = new Set(["codebeamer", "windchill", "sap", "configit"]);

function hasFourSubjectApplications(applications: readonly string[]): boolean {
  const applicationSet = new Set(applications.map((application) => application.toLocaleLowerCase()));
  return applicationSet.size === FOUR_APPLICATION_SUBJECT_SET.size &&
    [...FOUR_APPLICATION_SUBJECT_SET].every((application) => applicationSet.has(application));
}

function isFourApplicationSubjectParticipation(
  participation: readonly (Pick<SubjectApplicationParticipation, "application"> & { subjectId?: string })[],
): boolean {
  const subjectIds = new Set(participation.map((item) => item.subjectId).filter(Boolean));
  return participation.length === FOUR_APPLICATION_SUBJECT_SET.size &&
    subjectIds.size === 1 &&
    hasFourSubjectApplications(participation.map((item) => item.application));
}

function fourApplicationConnectivitySentence(
  applications: readonly string[],
  subjectLabel: string,
): string {
  return `${joinApplicationNames(applications)} contribute records to the same ${subjectLabel} investigation subject.`;
}

function representativePriority(entity: CopilotEntityContext, application: string): number {
  const kind = normalizedBusinessText(entity.kind);
  const label = normalizedBusinessText(entity.displayName);
  const metadataTerms = [
    "lifecycle", "priority", "document type", "material type", "base unit",
    "status", "generic attribute", "metadata", "catalog status", "origin", "language",
    "translation", "severity", "version", "view",
  ];
  if (metadataTerms.some((term) => kind.includes(term) || label === term || label.startsWith(`${term} `))) return 0;
  if (kind === "source" || label === "source") return 0;
  if (
    application.toLocaleLowerCase() === "sap" &&
    kind.includes("source representation") &&
    /^mat[0-9]/i.test(entity.nativeId ?? "")
  ) return 75;
  const priorities: readonly [string, number][] = [
    ["part occurrence", 120],
    ["part", 115],
    ["assembly", 110],
    ["material master", 110],
    ["material movement", 35],
    ["material", 105],
    ["bom", 100],
    ["requirement set", 100],
    ["requirement group", 98],
    ["requirement detail", 30],
    ["requirement", 95],
    ["product model", 95],
    ["configuration family", 92],
    ["accounting document", 25],
    ["document", 90],
    ["cad object", 88],
    ["change notice", 85],
    ["change task", 82],
    ["production order", 80],
    ["purchase order", 78],
    ["transaction", 20],
  ];
  const domainPriority: Readonly<Record<string, readonly string[]>> = {
    windchill: ["part", "assembly", "document", "cad", "change"],
    sap: ["material", "bom", "production", "purchase"],
    codebeamer: ["requirement"],
    configit: ["product model", "configuration", "family", "rule"],
  };
  const matched = priorities.find(([term]) => kind.includes(term));
  if (!matched) return kind.includes("source representation") ? 1 : 0;
  const domainMatch = domainPriority[application.toLocaleLowerCase()]?.some((term) => kind.includes(term));
  return matched[1] + (domainMatch ? 10 : 0);
}

type ConfigitRepresentativeCategory =
  | "product/work-item subject"
  | "product model"
  | "product context"
  | "configuration model"
  | "configuration family"
  | "feature"
  | "configuration rule or expression"
  | "metadata or attribute";

function configitRepresentativeCategory(entity: CopilotEntityContext): ConfigitRepresentativeCategory {
  const kind = normalizedBusinessText(entity.kind);
  const sourceRole = normalizedBusinessText(entity.properties.sourceRole ?? "");
  if (
    sourceRole === "participating source subject" ||
    kind.includes("work item subject") ||
    kind.includes("product subject")
  ) return "product/work-item subject";
  if (kind.includes("product model")) return "product model";
  if (kind.includes("product context")) return "product context";
  if (kind.includes("configuration model")) return "configuration model";
  if (kind.includes("configuration family") || kind === "family") return "configuration family";
  if (kind.includes("feature")) return "feature";
  if (kind.includes("rule") || kind.includes("expression")) return "configuration rule or expression";
  return "metadata or attribute";
}

const CONFIGIT_REPRESENTATIVE_CATEGORY_PRIORITY: Readonly<Record<ConfigitRepresentativeCategory, number>> = {
  "product/work-item subject": 0,
  "product model": 1,
  "product context": 2,
  "configuration model": 3,
  "configuration family": 4,
  feature: 5,
  "configuration rule or expression": 6,
  "metadata or attribute": 7,
};

export function selectConfigitRepresentative(
  entities: readonly CopilotEntityContext[],
): CopilotEntityContext | undefined {
  return [...entities].sort((left, right) =>
    CONFIGIT_REPRESENTATIVE_CATEGORY_PRIORITY[configitRepresentativeCategory(left)] -
      CONFIGIT_REPRESENTATIVE_CATEGORY_PRIORITY[configitRepresentativeCategory(right)] ||
    Number(Boolean(right.nativeId && right.displayName)) - Number(Boolean(left.nativeId && left.displayName)) ||
    left.entityId.localeCompare(right.entityId),
  )[0];
}

function representativeSemanticRole(entity: CopilotEntityContext, application: string): string {
  if (application.toLocaleLowerCase() === "configit") {
    return configitRepresentativeCategory(entity);
  }
  if (
    application.toLocaleLowerCase() === "sap" &&
    normalizedBusinessText(entity.kind).includes("source representation") &&
    /^mat[0-9]/i.test(entity.nativeId ?? "")
  ) return "operational material";
  return entity.kind;
}

function subjectApplicationParticipation(
  subjectRelationships: readonly InvestigationKnowledgeGraph["subjectTraceabilityRelationships"][number][],
  entities: readonly CopilotEntityContext[],
  fallbackSubject: string,
  canonicalRelationships: readonly IntelligenceRelationship[] = [],
): SubjectApplicationParticipation[] {
  const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));
  const groups = new Map<string, typeof subjectRelationships[number][]>();
  for (const relationship of subjectRelationships) {
    const application = relationship.sourceApplication ??
      relationship.provenance.sourceApplication ??
      entityById.get(relationship.sourceEntityId)?.source;
    if (!application) continue;
    const subjectId = relationship.provenance.subjectId || relationship.targetEntityId;
    const key = `${subjectId}\u0000${application}`;
    groups.set(key, [...(groups.get(key) ?? []), relationship]);
  }
  return [...groups.entries()]
    .sort(([, left], [, right]) => {
      const leftApplication = left[0].sourceApplication ?? left[0].provenance.sourceApplication ?? "";
      const rightApplication = right[0].sourceApplication ?? right[0].provenance.sourceApplication ?? "";
      return compareApplications(leftApplication, rightApplication) ||
        left[0].provenance.subjectId.localeCompare(right[0].provenance.subjectId);
    })
    .map(([, group]) => {
      const sourceEntityIds = [...new Set(group.map((relationship) => relationship.sourceEntityId))];
      const sourceEntities = sourceEntityIds
        .map((entityId) => entityById.get(entityId))
        .filter((entity): entity is CopilotEntityContext => Boolean(entity));
      const application = group[0].sourceApplication ??
        group[0].provenance.sourceApplication ??
        sourceEntities[0]?.source ??
        "unknown";
      const businessCandidates = sourceEntities
        .map((entity) => ({ entity, priority: representativePriority(entity, application) }))
        .filter(({ priority }) => priority > 1)
        .sort((left, right) =>
          right.priority - left.priority ||
          left.entity.entityId.localeCompare(right.entity.entityId),
        );
      const representativeCandidates = businessCandidates.length
        ? businessCandidates
        : sourceEntities
          .map((entity) => ({ entity, priority: representativePriority(entity, application) }))
          .filter(({ priority }) => priority === 1)
          .sort((left, right) => left.entity.entityId.localeCompare(right.entity.entityId));
      const representatives = application.toLocaleLowerCase() === "configit"
        ? [selectConfigitRepresentative(sourceEntities)].filter((entity): entity is CopilotEntityContext => Boolean(entity))
        : representativeCandidates.slice(0, 1).map(({ entity }) => entity);
      const hasMaterialDetail = sourceEntities.some((entity) =>
        entity.kind.toLocaleLowerCase() === "product-detail" &&
        entity.displayName.toLocaleLowerCase().includes("material type"),
      );
      const subjectEntity = entityById.get(group[0].targetEntityId);
      const representative = representatives[0];
      const representativeEntityStatus = representative && application.toLocaleLowerCase() === "configit"
        ? canonicalRelationships
          .filter((relationship) =>
            relationship.sourceEntityId === representative.entityId &&
            normalizedBusinessText(relationship.kind) === "has product context",
          )
          .map((relationship) => entityById.get(relationship.targetEntityId))
          .find((entity) =>
            entity &&
            normalizedBusinessText(entity.displayName).includes("status") &&
            entity.properties.value?.trim(),
          )?.properties.value
        : undefined;
      return {
        subjectId: group[0].provenance.subjectId || group[0].targetEntityId,
        subjectLabel: fallbackSubject || subjectEntity?.displayName || "",
        application: displayApplicationName(application),
        participantCount: sourceEntityIds.length,
        uniqueEntityCount: sourceEntityIds.length,
        representativeEntityIds: representatives.map((entity) => entity.entityId),
        representativeEntityLabels: representatives.map((entity) => {
          if (application.toLocaleLowerCase() === "sap" && hasMaterialDetail && /^mat[0-9]/i.test(entity.nativeId ?? "")) {
            return `Material ${entity.nativeId}`;
          }
          if (application.toLocaleLowerCase() === "codebeamer" &&
              normalizedBusinessText(entity.kind).includes("requirement")) {
            return entity.displayName;
          }
          if (normalizedBusinessText(entity.kind).includes("part occurrence") && entity.nativeId) {
            return `${entity.displayName} part ${entity.nativeId.split(/[\/#]/)[0]}`;
          }
          if (application.toLocaleLowerCase() === "configit" &&
              configitRepresentativeCategory(entity) === "product/work-item subject" &&
              entity.nativeId) {
            return `${entity.displayName}, Work-item ID ${entity.nativeId}`;
          }
          if (application.toLocaleLowerCase() === "configit" &&
              normalizedBusinessText(entity.kind).includes("family") &&
              entity.nativeId) {
            return `${entity.displayName} ${entity.nativeId}`;
          }
          return entity.nativeId && !entity.displayName.includes(entity.nativeId)
            ? `${entity.displayName} (${entity.nativeId})`
            : entity.displayName;
        }),
        representativeEntityKinds: representatives.map((entity) => entity.kind),
        ...(representativeEntityStatus ? { representativeEntityStatus } : {}),
        sourceKinds: [...new Set(sourceEntities.map((entity) => entity.kind))].sort(),
        relationshipType: "represents-subject" as const,
        category: "subject-traceability-summary" as const,
        status: "subject-derived" as const,
        authority: "investigation" as const,
        strength: "informational" as const,
        impactEligible: false as const,
        ...(!representatives.length ? { diagnosticReason: "No non-metadata business entity is available for this application." } : {}),
      };
    });
}

function statusScore(value?: string): number {
  if (value === "SOURCE_EXPLICIT") return 1;
  if (value === "CONFIRMED") return 0.95;
  if (value === "RULE_DERIVED") return 0.8;
  if (value === "CALCULATED") return 0.7;
  return 0.4;
}

function scoreReasoningPath(
  path: OntologyRelationshipPath,
  entityById: ReadonlyMap<string, CopilotEntityContext>,
  relationshipsById: ReadonlyMap<string, CopilotRelationshipContext>,
): ReasoningPath {
  const relationships = path.relationshipIds.flatMap((id) => {
    const relationship = relationshipsById.get(id);
    return relationship ? [relationship] : [];
  });
  const relationshipStrength = relationships.length
    ? relationships.reduce((score, relationship) =>
        score + strengthScore(relationship.strength) * 0.7 + statusScore(relationship.status) * 0.3,
      0) / relationships.length
    : strengthScore(path.strength);
  const evidenceCount = new Set(path.citationIds.filter((id) => id.startsWith("cite:evidence:"))).size;
  const evidenceStrength = Math.min(1, evidenceCount / Math.max(1, path.steps.length * 2));
  const ontologyConfidence = path.relationshipIds.length
    ? relationships.filter((relationship) => Boolean(relationship.family)).length / path.relationshipIds.length
    : 0;
  const source = entityById.get(path.sourceEntityId);
  const target = entityById.get(path.targetEntityId);
  const applications = new Set(path.steps.flatMap((step) =>
    [entityById.get(step.fromEntityId)?.source, entityById.get(step.toEntityId)?.source]
      .filter((application): application is string => Boolean(application)),
  ));
  const crossApplicationBonus = applications.size > 1 ||
    (source?.source && target?.source && source.source !== target.source)
    ? 1
    : 0;
  const score = Number((
    relationshipStrength * 0.35 +
    evidenceStrength * 0.25 +
    ontologyConfidence * 0.2 +
    crossApplicationBonus * 0.2
  ).toFixed(3));
  return { path, score, relationshipStrength, evidenceStrength, ontologyConfidence, crossApplicationBonus };
}

function pathNarrative(
  scoredPath: ReasoningPath,
  entityById: ReadonlyMap<string, CopilotEntityContext>,
  impact: boolean,
): ReasoningNarrative | undefined {
  const path = scoredPath.path;
  const source = entityById.get(path.sourceEntityId);
  const target = entityById.get(path.targetEntityId);
  if (!source || !target || !path.steps.length) return undefined;
  const steps = path.steps.flatMap((step) => {
    const from = entityById.get(step.fromEntityId);
    const to = entityById.get(step.toEntityId);
    if (!from || !to) return [];
    const meaning = step.meaning.trim().replace(/[.]+$/g, "").toLocaleLowerCase();
    return [`${from.displayName} ${meaning || step.type} ${to.displayName}.`];
  });
  if (steps.length !== path.steps.length) return undefined;
  const applications = new Set(path.steps.flatMap((step) =>
    [entityById.get(step.fromEntityId)?.source, entityById.get(step.toEntityId)?.source]
      .filter((application): application is string => Boolean(application)),
  ));
  const crossSystem = applications.size > 1;
  const engineeringMeaning = crossSystem
    ? `This governed link connects engineering records across ${[...applications].sort().join(" and ")}, providing traceability for cross-system change review.`
    : "This governed link provides traceability between engineering records; its relevance to a proposed change should be assessed against the cited evidence.";
  const impactRationale = impact
    ? `An eligible impact traversal makes ${target.displayName} a potential downstream consideration when ${source.displayName} changes. It does not establish that a change will cause an effect.`
    : path.steps.length > 1
      ? `The multi-step chain links ${source.displayName} to ${target.displayName} through governed relationships; it establishes traceability, not causation.`
      : undefined;
  const explanation = impact
    ? `Changes to ${source.displayName} may require evaluating ${target.displayName} through this governed dependency chain.`
    : "";
  return {
    id: `${impact ? "impact" : "relationship"}:${path.id}`,
    text: [...steps, explanation, engineeringMeaning, impactRationale].filter(Boolean).join(" "),
    engineeringMeaning,
    ...(impactRationale ? { impactRationale } : {}),
    score: scoredPath.score,
    entityIds: [path.sourceEntityId, ...path.steps.map((step) => step.toEntityId)],
    relationshipIds: path.relationshipIds,
    citationIds: path.citationIds,
  };
}

export function buildReasoningPackage(input: {
  subject: string;
  questionIntent: CopilotContextPacket["questionIntent"];
  includeSubjectTraceability?: boolean;
  subjectApplicationParticipation?: readonly SubjectApplicationParticipation[];
  entities: readonly CopilotEntityContext[];
  relationships: readonly CopilotRelationshipContext[];
  relationshipPaths: readonly OntologyRelationshipPath[];
  impactPaths: readonly OntologyRelationshipPath[];
  impactChains?: InvestigationKnowledgeGraph["impactChains"];
  knowledgeGraphSummary?: InvestigationKnowledgeGraph["knowledgeGraphSummary"];
  evidence: readonly CopilotEvidenceContext[];
  findings: readonly CopilotFindingContext[];
  unresolvedRelationships: readonly CopilotUnresolvedEvaluationContext[];
  primaryEntityId?: string;
}): ReasoningPackage {
  const entityById = new Map(input.entities.map((entity) => [entity.entityId, entity]));
  const relationshipsById = new Map(input.relationships.map((relationship) => [relationship.relationshipId, relationship]));
  const subjectApplicationParticipation = [...(input.subjectApplicationParticipation ?? [])];
  const compactFourApplicationSubject = Boolean(
    input.includeSubjectTraceability && isFourApplicationSubjectParticipation(subjectApplicationParticipation),
  );
  const subjectTraceabilityRelationships: SubjectTraceabilityRelationshipArtifact[] = [];
  const subjectTraceabilityNarratives: SubjectTraceabilityNarrative[] = input.includeSubjectTraceability && !compactFourApplicationSubject
    ? subjectApplicationParticipation.map((participation) => {
    const representativeEntities = participation.representativeEntityIds
      .map((entityId) => entityById.get(entityId))
      .filter((entity): entity is CopilotEntityContext => Boolean(entity));
    const examples = representativeEntities.map((entity) =>
      entity.nativeId && !entity.displayName.includes(entity.nativeId)
        ? `${entity.displayName} (${entity.nativeId})`
        : entity.displayName,
    );
    const recordLabel = participation.participantCount === 1 ? "record" : "records";
    return {
        id: `subject-traceability:${participation.subjectId}:${participation.application}`,
        category: "subject-traceability",
        text: `${participation.application} contributes ${participation.participantCount} ${recordLabel} to the ${participation.subjectLabel} investigation subject${examples.length ? `, including ${examples.join(" and ")}` : ""}.`,
        meaning: "informational",
        authority: "investigation",
        strength: "informational",
        impactEligible: false,
        application: participation.application,
        participantCount: participation.participantCount,
        citationIds: representativeEntities.map((entity) => entity.citationId),
      };
    })
    : [];
  const scoredPaths = input.relationshipPaths
    .map((path) => scoreReasoningPath(path, entityById, relationshipsById))
    .sort((left, right) => right.score - left.score || left.path.relationshipIds.length - right.path.relationshipIds.length || left.path.id.localeCompare(right.path.id));
  const scoredImpactPaths = input.impactPaths
    .map((path) => scoreReasoningPath(path, entityById, relationshipsById))
    .sort((left, right) => right.score - left.score || left.path.relationshipIds.length - right.path.relationshipIds.length || left.path.id.localeCompare(right.path.id));

  const relatedByEntity = new Map<string, CopilotRelationshipContext[]>();
  for (const relationship of input.relationships) {
    for (const entityId of [relationship.sourceEntityId, relationship.targetEntityId]) {
      relatedByEntity.set(entityId, [...(relatedByEntity.get(entityId) ?? []), relationship]);
    }
  }
  const importanceByEntity: Record<string, EntityImportance> = {};
  for (const entity of input.entities) {
    const relationships = relatedByEntity.get(entity.entityId) ?? [];
    const evidenceIds = new Set(relationships.flatMap((relationship) => relationship.evidenceCitationIds));
    const findings = input.findings.filter((finding) => finding.subjectEntityIds.includes(entity.entityId));
    for (const finding of findings) for (const id of finding.evidenceCitationIds) evidenceIds.add(id);
    const impactCount = scoredImpactPaths.filter((item) =>
      item.path.sourceEntityId === entity.entityId || item.path.targetEntityId === entity.entityId,
    ).length;
    const neighboringApplications = new Set(relationships.flatMap((relationship) => {
      const otherId = relationship.sourceEntityId === entity.entityId ? relationship.targetEntityId : relationship.sourceEntityId;
      const application = entityById.get(otherId)?.source;
      return application && application !== entity.source ? [application] : [];
    }));
    const ontologyRelationships = relationships.filter((relationship) => Boolean(relationship.family));
    const ontologyStrength = ontologyRelationships.length
      ? ontologyRelationships.reduce((score, relationship) => score + strengthScore(relationship.strength), 0) / ontologyRelationships.length
      : 0;
    const evidenceCount = evidenceIds.size;
    const crossApplicationCount = neighboringApplications.size;
    const score = Number((
      businessWeight(entity) * 0.5 +
      Math.min(1, relationships.length / 4) * 0.15 +
      Math.min(1, evidenceCount / 3) * 0.1 +
      Math.min(1, impactCount / 3) * 0.1 +
      Math.min(1, crossApplicationCount / 3) * 0.05 +
      ontologyStrength * 0.1
    ).toFixed(3));
    importanceByEntity[entity.entityId] = {
      score,
      evidenceCount,
      relationshipCount: relationships.length,
      impactCount,
      crossApplicationCount,
      ontologyStrength,
    };
  }

  const rankedPrimaryEntities = [...input.entities]
    .sort((left, right) =>
      Number(right.entityId === input.primaryEntityId) - Number(left.entityId === input.primaryEntityId) ||
      (importanceByEntity[right.entityId]?.score ?? 0) - (importanceByEntity[left.entityId]?.score ?? 0) ||
      left.entityId.localeCompare(right.entityId),
    );
  const applicationRepresentativeEntities = [
    ...subjectApplicationParticipation.flatMap((participation) =>
      participation.representativeEntityIds.slice(0, 1).flatMap((entityId) => {
        const entity = rankedPrimaryEntities.find((candidate) => candidate.entityId === entityId);
        return entity ? [entity] : [];
      }),
    ),
    ...subjectApplicationParticipation.flatMap((participation) =>
      participation.representativeEntityIds.slice(1).flatMap((entityId) => {
      const entity = rankedPrimaryEntities.find((candidate) => candidate.entityId === entityId);
      return entity ? [entity] : [];
      }),
    ),
  ];
  const primaryEntities = [
    ...applicationRepresentativeEntities,
    ...rankedPrimaryEntities.filter((entity) =>
      !applicationRepresentativeEntities.some((selected) => selected.entityId === entity.entityId),
    ),
  ]
    .slice(0, COPILOT_RETRIEVAL_CONFIG.maxPrimaryEntities)
    .map((entity) => {
      const importance = importanceByEntity[entity.entityId] ?? {
        score: 0,
        evidenceCount: 0,
        relationshipCount: 0,
        impactCount: 0,
        crossApplicationCount: 0,
        ontologyStrength: 0,
      };
      return {
        entityId: entity.entityId,
        citationId: entity.citationId,
        displayName: entity.displayName,
        kind: entity.kind,
        importanceScore: importance.score,
        ...(entity.source ? { source: entity.source } : {}),
        ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
        importance,
      };
    });

  const relationshipNarratives = scoredPaths
    .flatMap((item) => {
      const narrative = pathNarrative(item, entityById, false);
      return narrative ? [narrative] : [];
    });
  const engineeringImpactChains: EngineeringImpactChain[] = scoredImpactPaths.flatMap((item) => {
    const materialized = input.impactChains?.find((chain) =>
      chain.sourceEntityId === item.path.sourceEntityId &&
      chain.impactedEntityId === item.path.targetEntityId &&
      chain.relationshipIds.length === item.path.relationshipIds.length &&
      chain.relationshipIds.every((id, index) => id === item.path.relationshipIds[index]),
    );
    const fallbackNarrative = pathNarrative(item, entityById, true);
    if (!fallbackNarrative && !materialized) return [];
    return [{
      id: materialized?.id ?? `impact-chain:${item.path.id}`,
      sourceEntityId: item.path.sourceEntityId,
      impactedEntityId: item.path.targetEntityId,
      relationshipIds: item.path.relationshipIds,
      relationshipSequence: materialized?.relationshipSequence ?? item.path.steps,
      supportingEvidence: materialized?.supportingEvidenceIds ?? item.path.citationIds.filter((id) => id.startsWith("cite:evidence:")),
      citationIds: materialized?.citationIds ?? item.path.citationIds,
      engineeringExplanation: materialized?.engineeringExplanation ?? fallbackNarrative!.text,
      confidence: materialized?.confidence ?? item.score,
      impactRationale: materialized?.impactRationale ?? fallbackNarrative!.impactRationale ?? "This is a potential impact path, not proof of causation.",
      pathScore: item.score,
    }];
  });
  const impactNarratives = scoredImpactPaths
    .flatMap((item) => {
      const narrative = pathNarrative(item, entityById, true);
      const impactChain = engineeringImpactChains.find((chain) =>
        chain.sourceEntityId === item.path.sourceEntityId && chain.impactedEntityId === item.path.targetEntityId,
      );
      return narrative && impactChain
        ? [{ ...narrative, text: `${impactChain.engineeringExplanation} ${impactChain.impactRationale}` }]
        : narrative ? [narrative] : [];
    });
  const strongestEvidence = [...input.evidence].slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems);

  const engineeringFindings: EngineeringFinding[] = input.findings.map((finding) => ({
    id: finding.findingId,
    kind: finding.kind,
    title: finding.title,
    summary: finding.summary,
    score: 0.75,
    entityIds: finding.subjectEntityIds,
    relationshipIds: [],
    citationIds: [...new Set([finding.citationId, ...finding.evidenceCitationIds])],
  }));
  const addPathFinding = (kind: string, title: string, item: ReasoningPath | undefined, summary?: string) => {
    if (!item) return;
    const narrative = pathNarrative(item, entityById, kind.includes("impact"));
    if (!narrative) return;
    engineeringFindings.push({
      id: `${kind}:${item.path.id}`,
      kind,
      title,
      summary: summary ?? narrative.text,
      score: item.score,
      entityIds: narrative.entityIds,
      relationshipIds: item.path.relationshipIds,
      citationIds: item.path.citationIds,
    });
  };
  if (strongestEvidence[0]) {
    const item = strongestEvidence[0];
    engineeringFindings.push({
      id: `strongest-evidence:${item.evidenceId}`,
      kind: "strongest-evidence",
      title: "Strongest available evidence",
      summary: item.summary,
      score: item.freshness === "current" ? 1 : 0.7,
      entityIds: [],
      relationshipIds: [],
      citationIds: [item.citationId],
    });
  }
  const missingEvidence: MissingEvidence[] = input.unresolvedRelationships.map((evaluation) => ({
    id: `missing:${evaluation.citationId}`,
    category: evaluation.reasonCode,
    description: evaluation.reason,
    entityIds: [...evaluation.sourceEntityIds, ...evaluation.targetEntityIds],
    citationIds: [evaluation.citationId, ...evaluation.evidenceCitationIds],
  }));
  if (
    (input.questionIntent === "impact" || input.questionIntent === "dependency") &&
    input.primaryEntityId &&
    !scoredImpactPaths.some((item) => item.path.sourceEntityId === input.primaryEntityId)
  ) {
    const entity = entityById.get(input.primaryEntityId);
    if (entity) missingEvidence.push({
      id: `missing-impact:${entity.entityId}`,
      category: "no-eligible-impact-chain",
      description: `No ontology-eligible impact chain was materialized from ${entity.displayName} in this investigation snapshot. This indicates limited evidence or coverage, not proof that no downstream impact exists.`,
      entityIds: [entity.entityId],
      citationIds: [entity.citationId],
    });
  }

  const riskSignal = [...scoredImpactPaths].sort((left, right) =>
    (left.score - right.score) ||
    (right.path.relationshipIds.length - left.path.relationshipIds.length),
  )[0];
  addPathFinding(
    "highest-risk-dependency-signal",
    "Highest risk signal to review",
    riskSignal,
    riskSignal
      ? `This potential dependency has comparatively lower evidence/confidence support (${riskSignal.score.toFixed(2)} heuristic score). Treat it as a review priority, not a determination of engineering risk. ${pathNarrative(riskSignal, entityById, true)?.text ?? ""}`
      : undefined,
  );
  addPathFinding("highest-confidence-engineering-dependency", "Highest-confidence engineering dependency", scoredPaths.find((item) => item.path.steps.length > 1) ?? scoredPaths[0]);

  const impactSurface = new Map<string, Set<string>>();
  for (const chain of engineeringImpactChains) {
    const impacted = entityById.get(chain.impactedEntityId);
    if (!impacted) continue;
    const application = impacted.source ?? "unknown";
    impactSurface.set(application, (impactSurface.get(application) ?? new Set<string>()).add(impacted.entityId));
  }
  const largestSurface = [...impactSurface.entries()]
    .sort((left, right) => right[1].size - left[1].size || left[0].localeCompare(right[0]))[0];
  if (largestSurface) {
    const [application, entityIds] = largestSurface;
    const relatedChains = engineeringImpactChains.filter((chain) => entityIds.has(chain.impactedEntityId));
    const citationIds = [...new Set([
      ...relatedChains.flatMap((chain) => chain.citationIds),
      ...[...entityIds].flatMap((entityId) => entityById.get(entityId)?.citationId ?? []),
    ])];
    engineeringFindings.push({
      id: `largest-impact-surface:${application}`,
      kind: "largest-impact-surface",
      title: "Largest potential impact surface",
      summary: `${entityIds.size} distinct entity/entities in ${application} appear at the end of ontology-eligible impact chains. This is potential coverage, not proof of realized impact.`,
      score: Math.min(1, entityIds.size / 5),
      entityIds: [...entityIds],
      relationshipIds: relatedChains.flatMap((chain) => chain.relationshipSequence.map((step) => step.relationshipId)),
      citationIds,
    });
    engineeringFindings.push({
      id: `most-impacted-application:${application}`,
      kind: "most-impacted-application",
      title: "Most impacted application",
      summary: `${application} contains the largest number of distinct targets in the retrieved potential impact chains (${entityIds.size}).`,
      score: Math.min(1, entityIds.size / 5),
      entityIds: [...entityIds],
      relationshipIds: relatedChains.flatMap((chain) => chain.relationshipSequence.map((step) => step.relationshipId)),
      citationIds,
    });
  }

  const crossApplicationPath = scoredPaths.find((item) => item.crossApplicationBonus > 0);
  addPathFinding("critical-cross-system-link", "Most critical cross-system link to review", crossApplicationPath);
  addPathFinding("strategic-cross-system-relationship", "Strategic cross-system relationship", crossApplicationPath,
    crossApplicationPath ? `This is the highest-ranked cross-application relationship signal in the retrieved context (score ${crossApplicationPath.score.toFixed(2)}). Strategic significance is a prioritization signal only; validate it against engineering and business context. ${pathNarrative(crossApplicationPath, entityById, false)?.text ?? ""}` : undefined);

  const supportedImpact = [...scoredImpactPaths].sort((left, right) =>
    right.evidenceStrength - left.evidenceStrength || right.score - left.score,
  ).find((item) => item.evidenceStrength > 0);
  addPathFinding("most-evidence-supported-impact", "Most evidence-supported potential impact", supportedImpact);

  const impactedStructure = engineeringImpactChains
    .map((chain) => ({ chain, entity: entityById.get(chain.impactedEntityId) }))
    .filter((item): item is { chain: EngineeringImpactChain; entity: CopilotEntityContext } =>
      Boolean(item.entity && /product|assembly|bom|part-occurrence|structure/i.test(item.entity.kind)),
    )
    .sort((left, right) => right.chain.pathScore - left.chain.pathScore)[0];
  if (impactedStructure) {
    engineeringFindings.push({
      id: `most-impacted-product-structure:${impactedStructure.entity.entityId}`,
      kind: "most-impacted-product-structure",
      title: "Most relevant impacted product structure",
      summary: `${impactedStructure.entity.displayName} (${impactedStructure.entity.kind}) is reached by a governed potential impact chain. ${impactedStructure.chain.impactRationale}`,
      score: impactedStructure.chain.pathScore,
      entityIds: [impactedStructure.chain.sourceEntityId, impactedStructure.entity.entityId],
      relationshipIds: impactedStructure.chain.relationshipSequence.map((step) => step.relationshipId),
      citationIds: [...impactedStructure.chain.supportingEvidence, entityById.get(impactedStructure.chain.sourceEntityId)?.citationId ?? "", impactedStructure.entity.citationId].filter(Boolean),
    });
  }

  const mostSignificantMissingEvidence = [...missingEvidence]
    .sort((left, right) => right.entityIds.length - left.entityIds.length || left.id.localeCompare(right.id))[0];
  if (mostSignificantMissingEvidence) {
    engineeringFindings.push({
      id: `significant-missing-evidence:${mostSignificantMissingEvidence.id}`,
      kind: "most-significant-missing-evidence",
      title: "Most significant evidence gap",
      summary: mostSignificantMissingEvidence.description,
      score: 0.65,
      entityIds: mostSignificantMissingEvidence.entityIds,
      relationshipIds: [],
      citationIds: mostSignificantMissingEvidence.citationIds,
    });
  }
  const mostImportantUnresolved = [...input.unresolvedRelationships]
    .sort((left, right) =>
      (right.sourceEntityIds.length * right.targetEntityIds.length) - (left.sourceEntityIds.length * left.targetEntityIds.length) ||
      left.ruleId.localeCompare(right.ruleId),
    )[0];
  if (mostImportantUnresolved) {
    engineeringFindings.push({
      id: `important-unresolved-relationship:${mostImportantUnresolved.citationId}`,
      kind: "most-important-unresolved-relationship",
      title: "Most important unresolved relationship",
      summary: mostImportantUnresolved.reason,
      score: 0.6,
      entityIds: [...mostImportantUnresolved.sourceEntityIds, ...mostImportantUnresolved.targetEntityIds],
      relationshipIds: [],
      citationIds: [
        mostImportantUnresolved.citationId,
        ...mostImportantUnresolved.evidenceCitationIds,
        ...mostImportantUnresolved.sourceEntityIds.map((id) => entityById.get(id)?.citationId ?? "").filter(Boolean),
        ...mostImportantUnresolved.targetEntityIds.map((id) => entityById.get(id)?.citationId ?? "").filter(Boolean),
      ],
    });
  }
  engineeringFindings.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  const applicationCoverage: Record<string, number> = {};
  for (const entity of input.entities) {
    const application = entity.source ?? "unknown";
    applicationCoverage[application] = (applicationCoverage[application] ?? 0) + 1;
  }
  const applicationsPresent = [...new Set(subjectApplicationParticipation.map((participation) => participation.application))]
    .sort(compareApplications);
  const subjectDisplayName = subjectApplicationParticipation[0]?.subjectLabel ?? input.subject;
  const evidenceBoundaryStatement = compactFourApplicationSubject
    ? "Shared subject participation does not establish a direct engineering relationship between their records."
    : "Shared subject participation does not prove that the source records represent the same enterprise object or have a direct engineering dependency.";
  const subjectParticipationSummary = compactFourApplicationSubject
    ? ""
    : subjectTraceabilityNarratives
    .map((narrative) => `${narrative.text.split(", including")[0]}.`)
    .join(" ");
  const representativeEntitiesByApplication = compactFourApplicationSubject ? {} : Object.fromEntries(
    subjectApplicationParticipation.reduce((groups, participation) => {
      const current = groups.get(participation.application) ?? [];
      groups.set(participation.application, [
        ...new Set([...current, ...participation.representativeEntityLabels]),
      ]);
      return groups;
    }, new Map<string, string[]>()),
  );
  const participatingApplications = new Set(subjectApplicationParticipation.map((participation) =>
    participation.application.toLocaleLowerCase(),
  ));
  const ontologyResolvedCrossSystemCount = input.relationships.filter((relationship) => {
    if (relationship.category !== "ontology-resolved") return false;
    const source = entityById.get(relationship.sourceEntityId)?.source?.toLocaleLowerCase();
    const target = entityById.get(relationship.targetEntityId)?.source?.toLocaleLowerCase();
    return Boolean(
      source &&
      target &&
      source !== target &&
      participatingApplications.has(source) &&
      participatingApplications.has(target),
    );
  }).length;
  const crossSystemParticipationSummary = compactFourApplicationSubject
    ? fourApplicationConnectivitySentence(applicationsPresent, subjectDisplayName)
    : applicationsPresent.length > 1
    ? `${joinApplicationNames(applicationsPresent)} contribute source-authoritative records to the same ${subjectDisplayName} investigation subject and are connected at the investigation level through subject-traceability. This shared participation does not establish a direct engineering relationship between those records. ${
        ontologyResolvedCrossSystemCount
          ? `${ontologyResolvedCrossSystemCount} ontology-resolved cross-system engineering relationship(s) are also present.`
          : "No ontology-resolved engineering relationship currently exists between these systems."
      }`
    : applicationsPresent.length === 1
      ? `${applicationsPresent[0]} contributes source-authoritative records to the ${subjectDisplayName} investigation subject through investigation-level subject traceability. ${evidenceBoundaryStatement}`
      : "";
  const crossApplicationCount = input.relationships.filter((relationship) => {
    const source = entityById.get(relationship.sourceEntityId)?.source;
    const target = entityById.get(relationship.targetEntityId)?.source;
    return Boolean(source && target && source !== target);
  }).length;
  const summary: InvestigationReasoningSummary = {
    applicationsPresent,
    subjectParticipationSummary,
    crossSystemParticipationSummary,
    representativeEntitiesByApplication,
    evidenceBoundaryStatement,
    crossSystemSummary: compactFourApplicationSubject
      ? ""
      : crossSystemParticipationSummary || (crossApplicationCount
      ? `${input.subject}: ${crossApplicationCount} retrieved relationship(s) connect different applications across ${Object.keys(applicationCoverage).length} represented application(s).`
      : `${input.subject}: no cross-application relationship was retrieved across ${Object.keys(applicationCoverage).length} represented application(s).`),
    relationshipCount: input.knowledgeGraphSummary?.relationshipCount ?? input.relationships.length,
    relationshipSummary: `${input.knowledgeGraphSummary?.relationshipCount ?? input.relationships.length} relationship(s) are represented; ${
      crossApplicationCount
        ? `${crossApplicationCount} retrieved relationship(s) cross application boundaries.`
        : "no cross-application relationship was retrieved."
    }`,
    applicationCoverage,
    keyDependencies: scoredPaths
      .filter((item) => item.path.steps.length > 1)
      .slice(0, 1)
      .map((item) => short(pathNarrative(item, entityById, false)?.text ?? "", 300)),
    mostConnectedEntities: primaryEntities.slice(0, 5).map((entity) => short(entity.displayName, 120)),
    highestValueRelationships: relationshipNarratives.slice(0, 1).map((item) => short(item.text, 300)),
    strongestEvidence: strongestEvidence.slice(0, 1).map((item) => short(item.summary, 300)),
    strongestImpactChains: impactNarratives.slice(0, 1).map((item) => short(item.text, 300)),
  };

  return {
    applicationsPresent: summary.applicationsPresent,
    subjectParticipationSummary: summary.subjectParticipationSummary,
    crossSystemParticipationSummary: summary.crossSystemParticipationSummary,
    representativeEntitiesByApplication: summary.representativeEntitiesByApplication,
    evidenceBoundaryStatement: summary.evidenceBoundaryStatement,
    primaryEntities,
    entityImportance: importanceByEntity,
    keyDependencies: scoredPaths.filter((item) => item.path.steps.length > 1).slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems),
    impactChains: engineeringImpactChains.slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems),
    strongestEvidence,
    engineeringFindings: engineeringFindings.slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems),
    relationshipNarratives: relationshipNarratives.slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems),
    subjectTraceabilityRelationships,
    subjectTraceabilityNarratives,
    subjectApplicationParticipation,
    impactNarratives: impactNarratives.slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems),
    unresolvedRelationships: input.unresolvedRelationships.slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems),
    missingEvidence: missingEvidence.slice(0, COPILOT_RETRIEVAL_CONFIG.maxReasoningItems),
    investigationSummary: summary,
  };
}

export function buildEngineeringBrief(
  reasoningPackage: ReasoningPackage,
  relationships: readonly CopilotRelationshipContext[],
  entities: readonly CopilotEntityContext[],
  relationshipFlow: Omit<RelationshipFlowDiagnostics, "copilotContext" | "engineeringBrief">,
  evidence: readonly CopilotEvidenceContext[],
  compactFourApplicationSubject = false,
): EngineeringBrief {
  const insightKinds = [
    "highest-risk-dependency-signal",
    "largest-impact-surface",
    "critical-cross-system-link",
    "highest-confidence-engineering-dependency",
    "most-evidence-supported-impact",
    "most-significant-missing-evidence",
    "strategic-cross-system-relationship",
    "most-impacted-application",
    "most-impacted-product-structure",
  ];
  const engineeringInsights = insightKinds.flatMap((kind) => {
    const insight = reasoningPackage.engineeringFindings.find((finding) => finding.kind === kind);
    return insight ? [insight] : [];
  });
  const topFindings = reasoningPackage.engineeringFindings.slice(0, 5);
  const topImpactChains = reasoningPackage.impactChains.slice(0, 5);
  const relationshipNarratives = reasoningPackage.relationshipNarratives.slice(0, 5);
  const subjectTraceabilityRelationships: ReasoningPackage["subjectTraceabilityRelationships"] = [];
  const subjectTraceabilityNarratives = reasoningPackage.subjectTraceabilityNarratives;
  const impactNarratives = reasoningPackage.impactNarratives.slice(0, 5);
  const strongestEvidence = reasoningPackage.strongestEvidence.slice(0, 5);
  const missingEvidence = reasoningPackage.missingEvidence.slice(0, 5);
  const unresolvedRelationships = reasoningPackage.unresolvedRelationships.slice(0, 5);
  const recommendedInvestigationAreas = [...new Set([
    ...missingEvidence.map((item) => item.description),
    ...unresolvedRelationships.map((item) => item.reason),
  ])].slice(0, 5);
  const impactSummary = topImpactChains.length
    ? ` The reasoning layer identified ${topImpactChains.length} governed potential impact chain(s) for review.`
    : " No governed potential impact chain was available in the reasoning package; this is not proof that no downstream impact exists.";
  const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));
  const majorRelationships = [...relationships]
    .filter((relationship) => relationship.category !== "subject-traceability")
    .sort((left, right) => {
      const crossesApplications = (relationship: CopilotRelationshipContext) => {
        const source = entityById.get(relationship.sourceEntityId)?.source;
        const target = entityById.get(relationship.targetEntityId)?.source;
        return source && target && source !== target ? 1 : 0;
      };
      return relationshipBusinessWeight(right) - relationshipBusinessWeight(left) ||
        crossesApplications(right) - crossesApplications(left) ||
        statusScore(right.status) - statusScore(left.status) ||
        strengthScore(right.strength) - strengthScore(left.strength) ||
        right.evidenceCitationIds.length - left.evidenceCitationIds.length ||
        left.relationshipId.localeCompare(right.relationshipId);
    })
    .slice(0, 5);
  const evidenceByCitationId = new Map(evidence.map((item) => [item.citationId, item]));
  const relationshipEvidence = [...new Set(majorRelationships.flatMap((relationship) => relationship.evidenceCitationIds))]
    .flatMap((citationId) => {
      const item = evidenceByCitationId.get(citationId);
      return item ? [item] : [];
    })
    .slice(0, 5);
  const briefEvidenceCount = new Set([
    ...strongestEvidence.map((item) => item.citationId),
    ...relationshipEvidence.map((item) => item.citationId),
  ]).size;
  const briefRelationshipFlow = {
    ...relationshipFlow,
    engineeringBrief: {
      relationshipCount: majorRelationships.length,
      impactPathCount: impactNarratives.length,
      impactChainCount: topImpactChains.length,
      unresolvedRelationshipCount: unresolvedRelationships.length,
      evidenceCount: briefEvidenceCount,
      relationshipNarrativeCount: relationshipNarratives.length,
      impactNarrativeCount: impactNarratives.length,
    },
  };

  const rankedBriefEntities = [...reasoningPackage.primaryEntities].sort((left, right) =>
    businessWeight(right) - businessWeight(left) ||
    right.importance.score - left.importance.score ||
    left.entityId.localeCompare(right.entityId),
  );
  const businessBriefEntities = rankedBriefEntities.filter((entity) => businessWeight(entity) > 0.2);
  const diverseBusinessEntities = [...rankedBriefEntities.reduce((selected, entity) => {
    const source = entity.source ?? "unknown";
    const current = selected.get(source);
    if (!current || (businessWeight(entity) > 0.2 && businessWeight(current) <= 0.2)) selected.set(source, entity);
    return selected;
  }, new Map<string, typeof rankedBriefEntities[number]>()).values()];
  const briefEntities = [
    ...diverseBusinessEntities,
    ...businessBriefEntities.filter((entity) => !diverseBusinessEntities.some((selected) => selected.entityId === entity.entityId)),
    ...rankedBriefEntities.filter((entity) => businessWeight(entity) <= 0.2),
  ].slice(0, 5);

  return {
    executiveSummary: `${reasoningPackage.investigationSummary.relationshipSummary}${impactSummary}`,
    crossSystemSummary: reasoningPackage.investigationSummary.crossSystemSummary,
    applicationsPresent: reasoningPackage.investigationSummary.applicationsPresent,
    subjectApplicationParticipation: reasoningPackage.subjectApplicationParticipation.map((participation) => {
      const kinds = participation.sourceKinds.map(normalizedBusinessText);
      const application = normalizedBusinessText(participation.application);
      const contribution = application === "codebeamer"
        ? "requirements"
        : application === "windchill"
          ? "engineering product records"
          : application === "sap"
            ? "operational material and transaction records"
            : application === "configit"
              ? "product models, features, families, and rules"
              : kinds.some((kind) => kind.includes("requirement"))
                ? "requirements"
                : kinds.some((kind) => ["part", "assembly", "change", "document", "cad"].some((term) => kind.includes(term)))
                  ? "engineering product records"
                  : kinds.some((kind) => ["material", "movement", "accounting", "product detail"].some((term) => kind.includes(term)))
                    ? "operational material and transaction records"
                    : "source-authoritative records";
      const representativeId = participation.representativeEntityIds[0];
      const representative = representativeId ? entityById.get(representativeId) : undefined;
      return {
        ...(compactFourApplicationSubject ? { subjectId: participation.subjectId } : {}),
        subjectLabel: participation.subjectLabel,
        application: participation.application,
        participantCount: participation.participantCount,
        ...(compactFourApplicationSubject
          ? representative
            ? {
                    representativeEntity: {
                      entityId: representative.entityId,
                      displayLabel: short(participation.representativeEntityLabels[0] ?? representative.displayName, 120),
                      kind: representative.kind,
                      sourceApplication: participation.application,
                      citationId: representative.citationId,
                      ...(representative.nativeId ? { nativeId: representative.nativeId } : {}),
                      semanticRole: representativeSemanticRole(representative, participation.application),
                      ...(participation.representativeEntityStatus
                        ? { status: participation.representativeEntityStatus }
                        : {}),
                    },
                  }
            : {}
          : {
                  representativeEntityIds: participation.representativeEntityIds,
                  representativeEntityLabels: participation.representativeEntityLabels,
                  representativeEntityKinds: participation.representativeEntityKinds,
            }),
        contribution,
      };
    }),
    representativeEntitiesByApplication: reasoningPackage.representativeEntitiesByApplication,
    evidenceBoundaryStatement: reasoningPackage.evidenceBoundaryStatement,
    subjectParticipationSummary: reasoningPackage.investigationSummary.subjectParticipationSummary,
    crossSystemParticipationSummary: reasoningPackage.investigationSummary.crossSystemParticipationSummary,
    primaryEntities: briefEntities.map((entity) => ({
      entityId: entity.entityId,
      citationId: entity.citationId,
      displayName: entity.displayName,
      kind: entity.kind,
      ...(entity.source ? { source: entity.source } : {}),
      ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
      importance: entity.importance,
    })),
    majorRelationships,
    relationshipNarratives,
    subjectTraceabilityRelationships,
    subjectTraceabilityNarratives,
    impactNarratives,
    relationshipEvidence,
    engineeringInsights,
    topFindings,
    topImpactChains,
    strongestEvidence,
    missingEvidence,
    unresolvedRelationships,
    recommendedInvestigationAreas,
    relationshipFlow: briefRelationshipFlow,
  };
}

export function ensureEngineeringAnswerCoverage(
  value: unknown,
  brief: EngineeringBrief,
  citations: readonly CopilotCitation[],
  includePrimaryEntities: boolean,
  questionIntent?: CopilotContextPacket["questionIntent"],
  contextPacket?: Pick<CopilotContextPacket, "entities" | "relationships" | "impactPaths" | "subjectTraceabilityDiagnostics" | "consequenceEvidenceState">,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const answer = value as Record<string, unknown>;
  if (typeof answer.answer !== "string" || !Array.isArray(answer.claims)) return value;
  if (contextPacket?.consequenceEvidenceState) return value;

  const knownCitationIds = new Set(citations.map((citation) => citation.citationId));
  const claims = [...answer.claims];
  const sections: string[] = [];
  const originalText = answer.answer;
  const participationWithRepresentatives = brief.subjectApplicationParticipation.map((participation) => {
    const compactRepresentative = participation.representativeEntity;
    const representativeEntityIds = compactRepresentative
      ? [compactRepresentative.entityId]
      : participation.representativeEntityIds ?? [];
    const representativeEntityLabels = compactRepresentative
      ? [compactRepresentative.displayLabel]
      : participation.representativeEntityLabels ?? [];
    const representativeEntityKinds = compactRepresentative
      ? [compactRepresentative.kind]
      : participation.representativeEntityKinds ?? [];
    const representativeCitationIds = compactRepresentative
      ? [compactRepresentative.citationId]
      : brief.primaryEntities
        .filter((entity) => representativeEntityIds.includes(entity.entityId))
        .map((entity) => entity.citationId);
    return {
      participation,
      representativeEntityIds,
      representativeEntityLabels,
      representativeEntityKinds,
      representativeCitationIds: [...new Set(representativeCitationIds)]
        .filter((citationId) => knownCitationIds.has(citationId)),
    };
  });
  const primaryRepresentatives = (() => {
    const applicationRepresentatives = participationWithRepresentatives.flatMap((item) => {
      const participation = item.participation;
      const compact = participation.representativeEntity;
      const primaryEntity = compact
        ? undefined
        : brief.primaryEntities.find((entity) =>
          item.representativeEntityIds.includes(entity.entityId),
        );
      const entityId = compact?.entityId ?? primaryEntity?.entityId;
      const citationId = compact?.citationId ?? primaryEntity?.citationId;
      const displayLabel = compact?.displayLabel ?? primaryEntity?.displayName;
      if (!entityId || !citationId || !displayLabel || !knownCitationIds.has(citationId)) return [];
      return [{
        entityId,
        citationId,
        displayLabel,
        kind: compact?.kind ?? primaryEntity?.kind ?? "",
        semanticRole: compact?.semanticRole ?? primaryEntity?.kind ?? compact?.kind ?? "",
        sourceApplication: compact?.sourceApplication ?? participation.application,
        ...(compact?.nativeId ?? primaryEntity?.nativeId
          ? { nativeId: compact?.nativeId ?? primaryEntity?.nativeId }
          : {}),
        ...(compact?.status ? { status: compact.status } : {}),
      }];
    });
    const uniqueApplications = new Set<string>();
    const balancedRepresentatives = applicationRepresentatives.filter((representative) => {
      const application = representative.sourceApplication.toLocaleLowerCase();
      if (uniqueApplications.has(application)) return false;
      uniqueApplications.add(application);
      return true;
    });
    if (balancedRepresentatives.length) return balancedRepresentatives;
    return brief.primaryEntities
      .filter((entity) => knownCitationIds.has(entity.citationId))
      .map((entity) => ({
        entityId: entity.entityId,
        citationId: entity.citationId,
        displayLabel: entity.displayName,
        kind: entity.kind,
        semanticRole: entity.kind,
        sourceApplication: entity.source ?? "",
        ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
      }));
  })();
  const requiredApplications = ["Codebeamer", "Windchill", "SAP", "Configit"];
  const requiresFourApplicationCoverage =
    participationWithRepresentatives.some((item) => item.participation.representativeEntity !== undefined) ||
    requiredApplications.every((application) =>
      brief.applicationsPresent.some((present) => present.toLocaleLowerCase() === application.toLocaleLowerCase()),
    );
  if (requiresFourApplicationCoverage) {
    for (const application of requiredApplications) {
      const participation = participationWithRepresentatives.find((item) =>
        item.participation.application.toLocaleLowerCase() === application.toLocaleLowerCase(),
      );
      if (!participation)
        throw new Error(`M1 answer coverage is missing required application ${application}.`);
      if (
        !participation.representativeEntityIds.some((entityId) => entityId.trim()) ||
        !participation.representativeEntityLabels.some((label) => label.trim())
      )
        throw new Error(`M1 answer coverage is missing a representative for ${application}.`);
      if (participation.representativeCitationIds.length === 0)
        throw new Error(`M1 answer coverage is missing a known representative citation for ${application}.`);
    }
  }
  const hasCitedClaim = (citationIds: readonly string[]) => claims.some((claim) =>
    Boolean(claim && typeof claim === "object" && "citationIds" in claim &&
      Array.isArray(claim.citationIds) &&
      claim.citationIds.some((id: unknown) => typeof id === "string" && citationIds.includes(id))),
  );
  const windchillParticipation = participationWithRepresentatives.find((item) =>
    item.participation.application.toLocaleLowerCase() === "windchill",
  );
  const sapParticipation = participationWithRepresentatives.find((item) =>
    item.participation.application.toLocaleLowerCase() === "sap",
  );
  const entityById = new Map((contextPacket?.entities ?? []).map((entity) => [entity.entityId, entity]));
  const hasOntologyResolvedWindchillSapRelationship =
    contextPacket?.subjectTraceabilityDiagnostics.hasOntologyResolvedWindchillSapRelationship ??
    (contextPacket?.relationships ?? []).some((relationship) => {
    if (relationship.category !== "ontology-resolved") return false;
    const sourceApplication = entityById.get(relationship.sourceEntityId)?.source?.toLocaleLowerCase();
    const targetApplication = entityById.get(relationship.targetEntityId)?.source?.toLocaleLowerCase();
    return sourceApplication === "windchill" && targetApplication === "sap" ||
      sourceApplication === "sap" && targetApplication === "windchill";
    });
  const hasWindchillSapImpactPath =
    contextPacket?.subjectTraceabilityDiagnostics.hasWindchillSapImpactPath ??
    (contextPacket?.impactPaths ?? []).some((path) => {
    if (!path.impactEligible) return false;
    const sourceApplication = entityById.get(path.sourceEntityId)?.source?.toLocaleLowerCase();
    const targetApplication = entityById.get(path.targetEntityId)?.source?.toLocaleLowerCase();
    return sourceApplication === "windchill" && targetApplication === "sap" ||
      sourceApplication === "sap" && targetApplication === "windchill";
    });
  if (
    questionIntent === "impact" &&
    windchillParticipation &&
    sapParticipation &&
    !hasOntologyResolvedWindchillSapRelationship &&
    !hasWindchillSapImpactPath
  ) {
    const citationIds = [...new Set([
      ...windchillParticipation.representativeCitationIds,
      ...sapParticipation.representativeCitationIds,
    ])];
    return {
      ...answer,
      answer: `The investigation contains Windchill and SAP records associated with the same ${windchillParticipation.participation.subjectLabel} investigation subject, but the saved evidence does not establish that the Windchill part is operationally represented as the SAP material. Therefore, no operational consequence can currently be established.`,
      claims: [{
        text: `Windchill and SAP records participate in the ${windchillParticipation.participation.subjectLabel} investigation subject, but no ontology-resolved Windchill-to-SAP relationship or eligible impact path is available.`,
        kind: "fact",
        citationIds,
      }],
      recommendations: [],
      uncertainties: ["The saved evidence does not establish the asserted Windchill-to-SAP operational representation."],
      followUpQuestions: [],
    };
  }

  if (includePrimaryEntities) {
    if (primaryRepresentatives.length) {
      sections.push([
        "Primary entities",
        ...primaryRepresentatives.map((entity) =>
          `- ${entity.displayLabel}\n  ${entity.semanticRole}; ${entity.sourceApplication}`,
        ),
      ].join("\n"));
    }
    for (const entity of primaryRepresentatives) {
      const citationIds = [entity.citationId].filter((id) => knownCitationIds.has(id));
      if (citationIds.length && !hasCitedClaim(citationIds)) claims.push({
        text: `${entity.displayLabel} is present in the investigation as a ${entity.semanticRole}${entity.sourceApplication ? ` from ${entity.sourceApplication}` : ""}.`,
        kind: "fact",
        citationIds,
      });
    }
  }

  if (brief.subjectApplicationParticipation.length) {
    const applicationLines = participationWithRepresentatives.map((item) => {
      const participation = item.participation;
      const contribution = participation.contribution;
      const representatives = item.representativeEntityLabels
        .map((label, index) => `${label}${item.representativeEntityKinds[index] ? ` (${item.representativeEntityKinds[index]})` : ""}`)
        .join(" and ");
      return `- ${participation.application}: ${participation.participantCount} participating records; contributes ${contribution}${representatives ? `; representative: ${representatives}` : ""}.`;
    });
    const subjectConnectivity = brief.crossSystemParticipationSummary;
    const applicationSection = [
      "Applications Present",
      ...applicationLines,
      ...(subjectConnectivity ? ["", "Subject Connectivity", subjectConnectivity] : []),
      ...(brief.evidenceBoundaryStatement ? ["", "Evidence Boundary", brief.evidenceBoundaryStatement] : []),
    ].join("\n");
    if (!originalText.includes("Applications Present")) sections.push(applicationSection);
    for (const item of participationWithRepresentatives) {
      const participation = item.participation;
      const citationIds = item.representativeCitationIds;
      if (citationIds.length && !hasCitedClaim(citationIds)) {
        claims.push({
          text: `${participation.application} contributes ${participation.participantCount} source records to the ${participation.subjectLabel} investigation subject.`,
          kind: "fact",
          citationIds,
        });
      }
    }
    const connectivityCitations = [...new Set(participationWithRepresentatives.flatMap((item) =>
      item.representativeCitationIds,
    ))];
    if (subjectConnectivity && connectivityCitations.length && !hasCitedClaim(connectivityCitations)) {
      claims.push({
        text: subjectConnectivity,
        kind: "fact",
        citationIds: connectivityCitations,
      });
    }
  }

  const relationLines = brief.relationshipNarratives
    .map((narrative) => ({
      text: narrative.text,
      citationIds: narrative.citationIds.filter((id) => knownCitationIds.has(id)),
      kind: narrative.relationshipIds.length > 1 ? "hypothesis" as const : "fact" as const,
      relationshipIds: narrative.relationshipIds,
    }))
    .filter((item) => item.citationIds.length > 0);
  const narrativeRelationshipIds = new Set(relationLines.flatMap((item) => item.relationshipIds));
  const uncoveredRelationships = brief.majorRelationships
    .filter((relationship) => !narrativeRelationshipIds.has(relationship.relationshipId))
    .map((relationship) => ({
      text: relationship.summary ?? `${relationship.kind} relationship between the selected investigation entities.`,
      citationIds: [
        relationship.citationId,
        relationship.sourceCitationId,
        relationship.targetCitationId,
        ...relationship.evidenceCitationIds,
      ].filter((id) => knownCitationIds.has(id)),
      kind: "fact" as const,
    }))
    .filter((item) => item.citationIds.length > 0);
  const relationshipLines = [...relationLines, ...uncoveredRelationships].slice(0, 5);
  const missingRelationshipLines = relationshipLines.filter((item) => !originalText.includes(item.text));
  if (missingRelationshipLines.length) {
    sections.push(["Governed relationships", ...missingRelationshipLines.map((item) => `- ${item.text}`)].join("\n"));
  }
  for (const item of relationshipLines) {
    if (!hasCitedClaim(item.citationIds)) claims.push({
      text: item.text,
      kind: item.kind,
      citationIds: item.citationIds,
    });
  }

  const provenanceLines = brief.majorRelationships.map((relationship) => {
    const provenance = relationship.provenance;
    const provenanceDetails = [
      relationship.status ? `status ${relationship.status}` : undefined,
      relationship.strength ? `strength ${relationship.strength}` : undefined,
      provenance?.authority ? `authority ${provenance.authority}` : undefined,
      provenance?.provider ? `provider ${provenance.provider}` : undefined,
      provenance?.ontologyVersion ? `ontology ${provenance.ontologyVersion}` : undefined,
    ].filter(Boolean);
    const evidenceDetails = brief.relationshipEvidence
      .filter((item) => relationship.evidenceCitationIds.includes(item.citationId))
      .map((item) => `${item.summary}${item.source ? ` (source: ${item.source})` : ""}`);
    return {
      text: `${relationship.summary ?? relationship.kind}${provenanceDetails.length ? `; ${provenanceDetails.join(", ")}` : ""}${evidenceDetails.length ? `; supporting evidence: ${evidenceDetails.join("; ")}` : ""}.`,
      citationIds: [
        relationship.citationId,
        ...relationship.evidenceCitationIds,
      ].filter((id) => knownCitationIds.has(id)),
    };
  }).filter((item) => item.citationIds.length > 0);
  const missingProvenanceLines = provenanceLines.filter((item) => !originalText.includes(item.text));
  if (missingProvenanceLines.length) {
    sections.push(["Relationship provenance and evidence", ...missingProvenanceLines.map((item) => `- ${item.text}`)].join("\n"));
  }
  for (const item of provenanceLines) {
    if (!hasCitedClaim(item.citationIds)) claims.push({
      text: item.text,
      kind: "fact",
      citationIds: item.citationIds,
    });
  }

  const impactLines = brief.impactNarratives
    .map((narrative) => ({
      text: narrative.text,
      citationIds: narrative.citationIds.filter((id) => knownCitationIds.has(id)),
    }))
    .filter((item) => item.citationIds.length > 0)
    .slice(0, 3);
  const missingImpactLines = impactLines.filter((item) => !originalText.includes(item.text));
  if (missingImpactLines.length) {
    sections.push(["Potential impact relationships", ...missingImpactLines.map((item) => `- ${item.text}`)].join("\n"));
  }
  for (const item of impactLines) {
    if (!hasCitedClaim(item.citationIds)) claims.push({
      text: item.text,
      kind: "hypothesis",
      citationIds: item.citationIds,
    });
  }

  return sections.length || claims.length > answer.claims.length
    ? { ...answer, answer: sections.length ? `${originalText}\n\n${sections.join("\n\n")}` : originalText, claims }
    : value;
}

function includeRetrievedDocumentEvidence<T extends object>(
  payload: T,
  contextPacket: CopilotContextPacket,
  retrievalEvidence?: readonly RetrievalEvidence[],
): T | (T & {
  retrievedDocumentEvidence: {
    authority: "retrieved-document";
    evidence: readonly RetrievalEvidence[];
    uncertaintyBoundary?: string;
  };
}) {
  if (!retrievalEvidence?.length) return payload;
  return {
    ...payload,
    retrievedDocumentEvidence: {
      authority: "retrieved-document",
      evidence: retrievalEvidence,
      ...(contextPacket.retrievalConfidence.belowThreshold
        ? {
            uncertaintyBoundary: "Graph confidence is below the configured threshold. Retrieved documents may support document-content claims only; they do not establish investigation-graph identity, relationships, impact paths, chains, or consequences.",
          }
        : {}),
    },
  };
}

export function engineeringPromptPayload(
  question: string,
  contextPacket: CopilotContextPacket,
  retrievalEvidence?: readonly RetrievalEvidence[],
) {
  const consequence = contextPacket.consequenceEvidenceState;
  if (consequence) {
    const resolvedRelationshipIds = new Set(contextPacket.relationships
      .filter((relationship) => consequence.resolvedRelationshipCitationIds.includes(relationship.citationId))
      .map((relationship) => relationship.relationshipId));
    const relevantPath = (path: OntologyRelationshipPath) =>
      path.impactEligible &&
      path.relationshipIds.some((relationshipId) => resolvedRelationshipIds.has(relationshipId));
    const entities = contextPacket.entities
      .filter((entity) => entity.entityId === consequence.sourceEntityId || entity.entityId === consequence.targetEntityId)
      .map(({ entityId, citationId, displayName, kind, source, nativeId }) => ({
        entityId,
        citationId,
        displayName: consequenceEndpointLabel(contextPacket, entityId, displayName),
        kind,
        ...(source ? { source } : {}),
        ...(nativeId ? { nativeId } : {}),
      }));
    return includeRetrievedDocumentEvidence({
      question,
      consequenceEvidenceState: consequence,
      requestedRelationshipType: consequence.requestedRelationshipType,
      requestedEntities: entities,
      resolvedRelationships: contextPacket.relationships.filter((relationship) =>
        consequence.resolvedRelationshipCitationIds.includes(relationship.citationId),
      ),
      impactPaths: contextPacket.impactPaths.filter(relevantPath),
      impactChains: contextPacket.reasoningPackage.impactChains.filter((chain) =>
        chain.relationshipIds.some((relationshipId) => resolvedRelationshipIds.has(relationshipId)),
      ),
      unresolvedEvaluations: contextPacket.unresolvedEvaluations.filter((evaluation) =>
        consequence.unresolvedEvaluationCitationIds.includes(evaluation.citationId),
      ),
      sameSubjectBackground: consequence.sameInvestigationSubject
        ? `Windchill and SAP records participate in ${contextPacket.subject ? `the ${contextPacket.subject} investigation` : "the same investigation"}.`
        : "",
      evidenceBoundary: "Shared investigation participation does not prove operational representation, dependency, or operational consequence.",
      citations: contextPacket.citations.filter((citation) => consequence.allowedCitationIds.includes(citation.citationId)),
    }, contextPacket, retrievalEvidence);
  }

  const { reasoningPackage, engineeringBrief, ...supportingContext } = contextPacket;
  const compactFourApplicationM1 = contextPacket.questionIntent === "summary" || contextPacket.questionIntent === "relationship"
    ? isFourApplicationSubjectParticipation(engineeringBrief.subjectApplicationParticipation)
    : false;
  const promptSupportingContext = compactFourApplicationM1
    ? {
        schemaVersion: contextPacket.schemaVersion,
        investigationId: contextPacket.investigationId,
        snapshotRevision: contextPacket.snapshotRevision,
        lifecycle: contextPacket.lifecycle,
        userMessage: contextPacket.userMessage,
        questionIntent: contextPacket.questionIntent,
        citations: contextPacket.citations,
        grounding: contextPacket.grounding,
        uncertainties: contextPacket.uncertainties,
        omissions: contextPacket.omissions,
        retrievalConfidence: contextPacket.retrievalConfidence,
      }
    : contextPacket.questionIntent === "summary"
    ? {
        ...supportingContext,
        relationships: supportingContext.relationships.filter((relationship) =>
          relationship.category !== "subject-traceability",
        ),
        entities: contextPacket.entities.map((entity) => ({
          entityId: entity.entityId,
          citationId: entity.citationId,
          displayName: entity.displayName,
          kind: entity.kind,
          importanceScore: entity.importanceScore,
          identityQuality: entity.identityQuality,
          ...(entity.source ? { source: entity.source } : {}),
          ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
          freshness: entity.freshness,
        })),
        conflicts: [],
      }
    : supportingContext;
  const promptRelationshipFlow = {
    ...contextPacket.relationshipFlow,
    promptPayload: {
      relationshipCount: engineeringBrief.majorRelationships.length,
      subjectTraceabilityRelationshipCount: engineeringBrief.subjectTraceabilityRelationships.length,
      subjectTraceabilityNarrativeCount: engineeringBrief.subjectTraceabilityNarratives.length,
      impactPathCount: engineeringBrief.impactNarratives.length,
      impactChainCount: engineeringBrief.topImpactChains.length,
      unresolvedRelationshipCount: engineeringBrief.unresolvedRelationships.length,
      evidenceCount: new Set([
        ...engineeringBrief.strongestEvidence.map((item) => item.citationId),
        ...engineeringBrief.relationshipEvidence.map((item) => item.citationId),
      ]).size,
    },
  };
  if (compactFourApplicationM1) {
    const connectivityNarrative = [
      engineeringBrief.crossSystemParticipationSummary,
      engineeringBrief.evidenceBoundaryStatement,
    ].filter(Boolean).join(" ");
    return includeRetrievedDocumentEvidence({
      question,
      engineeringBrief: {
        applicationsPresent: engineeringBrief.applicationsPresent,
        subjectApplicationParticipation: engineeringBrief.subjectApplicationParticipation,
        subjectParticipationSummary: "",
        crossSystemParticipationSummary: connectivityNarrative,
        primaryEntities: engineeringBrief.subjectApplicationParticipation.flatMap((participation) =>
          participation.representativeEntity
            ? [{
                entityId: participation.representativeEntity.entityId,
                citationId: participation.representativeEntity.citationId,
                displayName: participation.representativeEntity.displayLabel,
                kind: participation.representativeEntity.kind,
                source: participation.application.toLocaleLowerCase(),
              }]
            : [],
        ),
        majorRelationships: engineeringBrief.majorRelationships,
        relationshipNarratives: engineeringBrief.relationshipNarratives,
        subjectTraceabilityRelationships: [],
        subjectTraceabilityNarratives: [],
        relationshipEvidence: engineeringBrief.relationshipEvidence,
        relationshipFlow: promptRelationshipFlow,
      },
      engineeringInsights: [],
      investigationSummary: { crossSystemParticipationSummary: "" },
      topFindings: [],
      topImpactChains: [],
      strongestEvidence: [],
      missingEvidence: [],
      unresolvedRelationships: [],
      recommendedInvestigationAreas: [],
      supportingContext: promptSupportingContext,
    }, contextPacket, retrievalEvidence);
  }

  return includeRetrievedDocumentEvidence({
    question,
    engineeringBrief: {
      executiveSummary: engineeringBrief.executiveSummary,
      crossSystemSummary: engineeringBrief.crossSystemSummary,
      applicationsPresent: engineeringBrief.applicationsPresent,
      subjectParticipationSummary: engineeringBrief.subjectParticipationSummary,
      crossSystemParticipationSummary: engineeringBrief.crossSystemParticipationSummary,
      primaryEntities: engineeringBrief.primaryEntities.map((entity) => ({
        entityId: entity.entityId,
        citationId: entity.citationId,
        displayName: entity.displayName,
        kind: entity.kind,
        ...(entity.source ? { source: entity.source } : {}),
        ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
        importance: entity.importance,
      })),
      majorRelationships: engineeringBrief.majorRelationships,
      relationshipNarratives: engineeringBrief.relationshipNarratives,
      subjectTraceabilityRelationships: engineeringBrief.subjectTraceabilityRelationships,
      subjectTraceabilityNarratives: engineeringBrief.subjectTraceabilityNarratives,
      subjectApplicationParticipation: engineeringBrief.subjectApplicationParticipation,
      representativeEntitiesByApplication: engineeringBrief.representativeEntitiesByApplication,
      evidenceBoundaryStatement: engineeringBrief.evidenceBoundaryStatement,
      impactNarratives: engineeringBrief.impactNarratives,
      relationshipEvidence: engineeringBrief.relationshipEvidence,
      relationshipFlow: promptRelationshipFlow,
    },
    engineeringInsights: engineeringBrief.engineeringInsights,
    investigationSummary: reasoningPackage.investigationSummary,
    topFindings: engineeringBrief.topFindings,
    topImpactChains: engineeringBrief.topImpactChains,
    strongestEvidence: engineeringBrief.strongestEvidence,
    missingEvidence: engineeringBrief.missingEvidence,
    unresolvedRelationships: engineeringBrief.unresolvedRelationships,
    recommendedInvestigationAreas: engineeringBrief.recommendedInvestigationAreas,
    supportingContext: promptSupportingContext,
  }, contextPacket, retrievalEvidence);
}

export function consequenceEndpointLabel(
  context: CopilotContextPacket,
  entityId: string | undefined,
  fallback: string,
): string {
  const entity = context.entities.find((candidate) => candidate.entityId === entityId);
  if (!entity) return fallback;

  const source = entity.source?.toLocaleLowerCase();
  const application = source === "sap"
    ? "SAP"
    : source === "windchill"
      ? "Windchill"
      : entity.source
        ? `${entity.source[0].toLocaleUpperCase()}${entity.source.slice(1)}`
        : undefined;
  const entityKind = source === "windchill" && /part/i.test(entity.kind)
    ? "part"
    : source === "sap" && (/material/i.test(entity.kind) || entity.kind === "source-representation")
      ? "material"
      : entity.kind.replace(/[-_]/g, " ");
  const nativeIdentifier = source === "windchill"
    ? entity.properties.partNumber ??
      entity.properties["Item ID"] ??
      entity.nativeId?.split(/[\/#]/)[0]?.split(":").at(-1)
    : source === "sap"
      ? entity.properties.materialNumber ?? entity.nativeId
      : entity.nativeId;
  const safeIdentifier = nativeIdentifier &&
    nativeIdentifier.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9 .:_/#()-]*$/.test(nativeIdentifier)
    ? nativeIdentifier
    : undefined;

  if (application && safeIdentifier) return `${application} ${entityKind} ${safeIdentifier}`;
  const displayName = entity.displayName.trim();
  if (application && displayName && displayName.length <= 120 &&
      /^[A-Za-z0-9][A-Za-z0-9 .:_/#()-]*$/.test(displayName)) {
    return `${application} ${displayName}`;
  }
  return displayName && displayName.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9 .:_/#()-]*$/.test(displayName)
    ? displayName
    : fallback;
}

function projectM2EngineeringBrief(engineeringBrief: EngineeringBrief): EngineeringBrief {
  return {
    ...engineeringBrief,
    executiveSummary: "",
    crossSystemSummary: "",
    applicationsPresent: [],
    subjectParticipationSummary: "",
    crossSystemParticipationSummary: "",
    primaryEntities: [],
    majorRelationships: [],
    relationshipNarratives: [],
    subjectTraceabilityRelationships: [],
    subjectTraceabilityNarratives: [],
    subjectApplicationParticipation: [],
    representativeEntitiesByApplication: {},
    evidenceBoundaryStatement: "",
    impactNarratives: engineeringBrief.impactNarratives,
    topImpactChains: [],
    relationshipEvidence: [],
    engineeringInsights: [],
    topFindings: [],
    strongestEvidence: [],
    missingEvidence: [],
    unresolvedRelationships: [],
    recommendedInvestigationAreas: [],
    relationshipFlow: {
      ontologyGraph: {
        relationshipCount: 0,
        impactPathCount: 0,
        impactChainCount: 0,
        unresolvedRelationshipCount: 0,
        evidenceCount: 0,
        relationshipDefinitionCount: 0,
      },
      reasoningPackage: {
        relationshipCount: 0,
        impactPathCount: 0,
        impactChainCount: 0,
        unresolvedRelationshipCount: 0,
        evidenceCount: 0,
      },
      engineeringBrief: {
        relationshipCount: 0,
        impactPathCount: 0,
        impactChainCount: 0,
        unresolvedRelationshipCount: 0,
        evidenceCount: 0,
        relationshipNarrativeCount: 0,
        impactNarrativeCount: 0,
      },
    },
  };
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
  const questionIntent = classifyQuestion(message);
  const investigationScoped = isInvestigationScopedQuestion(message, questionIntent);
  const includeSubjectTraceability = investigationScoped &&
    (questionIntent === "summary" || questionIntent === "relationship");
  const subjectEntities = includeSubjectTraceability
    ? canonical?.knowledgeGraph?.entities
        .filter((entity) => entity.kind === "investigation-subject")
        .map(normalizedSubjectEntity) ?? []
    : [];
  const allEntityContexts = [
    ...(canonical?.entities ?? []).map(normalizedEntity),
    ...subjectEntities,
  ];
  const entityById = new Map(allEntityContexts.map((entity) => [entity.entityId, entity]));
  const graphSubjectTraceabilityEdgeCount = canonical?.knowledgeGraph?.subjectTraceabilityRelationships.length ?? 0;
  const canonicalEntityApplication = new Map((canonical?.entities ?? []).map((entity) => [
    entity.id,
    entity.provenance.source?.toLocaleLowerCase(),
  ]));
  const hasOntologyResolvedWindchillSapRelationship = (canonical?.knowledgeGraph?.resolvedRelationships ?? []).some((relationship) => {
    const sourceApplication = canonicalEntityApplication.get(relationship.sourceEntityId);
    const targetApplication = canonicalEntityApplication.get(relationship.targetEntityId);
    return sourceApplication === "windchill" && targetApplication === "sap" ||
      sourceApplication === "sap" && targetApplication === "windchill";
  });
  const hasWindchillSapImpactPath = (canonical?.knowledgeGraph?.impactPaths ?? []).some((path) => {
    if (!path.impactEligible) return false;
    const sourceApplication = canonicalEntityApplication.get(path.sourceEntityId);
    const targetApplication = canonicalEntityApplication.get(path.targetEntityId);
    return sourceApplication === "windchill" && targetApplication === "sap" ||
      sourceApplication === "sap" && targetApplication === "windchill";
  });
  const applicationParticipation = investigationScoped
    ? subjectApplicationParticipation(
        canonical?.knowledgeGraph?.subjectTraceabilityRelationships ?? [],
        allEntityContexts,
        snapshot.subjectLabel,
        canonical?.relationships ?? [],
      )
    : [];
  const compactFourApplicationSubject = includeSubjectTraceability &&
    isFourApplicationSubjectParticipation(applicationParticipation);
  const representativeSubjectEntityIds = new Set(applicationParticipation.flatMap((participation) =>
    participation.representativeEntityIds,
  ));
  const rankedEntityCandidates = rankEntityCandidates(message, allEntityContexts, canonical);
  const entityCandidates = questionIntent === "summary"
    ? allEntityContexts
      .map((entity) => ({
        entity,
        score: relevance(message, [entity.displayName, entity.kind, entity.source ?? ""]) +
          businessWeight(entity) * 100,
      }))
      .sort((left, right) =>
        right.score - left.score ||
        businessWeight(right.entity) - businessWeight(left.entity) ||
        left.entity.entityId.localeCompare(right.entity.entityId),
      )
      .slice(0, 10)
      .map(({ entity, score }) => ({
        entityId: entity.entityId,
        label: entity.displayName,
        ...(entity.source ? { source: entity.source } : {}),
        ...(entity.nativeId ? { nativeId: entity.nativeId } : {}),
        score: Math.min(1, score / 100),
        matchBasis: "lexical" as const,
        citationId: entity.citationId,
      }))
    : rankedEntityCandidates;
  const entityConfidence = entityCandidates[0]?.score ?? 0;
  const exactIdentifierCandidates = entityCandidates.filter((candidate) => candidate.matchBasis === "exact-identifier");
  const governedPropertyCandidates = entityCandidates.filter((candidate) => candidate.matchBasis === "governed-property");
  const identifierTokens = identifierCandidates(message);
  const exactIdentifierMatchCounts = new Map(
    identifierTokens.map((token) => [
      token.toLocaleLowerCase(),
      allEntityContexts.filter((entity) =>
        exactQueryMatch(message, entity.nativeId ?? "") && containsExactIdentifier(token, entity.nativeId ?? "") ||
        exactQueryMatch(message, entity.entityId) && containsExactIdentifier(token, entity.entityId),
      ).length,
    ]),
  );
  const governedPropertyTokens = new Set(
    allEntityContexts.flatMap((entity) =>
      Object.entries(entity.properties)
        .filter(([key, value]) => canonical?.knowledgeGraph?.ontology.relationshipDefinitions
          .flatMap((definition) => definition.evidenceRules.flatMap((rule) => [rule.sourcePath, rule.targetPath]))
          .includes(key) && exactQueryMatch(message, value))
        .map(([, value]) => value.toLocaleLowerCase()),
    ),
  );
  const hasAmbiguousExplicitMatch = [...exactIdentifierMatchCounts.values()].some((count) => count > 1) ||
    [...governedPropertyTokens].some((value) =>
      allEntityContexts.filter((entity) =>
        Object.entries(entity.properties).some(([key, property]) =>
          property.toLocaleLowerCase() === value &&
          canonical?.knowledgeGraph?.ontology.relationshipDefinitions
            .flatMap((definition) => definition.evidenceRules.flatMap((rule) => [rule.sourcePath, rule.targetPath]))
            .includes(key),
        ),
      ).length > 1,
    );
  const highestPrecedenceMatches = exactIdentifierCandidates.length ? exactIdentifierCandidates : governedPropertyCandidates;
  const ambiguous = entityCandidates.length > 1 &&
    entityCandidates[0].score - entityCandidates[1].score < COPILOT_RETRIEVAL_CONFIG.ambiguityMargin;
  const requiresEntity = !investigationScoped;
  const clarificationRequired = requiresEntity && (
    hasAmbiguousExplicitMatch ||
    (highestPrecedenceMatches.length === 0 && entityConfidence < COPILOT_RETRIEVAL_CONFIG.lowConfidenceThreshold)
  );
  const ambiguityNotice = ambiguous
    ? `Multiple entities matched this question. Analysis uses the strongest match, ${entityCandidates[0].label} (rank score ${entityCandidates[0].score.toFixed(2)}); other candidates were retained because their scores were within ${COPILOT_RETRIEVAL_CONFIG.ambiguityMargin.toFixed(2)}.`
    : undefined;
  const selectedEntityIds = clarificationRequired || investigationScoped && questionIntent !== "summary" ? [] : questionIntent === "summary"
    ? entityCandidates.slice(0, 3).map((candidate) => candidate.entityId)
    : highestPrecedenceMatches.length
      ? [...new Set(highestPrecedenceMatches.map((candidate) => candidate.entityId))]
    : entityCandidates.length
      ? [entityCandidates[0].entityId]
      : [];
  const entitiesByRelevance = allEntityContexts.sort((left, right) => {
    const leftScore = relevance(message, [left.entityId, left.displayName, left.kind, left.source ?? "", left.nativeId ?? "", ...Object.entries(left.properties).flat()]);
    const rightScore = relevance(message, [right.entityId, right.displayName, right.kind, right.source ?? "", right.nativeId ?? "", ...Object.entries(right.properties).flat()]);
    return rightScore - leftScore || left.entityId.localeCompare(right.entityId);
  });
  let allEvidence = evidenceList(canonical).map(normalizedEvidence).sort((left, right) => {
    const leftScore = relevance(message, [left.evidenceId, left.kind, left.summary, left.source ?? ""]);
    const rightScore = relevance(message, [right.evidenceId, right.kind, right.summary, right.source ?? ""]);
    return rightScore - leftScore || left.evidenceId.localeCompare(right.evidenceId);
  });
  const allFindings = (canonical?.findings ?? []).map(normalizeFinding).sort((left, right) => {
    const leftScore = relevance(message, [left.findingId, left.title, left.summary, left.kind]);
    const rightScore = relevance(message, [right.findingId, right.title, right.summary, right.kind]);
    return rightScore - leftScore || left.findingId.localeCompare(right.findingId);
  });
  const direction = relationshipDirection(message);
  const scoredRelationships = relationshipList(canonical, includeSubjectTraceability)
    .filter((relation) =>
      relation.category !== "subject-traceability" ||
      representativeSubjectEntityIds.has(relation.sourceEntityId),
    )
    .map((relation) => ({
    relation,
    score: Math.max(
      relation.category === "subject-traceability" && investigationScoped ? 1 : 0,
      relevance(message, [
        relation.id,
        relation.kind ?? "",
        relation.type ?? "",
        relation.family ?? "",
        relation.sourceEntityId,
        relation.targetEntityId,
        ...[relation.sourceEntityId, relation.targetEntityId].flatMap((entityId) => {
          const endpoint = entityById.get(entityId);
          return endpoint
            ? [
                endpoint.displayName,
                endpoint.source ?? "",
                endpoint.nativeId ?? "",
                ...Object.entries(endpoint.properties).flat(),
              ]
            : [];
        }),
      ]),
    ),
  }));
  const focusEntity = questionIntent === "summary"
    ? undefined
    : entityById.get(selectedEntityIds[0] ?? "")
      ?? allEntityContexts
        .filter((entity) => entity.nativeId && containsExactIdentifier(message, entity.nativeId))
        .sort((left, right) => (right.nativeId?.length ?? 0) - (left.nativeId?.length ?? 0) || left.entityId.localeCompare(right.entityId))[0];
  const focalEntityId = focusEntity?.entityId;
  const requestedTraversalDepth = options.maxTraversalDepth ?? COPILOT_RETRIEVAL_CONFIG.maxTraversalDepth;
  const traversalDepth = Number.isFinite(requestedTraversalDepth) && requestedTraversalDepth > 0
    ? Math.floor(requestedTraversalDepth)
    : COPILOT_RETRIEVAL_CONFIG.maxTraversalDepth;
  const allRelationships = orderRelationshipsFromFocus(
    scoredRelationships,
    focalEntityId,
    direction,
    traversalDepth,
  ).sort((left, right) => {
    const applicationCrossing = (item: typeof left) => {
      const source = entityById.get(item.relation.sourceEntityId)?.source;
      const target = entityById.get(item.relation.targetEntityId)?.source;
      return source && target && source !== target ? 1 : 0;
    };
    return relationshipBusinessWeightValue(right.relation.kind ?? right.relation.type, right.relation.family) -
      relationshipBusinessWeightValue(left.relation.kind ?? left.relation.type, left.relation.family) ||
      applicationCrossing(right) - applicationCrossing(left) ||
      left.distance - right.distance ||
      right.score - left.score ||
      left.relation.id.localeCompare(right.relation.id);
  });
  const relationshipSections = parseRelationshipGuidance(options.relationshipDocument ?? "");
  const documentedPairs = new Set(relationshipSections.map((section) => applicationPairKey(section.sourceApplication, section.targetApplication)));
  const relevantUnresolvedEvaluations = unresolvedEvaluations(canonical, documentedPairs)
    .filter((evaluation) => (
      !focalEntityId ||
      evaluation.sourceEntityIds.includes(focalEntityId) ||
      evaluation.targetEntityIds.includes(focalEntityId)
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
  const allRelationshipPaths = canonical?.knowledgeGraph?.relationshipPaths ?? [];
  const allImpactPaths = canonical?.knowledgeGraph?.impactPaths ?? [];
  const impactLikeQuestion = ["impact", "dependency", "change-analysis", "risk", "root-cause"].includes(questionIntent);
  const pathPool = impactLikeQuestion
    ? allImpactPaths
    : allRelationshipPaths;
  const relevantPathCandidates = clarificationRequired ? [] : pathPool
    .filter((path) => !focalEntityId || path.sourceEntityId === focalEntityId);
  const relevantImpactPathCandidates = clarificationRequired ? [] : allImpactPaths
    .filter((path) => !focalEntityId || path.sourceEntityId === focalEntityId);
  const allEvidenceById = new Map(allEvidence.map((item) => [item.evidenceId, item]));
  const allRelationshipContexts = scoredRelationships.flatMap(({ relation }) => {
    const normalized = normalizedRelationship(
      relation,
      entityById,
      allEvidenceById,
      Boolean(relation.family),
    );
    return normalized ? [normalized] : [];
  });
  const allRelationshipContextsById = new Map(allRelationshipContexts.map((relationship) => [relationship.relationshipId, relationship]));
  const rankPaths = (paths: readonly OntologyRelationshipPath[]) => paths
    .map((path) => scoreReasoningPath(path, entityById, allRelationshipContextsById))
    .sort((left, right) =>
      right.score - left.score ||
      right.crossApplicationBonus - left.crossApplicationBonus ||
      left.path.relationshipIds.length - right.path.relationshipIds.length ||
      left.path.id.localeCompare(right.path.id),
    )
    .slice(0, maxItems)
    .map((item) => item.path);
  const allRelevantPaths = rankPaths(relevantPathCandidates);
  const allRelevantImpactPaths = rankPaths(relevantImpactPathCandidates);
  const resolvedDefinitionIds = new Map(
    (canonical?.knowledgeGraph?.resolvedRelationships ?? []).map((relationship) => [relationship.id, relationship.definitionId]),
  );
  const relevantDefinitionIds = new Set([
    ...allRelationships.flatMap(({ relation }) => relation.family ? [relation.family] : []),
    ...allRelevantPaths.flatMap((path) => path.relationshipIds.flatMap((id) => {
      const definitionId = resolvedDefinitionIds.get(id);
      return definitionId ? [definitionId] : [];
    })),
    ...allRelevantImpactPaths.flatMap((path) => path.relationshipIds.flatMap((id) => {
      const definitionId = resolvedDefinitionIds.get(id);
      return definitionId ? [definitionId] : [];
    })),
    ...relevantUnresolvedEvaluations.map((evaluation) => evaluation.ruleId),
  ]);
  const relationshipDefinitions = (canonical?.knowledgeGraph?.ontology.relationshipDefinitions ?? [])
    .filter((definition) => relevantDefinitionIds.has(definition.id))
    .slice(0, maxItems);
  const directEvidenceIds = new Set((canonical?.findings ?? [])
    .filter((finding) => !focalEntityId || finding.subjectEntityIds.includes(focalEntityId))
    .flatMap((finding) => finding.evidenceIds.map((id) => stableCitationId("evidence", id))));
  const relationshipEvidenceIds = new Set(allRelationships.flatMap(({ relation }) =>
    [...(relation.evidenceIds ?? []), ...(relation.evidenceId ? [relation.evidenceId] : [])]
      .map((id) => stableCitationId("evidence", id)),
  ));
  const dependencyEvidenceIds = new Set(allRelevantPaths
    .filter((path) => path.steps.length > 1)
    .flatMap((path) => path.citationIds.filter((id) => id.startsWith("cite:evidence:"))));
  const impactEvidenceIds = new Set(allRelevantImpactPaths
    .filter((path) => path.impactEligible)
    .flatMap((path) => path.citationIds.filter((id) => id.startsWith("cite:evidence:"))));
  const evidencePriority = new Map<string, number>();
  for (const [priority, ids] of [
    directEvidenceIds,
    relationshipEvidenceIds,
    dependencyEvidenceIds,
    impactEvidenceIds,
  ].entries()) for (const id of ids) evidencePriority.set(id, Math.min(priority, evidencePriority.get(id) ?? priority));
  allEvidence = allEvidence.sort((left, right) =>
    (evidencePriority.get(left.citationId) ?? 4) - (evidencePriority.get(right.citationId) ?? 4) ||
    relevance(message, [right.evidenceId, right.kind, right.summary, right.source ?? ""]) -
    relevance(message, [left.evidenceId, left.kind, left.summary, left.source ?? ""]) ||
    left.evidenceId.localeCompare(right.evidenceId),
  );
  const relevantUnresolvedCitationIds = new Set(relevantUnresolvedEvaluations.map((evaluation) => evaluation.citationId));
  const isConsequenceQuestion = questionIntent === "impact" &&
    /windchill/i.test(message) &&
    /\bsap\b/i.test(message) &&
    /(operational consequence|represented as|operationally represented)/i.test(message);
  const allUnresolved = unresolvedEvaluations(canonical, documentedPairs)
    .filter((evaluation) =>
      isConsequenceQuestion || !focalEntityId || relevantUnresolvedCitationIds.has(evaluation.citationId),
    );
  const m2EvidenceState = consequenceEvidenceState(
    message,
    isConsequenceQuestion,
    allEntityContexts,
    allRelationships.map(({ relation }) => relation),
    canonical?.knowledgeGraph?.impactPaths ?? allRelevantImpactPaths,
    allUnresolved,
    canonical?.knowledgeGraph,
  );
  const fullReasoningPackage = buildReasoningPackage({
    subject: snapshot.subjectLabel,
    questionIntent,
    includeSubjectTraceability,
    subjectApplicationParticipation: applicationParticipation,
    entities: allEntityContexts,
    relationships: allRelationshipContexts,
    relationshipPaths: allRelevantPaths,
    impactPaths: allRelevantImpactPaths,
    impactChains: canonical?.knowledgeGraph?.impactChains,
    knowledgeGraphSummary: canonical?.knowledgeGraph?.knowledgeGraphSummary,
    evidence: allEvidence,
    findings: allFindings,
    unresolvedRelationships: allUnresolved,
    primaryEntityId: focalEntityId,
  });
  const graph = canonical?.knowledgeGraph;
  const relationshipFlowBase = {
    ontologyGraph: {
      relationshipCount: graph?.knowledgeGraphSummary?.relationshipCount ??
        (graph ? new Set([
          ...graph.canonicalRelationships.map((relationship) => relationship.id),
          ...graph.resolvedRelationships.flatMap((relationship) =>
            relationship.canonicalRelationshipIds.length
              ? relationship.canonicalRelationshipIds
              : [relationship.id],
          ),
        ]).size : 0),
      impactPathCount: graph?.impactPaths.length ?? 0,
      impactChainCount: graph?.impactChains?.length ?? 0,
      unresolvedRelationshipCount: graph?.unresolvedEvaluations.length ?? 0,
      evidenceCount: graph?.knowledgeGraphSummary?.evidenceCount ?? graph?.relationshipEvidence.length ?? 0,
      relationshipDefinitionCount: graph?.ontology.relationshipDefinitions.length ?? 0,
    },
    reasoningPackage: {
      relationshipCount: allRelationshipContexts.length,
      impactPathCount: allRelevantImpactPaths.length,
      impactChainCount: fullReasoningPackage.impactChains.length,
      unresolvedRelationshipCount: allUnresolved.length,
      evidenceCount: allEvidence.length,
    },
  };
  const engineeringBrief = buildEngineeringBrief(
    fullReasoningPackage,
    allRelationshipContexts,
    allEntityContexts,
    relationshipFlowBase,
    allEvidence,
    compactFourApplicationSubject,
  );
  const allReasoningCitations = citationsFor(
    [],
    allUnresolved,
    allEntityContexts,
    allRelationshipContexts,
    allFindings,
    allEvidence,
  );
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
  const ontologyCoverage = canonical?.knowledgeGraph?.confidenceMetadata.relationshipCoverage ?? (canonical ? 0.5 : 0);
  const confidenceComponents = {
    evidenceSupport: Math.min(1, allEvidence.length / 2),
    relationshipSupport: Math.min(1, allRelationships.length / 2),
    retrievalCoverage: Number.isFinite(ontologyCoverage) ? Math.max(0, Math.min(1, ontologyCoverage)) : 0,
    groundingAvailability: hasCanonicalEvidence ? 1 : 0,
  };
  const confidenceWeights = questionIntent === "summary" || questionIntent === "evidence"
    ? { evidenceSupport: 0.5, relationshipSupport: 0.1, retrievalCoverage: 0.1, groundingAvailability: 0.3 }
    : { evidenceSupport: 0.35, relationshipSupport: 0.2, retrievalCoverage: 0.25, groundingAvailability: 0.2 };
  const retrievalConfidenceScore = Number((
    confidenceComponents.evidenceSupport * confidenceWeights.evidenceSupport +
    confidenceComponents.relationshipSupport * confidenceWeights.relationshipSupport +
    confidenceComponents.retrievalCoverage * confidenceWeights.retrievalCoverage +
    confidenceComponents.groundingAvailability * confidenceWeights.groundingAvailability
  ).toFixed(3));
  const base = {
    schemaVersion: "1.0" as const,
    investigationId: snapshot.identity.investigationId,
    snapshotRevision: snapshot.identity.revision,
    lifecycle: snapshot.lifecycle,
    subject: short(snapshot.subjectLabel, 300),
    userMessage: message,
    questionIntent,
    ...(m2EvidenceState ? { consequenceEvidenceState: m2EvidenceState } : {}),
    entityCandidates,
    selectedEntityIds,
    entityConfidence,
    retrievalConfidence: {
      score: retrievalConfidenceScore,
      threshold: COPILOT_RETRIEVAL_CONFIG.lowRetrievalConfidenceThreshold,
      belowThreshold: retrievalConfidenceScore < COPILOT_RETRIEVAL_CONFIG.lowRetrievalConfidenceThreshold,
      components: confidenceComponents,
      method: "heuristic" as const,
    },
    ambiguity: {
      detected: ambiguous,
      clarificationRequired,
      ...(ambiguityNotice ? { notice: ambiguityNotice } : {}),
    },
    ...(canonical?.knowledgeGraph?.ontologyVersion ? { ontologyVersion: canonical.knowledgeGraph.ontologyVersion } : {}),
    ...(canonical?.knowledgeGraph?.knowledgeGraphSummary ? { knowledgeGraphSummary: canonical.knowledgeGraph.knowledgeGraphSummary } : {}),
    sourceSelections: selectedSources,
    grounding: { hasCanonicalEvidence, partialSources, staleSources, unsupportedIdentifiers },
  };

  const counts = {
    entities: Math.min(maxItems, entitiesByRelevance.length),
    relationships: Math.min(maxItems, allRelationships.length),
    evidence: Math.min(maxItems, allEvidence.length),
    findings: Math.min(maxItems, allFindings.length),
    unresolvedEvaluations: Math.min(maxItems, allUnresolved.length),
    paths: Math.min(maxItems, allRelevantPaths.length),
    reasoningPrimaryEntities: fullReasoningPackage.primaryEntities.length,
    reasoningKeyDependencies: fullReasoningPackage.keyDependencies.length,
    reasoningImpactChains: fullReasoningPackage.impactChains.length,
    reasoningStrongestEvidence: fullReasoningPackage.strongestEvidence.length,
    reasoningFindings: fullReasoningPackage.engineeringFindings.length,
    reasoningRelationshipNarratives: fullReasoningPackage.relationshipNarratives.length,
    reasoningSubjectTraceabilityRelationships: fullReasoningPackage.subjectTraceabilityRelationships.length,
    reasoningSubjectTraceabilityNarratives: compactFourApplicationSubject
      ? 0
      : fullReasoningPackage.subjectTraceabilityNarratives.length,
    reasoningImpactNarratives: fullReasoningPackage.impactNarratives.length,
    reasoningUnresolvedRelationships: fullReasoningPackage.unresolvedRelationships.length,
    reasoningMissingEvidence: fullReasoningPackage.missingEvidence.length,
    ontologyDefinitions: Math.min(maxItems, relationshipDefinitions.length),
    sourceSelections: selectedSources.length,
    relationshipGuidance: Math.min(maxItems, relationshipGuidance.length),
  };
  const isCompleteRelationshipGroup = (relation: RelationshipLike): boolean => {
    const source = entityById.get(relation.sourceEntityId);
    const target = entityById.get(relation.targetEntityId);
    const evidenceIds = [...new Set([...(relation.evidenceIds ?? []), ...(relation.evidenceId ? [relation.evidenceId] : [])])];
    return Boolean(
      source &&
      target &&
      source.entityId !== target.entityId &&
      evidenceIds.length > 0 &&
      evidenceIds.length <= maxItems &&
      evidenceIds.every((id) => allEvidence.some((item) => item.evidenceId === id)),
    );
  };
  const protectedCandidate = m2EvidenceState
    ? allRelationships.find(({ relation }) =>
      m2EvidenceState.resolvedRelationshipCitationIds.includes(stableCitationId("relationship", relation.id)),
    )
    : allRelationships.find(({ relation }) =>
      allRelevantImpactPaths.some((path) => path.relationshipIds.includes(relation.id)) &&
      isCompleteRelationshipGroup(relation),
    ) ?? allRelationships.find(({ relation }) => isCompleteRelationshipGroup(relation));
  const protectedImpactPath = (questionIntent === "impact" || questionIntent === "change-analysis")
    ? m2EvidenceState
      ? canonical?.knowledgeGraph?.impactPaths.find((path) => m2EvidenceState.impactPathIds.includes(path.id))
      : protectedCandidate
        ? allRelevantImpactPaths.find((path) => path.relationshipIds.includes(protectedCandidate.relation.id))
      : undefined
    : undefined;
  const protectedEntityIds = [...new Set([
    ...(m2EvidenceState?.sourceEntityId ? [m2EvidenceState.sourceEntityId] : []),
    ...(m2EvidenceState?.targetEntityId ? [m2EvidenceState.targetEntityId] : []),
    ...(protectedCandidate
      ? [protectedCandidate.relation.sourceEntityId, protectedCandidate.relation.targetEntityId]
      : []),
    ...fullReasoningPackage.subjectApplicationParticipation.flatMap((participation) =>
      participation.representativeEntityIds.slice(0, 1),
    ),
  ])];
  const protectedEvidenceIds = protectedCandidate
    ? [...new Set([
        ...(protectedCandidate.relation.evidenceIds ?? []),
        ...(protectedCandidate.relation.evidenceId ? [protectedCandidate.relation.evidenceId] : []),
      ])]
    : [];
  const protectedMinimums = {
    entities: protectedEntityIds.length,
    relationships: protectedCandidate ? 1 : 0,
    evidence: protectedEvidenceIds.length,
    paths: protectedImpactPath ? 1 : 0,
    unresolvedEvaluations: m2EvidenceState?.unresolvedEvaluationAvailable ? 1 : 0,
    reasoningPrimaryEntities: fullReasoningPackage.subjectApplicationParticipation.filter((participation) =>
      participation.representativeEntityIds.length > 0,
    ).length,
    reasoningRelationshipNarratives: includeSubjectTraceability ? 0 : Number(fullReasoningPackage.relationshipNarratives.length > 0),
    reasoningSubjectTraceabilityRelationships: fullReasoningPackage.subjectTraceabilityRelationships.length,
    reasoningSubjectTraceabilityNarratives: fullReasoningPackage.subjectTraceabilityNarratives.length,
    reasoningImpactNarratives: includeSubjectTraceability ? 0 : Number(fullReasoningPackage.impactNarratives.length > 0),
    reasoningImpactChains: includeSubjectTraceability ? 0 : Number(fullReasoningPackage.impactChains.length > 0),
  };
  counts.entities = Math.max(counts.entities, protectedMinimums.entities);
  counts.relationships = Math.max(counts.relationships, protectedMinimums.relationships);
  counts.evidence = Math.max(counts.evidence, protectedMinimums.evidence);
  counts.paths = Math.max(counts.paths, protectedMinimums.paths);
  counts.unresolvedEvaluations = Math.max(counts.unresolvedEvaluations, protectedMinimums.unresolvedEvaluations);
  counts.reasoningPrimaryEntities = Math.max(counts.reasoningPrimaryEntities, protectedMinimums.reasoningPrimaryEntities);
  const beforeBudgetCounts = {
    entities: allEntityContexts.length,
    relationships: allRelationships.length,
    evidence: allEvidence.length,
    paths: allRelevantPaths.length,
    impactPaths: allRelevantImpactPaths.length,
    impactChains: fullReasoningPackage.impactChains.length,
    reasoningNarratives: fullReasoningPackage.relationshipNarratives.length + fullReasoningPackage.impactNarratives.length,
    subjectTraceabilityRelationships: fullReasoningPackage.subjectTraceabilityRelationships.length,
    subjectTraceabilityNarratives: fullReasoningPackage.subjectTraceabilityNarratives.length,
  };
  const trimOrder: (keyof typeof counts)[] = [
    "reasoningFindings",
    "reasoningStrongestEvidence",
    "reasoningKeyDependencies",
    "reasoningPrimaryEntities",
    "reasoningMissingEvidence",
    "reasoningUnresolvedRelationships",
    "ontologyDefinitions",
    "sourceSelections",
    "relationships",
    "paths",
    "evidence",
    "unresolvedEvaluations",
    "findings",
    "entities",
    "reasoningImpactNarratives",
    "reasoningRelationshipNarratives",
    "reasoningSubjectTraceabilityRelationships",
    "reasoningSubjectTraceabilityNarratives",
    "reasoningImpactChains",
    "relationshipGuidance",
  ];

  const compose = (): CopilotContextPacket => {
    const prioritizedPaths = protectedImpactPath
      ? [protectedImpactPath, ...allRelevantPaths.filter((path) => path !== protectedImpactPath)]
      : allRelevantPaths;
    const prioritizedImpactPaths = protectedImpactPath
      ? [protectedImpactPath, ...allRelevantImpactPaths.filter((path) => path !== protectedImpactPath)]
      : allRelevantImpactPaths;
    const relevantPaths = prioritizedPaths.slice(0, counts.paths);
    const selectedRelationshipCandidates: typeof allRelationships = [];
    const requiredEntityIds = new Set<string>();
    const requiredEvidenceIds = new Set<string>();
    const prioritizedRelationships = protectedCandidate
      ? [protectedCandidate, ...allRelationships.filter((candidate) => candidate !== protectedCandidate)]
      : allRelationships;
    for (const candidate of prioritizedRelationships) {
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
    const candidateEntityIds = entityCandidates.map((candidate) => candidate.entityId);
    const pathEntityIds = relevantPaths.flatMap((path) => [
      path.sourceEntityId,
      ...path.steps.flatMap((step) => [step.fromEntityId, step.toEntityId]),
    ]);
    const priorityEntityIds = [...new Set([
      ...protectedEntityIds,
      ...requiredEntityIds,
      ...candidateEntityIds,
      ...pathEntityIds,
    ])];
    const prioritizedEntities = [
      ...priorityEntityIds.map((id) => entityById.get(id)).filter((entity): entity is CopilotEntityContext => Boolean(entity)),
      ...entitiesByRelevance.filter((entity) => !priorityEntityIds.includes(entity.entityId)),
    ];
    const entities = prioritizedEntities.slice(0, counts.entities).map((entity) => ({
      ...entity,
      importanceScore: fullReasoningPackage.entityImportance[entity.entityId]?.score ?? 0,
    }));
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
        const ontologyDefinitionAvailable = Boolean(
          relation.family &&
          canonical?.knowledgeGraph?.ontology.relationshipDefinitions.some((definition) => definition.id === relation.family),
        );
        const semanticGuidanceAvailable = ontologyDefinitionAvailable ||
          Boolean(source?.source && target?.source && selectedGuidancePairs.has(applicationPairKey(source.source, target.source)));
        const normalized = normalizedRelationship(relation, entitiesMap, evidenceMap, semanticGuidanceAvailable);
        return normalized ? [normalized] : [];
      });
    const projectedRelationships = compactFourApplicationSubject
      ? relationships.filter((relationship) => {
          const sourceApplication = entityById.get(relationship.sourceEntityId)?.source?.toLocaleLowerCase();
          const targetApplication = entityById.get(relationship.targetEntityId)?.source?.toLocaleLowerCase();
          return Boolean(
            sourceApplication &&
            targetApplication &&
            (sourceApplication !== targetApplication || relationshipBusinessWeight(relationship) > 5),
          );
        })
      : relationships;
    const projectedRelationshipIds = new Set(projectedRelationships.map((relationship) => relationship.relationshipId));
    const projectedPaths = compactFourApplicationSubject
      ? relevantPaths.filter((path) =>
          path.relationshipIds.length > 0 &&
          path.relationshipIds.every((relationshipId) => projectedRelationshipIds.has(relationshipId)),
        )
      : relevantPaths;
    const projectedRelationshipNarratives = compactFourApplicationSubject
      ? fullReasoningPackage.relationshipNarratives.filter((narrative) =>
          narrative.relationshipIds.length > 0 &&
          narrative.relationshipIds.every((relationshipId) => projectedRelationshipIds.has(relationshipId)),
        )
      : fullReasoningPackage.relationshipNarratives;
    const projectedRelationshipEvidenceIds = new Set(projectedRelationships.flatMap((relationship) =>
      relationship.evidenceCitationIds,
    ));
    const findings = allFindings.slice(0, counts.findings);
    const unresolved = (m2EvidenceState
      ? allUnresolved.filter((evaluation) =>
        m2EvidenceState.unresolvedEvaluationCitationIds.includes(evaluation.citationId),
      )
      : allUnresolved)
      .slice(0, counts.unresolvedEvaluations)
      .map((evaluation) => ({
      ...evaluation,
      evidenceCitationIds: evaluation.evidenceCitationIds.filter((citationId) => evidenceMap.has(citationId)),
      semanticGuidanceAvailable: Boolean(
        canonical?.knowledgeGraph?.ontology.relationshipDefinitions.some((definition) => definition.id === evaluation.ruleId) ||
        selectedGuidancePairs.has(applicationPairKey(evaluation.sourceApplication, evaluation.targetApplication)),
      ),
    }));
    const candidateCitations: CopilotCitation[] = entityCandidates.map((candidate) => ({
      citationId: candidate.citationId,
      kind: "entity",
      label: candidate.label,
      ...(candidate.source ? { source: candidate.source } : {}),
      ...(candidate.nativeId ? { nativeId: candidate.nativeId } : {}),
      summary: `Ranked entity candidate (${candidate.matchBasis}; score ${candidate.score.toFixed(2)}).`,
    }));
    const selectedEvidenceIds = new Set(evidence.map((item) => item.citationId));
    const evidenceGroups = {
    direct: [...directEvidenceIds].filter((id) => selectedEvidenceIds.has(id)).sort(),
    relationship: [...relationshipEvidenceIds].filter((id) => selectedEvidenceIds.has(id)).sort(),
    dependency: [...dependencyEvidenceIds].filter((id) => selectedEvidenceIds.has(id)).sort(),
    impact: [...impactEvidenceIds].filter((id) => selectedEvidenceIds.has(id)).sort(),
    };
    const impactPaths = prioritizedImpactPaths.slice(0, counts.paths);
    const impactedEntityIds = [...new Set(impactPaths.map((path) => path.targetEntityId))]
      .filter((entityId) => entityId !== focalEntityId)
      .sort();
    const entitiesByKind: Record<string, number> = {};
    const entitiesByApplication: Record<string, number> = {};
    for (const entityId of impactedEntityIds) {
      const entity = entityById.get(entityId);
      if (!entity) continue;
      entitiesByKind[entity.kind] = (entitiesByKind[entity.kind] ?? 0) + 1;
      const application = entity.source ?? "unknown";
      entitiesByApplication[application] = (entitiesByApplication[application] ?? 0) + 1;
    }
    const selectedImportance: Record<string, EntityImportance> = {};
    for (const entity of entities) {
      const importance = fullReasoningPackage.entityImportance[entity.entityId];
      if (importance) selectedImportance[entity.entityId] = importance;
    }
    const reasoningPackage: ReasoningPackage = {
      ...fullReasoningPackage,
      applicationsPresent: compactFourApplicationSubject ? [] : fullReasoningPackage.applicationsPresent,
      subjectParticipationSummary: compactFourApplicationSubject ? "" : fullReasoningPackage.subjectParticipationSummary,
      crossSystemParticipationSummary: compactFourApplicationSubject ? "" : fullReasoningPackage.crossSystemParticipationSummary,
      representativeEntitiesByApplication: compactFourApplicationSubject
        ? {}
        : fullReasoningPackage.representativeEntitiesByApplication,
      evidenceBoundaryStatement: compactFourApplicationSubject ? "" : fullReasoningPackage.evidenceBoundaryStatement,
      entityImportance: compactFourApplicationSubject ? {} : selectedImportance,
      subjectApplicationParticipation: includeSubjectTraceability && !compactFourApplicationSubject
        ? fullReasoningPackage.subjectApplicationParticipation
        : [],
      primaryEntities: compactFourApplicationSubject
        ? []
        : fullReasoningPackage.primaryEntities.slice(0, counts.reasoningPrimaryEntities),
      keyDependencies: compactFourApplicationSubject
        ? []
        : fullReasoningPackage.keyDependencies.slice(0, counts.reasoningKeyDependencies),
      impactChains: (compactFourApplicationSubject
        ? []
        : fullReasoningPackage.impactChains)
        .filter((chain) => !m2EvidenceState || m2EvidenceState.impactChainIds.includes(chain.id))
        .slice(0, counts.reasoningImpactChains),
      strongestEvidence: compactFourApplicationSubject
        ? []
        : fullReasoningPackage.strongestEvidence.slice(0, counts.reasoningStrongestEvidence),
      engineeringFindings: compactFourApplicationSubject
        ? []
        : fullReasoningPackage.engineeringFindings.slice(0, counts.reasoningFindings),
      relationshipNarratives: compactFourApplicationSubject
        ? []
        : projectedRelationshipNarratives.slice(0, counts.reasoningRelationshipNarratives),
      subjectTraceabilityRelationships: fullReasoningPackage.subjectTraceabilityRelationships.slice(0, counts.reasoningSubjectTraceabilityRelationships),
      subjectTraceabilityNarratives: fullReasoningPackage.subjectTraceabilityNarratives
        .slice(0, counts.reasoningSubjectTraceabilityNarratives)
        .map((narrative) => includeSubjectTraceability
          ? { ...narrative, text: short(narrative.text, 120) }
          : narrative),
      impactNarratives: compactFourApplicationSubject
        ? []
        : fullReasoningPackage.impactNarratives.slice(0, counts.reasoningImpactNarratives),
      unresolvedRelationships: compactFourApplicationSubject
        ? []
        : fullReasoningPackage.unresolvedRelationships.slice(0, counts.reasoningUnresolvedRelationships),
      missingEvidence: compactFourApplicationSubject
        ? []
        : fullReasoningPackage.missingEvidence.slice(0, counts.reasoningMissingEvidence),
      investigationSummary: compactFourApplicationSubject
        ? {
            ...fullReasoningPackage.investigationSummary,
            applicationsPresent: [],
            subjectParticipationSummary: "",
            crossSystemParticipationSummary: "",
            representativeEntitiesByApplication: {},
            evidenceBoundaryStatement: "",
            crossSystemSummary: "",
            relationshipSummary: "",
            applicationCoverage: {},
            keyDependencies: [],
            mostConnectedEntities: [],
            highestValueRelationships: [],
            strongestEvidence: [],
            strongestImpactChains: [],
          }
        : fullReasoningPackage.investigationSummary,
    };
    const reasoningCitationIds = new Set([
      ...reasoningPackage.primaryEntities.map((entity) => entity.citationId),
      ...reasoningPackage.keyDependencies.flatMap((item) => item.path.citationIds),
      ...reasoningPackage.impactChains.flatMap((item) => item.citationIds),
      ...reasoningPackage.strongestEvidence.map((item) => item.citationId),
      ...reasoningPackage.engineeringFindings.flatMap((item) => item.citationIds),
      ...reasoningPackage.relationshipNarratives.flatMap((item) => item.citationIds),
      ...reasoningPackage.subjectTraceabilityRelationships.flatMap((item) => [
        item.citationId,
        item.sourceCitationId,
        item.targetCitationId,
      ]),
      ...reasoningPackage.subjectTraceabilityNarratives.flatMap((item) => item.citationIds),
      ...reasoningPackage.impactNarratives.flatMap((item) => item.citationIds),
      ...reasoningPackage.unresolvedRelationships.flatMap((item) => [item.citationId, ...item.evidenceCitationIds]),
      ...reasoningPackage.missingEvidence.flatMap((item) => item.citationIds),
      ...engineeringBrief.primaryEntities.map((entity) => entity.citationId),
      ...engineeringBrief.majorRelationships.flatMap((item) => [
        item.citationId,
        item.sourceCitationId,
        item.targetCitationId,
        ...item.evidenceCitationIds,
      ]),
      ...engineeringBrief.relationshipNarratives.flatMap((item) => item.citationIds),
      ...engineeringBrief.subjectTraceabilityRelationships.flatMap((item) => [
        item.citationId,
        item.sourceCitationId,
        item.targetCitationId,
      ]),
      ...engineeringBrief.subjectTraceabilityNarratives.flatMap((item) => item.citationIds),
      ...engineeringBrief.impactNarratives.flatMap((item) => item.citationIds),
      ...engineeringBrief.topImpactChains.flatMap((item) => item.citationIds),
      ...engineeringBrief.strongestEvidence.map((item) => item.citationId),
      ...engineeringBrief.unresolvedRelationships.flatMap((item) => [item.citationId, ...item.evidenceCitationIds]),
      ...engineeringBrief.missingEvidence.flatMap((item) => item.citationIds),
    ]);
    const reasoningCitations = allReasoningCitations.filter((citation) => reasoningCitationIds.has(citation.citationId));
    const consequenceSubjectCitations: CopilotCitation[] = m2EvidenceState
      ? (graph?.subjectTraceabilityRelationships ?? [])
        .filter((edge) => m2EvidenceState.subjectTraceabilityCitationIds.includes(edge.citationId))
        .map((edge) => ({
          citationId: edge.citationId,
          kind: "relationship" as const,
          label: "Shared investigation participation",
          summary: "Informational subject participation only; it does not establish operational representation or impact.",
        }))
      : [];
    const citations = [...new Map([
      ...citationsFor(selectedSources.slice(0, counts.sourceSelections), unresolved, entities, relationships, findings, evidence),
      ...reasoningCitations,
      ...candidateCitations,
      ...consequenceSubjectCitations,
    ].map((citation) => [citation.citationId, citation])).values()]
      .sort((left, right) => left.citationId.localeCompare(right.citationId));
    const compactCitationIds = new Set([
      ...engineeringBrief.subjectApplicationParticipation.flatMap((participation) =>
        participation.representativeEntity ? [participation.representativeEntity.citationId] : [],
      ),
      ...projectedRelationships.flatMap((relationship) => [
        relationship.citationId,
        relationship.sourceCitationId,
        relationship.targetCitationId,
        ...relationship.evidenceCitationIds,
      ]),
      ...engineeringBrief.relationshipEvidence
        .filter((item) => projectedRelationshipEvidenceIds.has(item.citationId))
        .map((item) => item.citationId),
    ]);
    const projectedCitations = compactFourApplicationSubject
      ? citations.filter((citation) => compactCitationIds.has(citation.citationId))
      : citations;
    const reasoningOmittedCount =
      fullReasoningPackage.primaryEntities.length - reasoningPackage.primaryEntities.length +
      fullReasoningPackage.keyDependencies.length - reasoningPackage.keyDependencies.length +
      fullReasoningPackage.impactChains.length - reasoningPackage.impactChains.length +
      fullReasoningPackage.strongestEvidence.length - reasoningPackage.strongestEvidence.length +
      fullReasoningPackage.engineeringFindings.length - reasoningPackage.engineeringFindings.length +
      fullReasoningPackage.relationshipNarratives.length - reasoningPackage.relationshipNarratives.length +
      fullReasoningPackage.subjectTraceabilityRelationships.length - reasoningPackage.subjectTraceabilityRelationships.length +
      fullReasoningPackage.subjectTraceabilityNarratives.length - reasoningPackage.subjectTraceabilityNarratives.length +
      fullReasoningPackage.impactNarratives.length - reasoningPackage.impactNarratives.length +
      fullReasoningPackage.unresolvedRelationships.length - reasoningPackage.unresolvedRelationships.length +
      fullReasoningPackage.missingEvidence.length - reasoningPackage.missingEvidence.length;
    const omittedCounts = {
      entities: allEntityContexts.length - entities.length,
      relationships: allRelationships.length - relationships.length,
      evidence: allEvidence.length - evidence.length,
      findings: allFindings.length - findings.length,
      unresolvedEvaluations: allUnresolved.length - unresolved.length,
      paths: allRelevantPaths.length - relevantPaths.length,
      reasoningArtifacts: reasoningOmittedCount,
      subjectTraceabilityRelationships:
        fullReasoningPackage.subjectTraceabilityRelationships.length - reasoningPackage.subjectTraceabilityRelationships.length,
      subjectTraceabilityNarratives:
        fullReasoningPackage.subjectTraceabilityNarratives.length - reasoningPackage.subjectTraceabilityNarratives.length,
      ontologyDefinitions: relationshipDefinitions.length - counts.ontologyDefinitions,
      sourceSelections: sourceContext(snapshot, canonical).length - counts.sourceSelections,
      relationshipGuidance: relationshipGuidance.length - selectedGuidance.length,
    };
    const categories = Object.entries(omittedCounts).filter(([, count]) => count > 0).map(([category]) => category).sort();
    const uncertainties = buildUncertainties(hasCanonicalEvidence, partialSources, staleSources, conflicts, unsupportedIdentifiers);
    if (ambiguityNotice) uncertainties.push(ambiguityNotice);
    if (clarificationRequired) {
      uncertainties.push(`No entity candidate reached the configured confidence threshold of ${COPILOT_RETRIEVAL_CONFIG.lowConfidenceThreshold.toFixed(2)}. Ask the engineer to clarify before making entity-specific claims.`);
    }
    if (categories.length) uncertainties.push(`Context limit omitted items from: ${categories.join(", ")}; omitted content is unknown, not evidence of absence.`);
    const omittedRelationshipCount = allRelationships.length - relationships.length;
    if (omittedRelationshipCount > 0) {
      uncertainties.push(`Context limit omitted ${omittedRelationshipCount} relationship path(s); omitted relationship content is unknown.`);
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
    const relationshipFlow: RelationshipFlowDiagnostics = {
      ...engineeringBrief.relationshipFlow,
      copilotContext: {
        relationshipCount: projectedRelationships.length,
        impactPathCount: impactPaths.length,
        impactChainCount: reasoningPackage.impactChains.length,
        unresolvedRelationshipCount: unresolved.length,
        evidenceCount: evidence.length,
      },
    };
    const boundedEngineeringBrief: EngineeringBrief = {
      ...engineeringBrief,
      subjectParticipationSummary: compactFourApplicationSubject
        ? ""
        : includeSubjectTraceability
        ? `Applications present participate in the same ${fullReasoningPackage.subjectApplicationParticipation[0]?.subjectLabel ?? snapshot.subjectLabel} investigation subject.`
        : engineeringBrief.subjectParticipationSummary,
      crossSystemParticipationSummary: compactFourApplicationSubject
        ? fullReasoningPackage.crossSystemParticipationSummary
        : engineeringBrief.crossSystemParticipationSummary,
      primaryEntities: engineeringBrief.primaryEntities.filter((entity) =>
        compactFourApplicationSubject
          ? fullReasoningPackage.subjectApplicationParticipation.some((participation) =>
              participation.representativeEntityIds[0] === entity.entityId,
            )
          : entitiesMap.has(entity.entityId) ||
            (questionIntent === "summary" || questionIntent === "relationship") &&
              fullReasoningPackage.subjectApplicationParticipation.some((participation) =>
                participation.representativeEntityIds.includes(entity.entityId),
              ),
      ),
      majorRelationships: compactFourApplicationSubject
        ? projectedRelationships
        : relationships.filter((relationship) => relationship.category !== "subject-traceability"),
      relationshipNarratives: compactFourApplicationSubject
        ? projectedRelationshipNarratives
        : reasoningPackage.relationshipNarratives,
      subjectTraceabilityRelationships: reasoningPackage.subjectTraceabilityRelationships,
      subjectTraceabilityNarratives: compactFourApplicationSubject
        ? []
        : engineeringBrief.subjectTraceabilityNarratives.map((narrative) => ({
            ...narrative,
            text: short(narrative.text, 120),
          })),
      subjectApplicationParticipation: includeSubjectTraceability
        ? engineeringBrief.subjectApplicationParticipation
        : questionIntent === "impact"
          ? engineeringBrief.subjectApplicationParticipation
              .filter((participation) => ["windchill", "sap"].includes(participation.application.toLocaleLowerCase()))
              .map((participation) => ({
                ...participation,
                ...(compactFourApplicationSubject
                  ? { representativeEntity: undefined }
                  : {
                      representativeEntityIds: [],
                      representativeEntityLabels: [],
                      representativeEntityKinds: [],
                    }),
                contribution: "participates in the investigation subject; this is not evidence of an operational relationship",
              }))
          : engineeringBrief.subjectApplicationParticipation,
      representativeEntitiesByApplication: compactFourApplicationSubject
        ? {}
        : reasoningPackage.representativeEntitiesByApplication,
      evidenceBoundaryStatement: compactFourApplicationSubject
        ? fullReasoningPackage.evidenceBoundaryStatement
        : reasoningPackage.evidenceBoundaryStatement,
      impactNarratives: includeSubjectTraceability
        ? []
        : reasoningPackage.impactNarratives.slice(0, 1).map((narrative) => ({
            ...narrative,
            text: short(narrative.text, 480),
            engineeringMeaning: short(narrative.engineeringMeaning, 240),
            ...(narrative.impactRationale ? { impactRationale: short(narrative.impactRationale, 240) } : {}),
            entityIds: narrative.entityIds.slice(0, 4),
            relationshipIds: narrative.relationshipIds.slice(0, 4),
            citationIds: narrative.citationIds.slice(0, 8),
          })),
      relationshipEvidence: compactFourApplicationSubject
        ? engineeringBrief.relationshipEvidence
            .filter((item) => projectedRelationshipEvidenceIds.has(item.citationId))
            .slice(0, 5)
            .map((item) => ({ ...item, summary: short(item.summary, 240) }))
        : includeSubjectTraceability
          ? []
        : engineeringBrief.relationshipEvidence
          .filter((item) => evidenceMap.has(item.evidenceId))
          .slice(0, 1)
          .map((item) => ({ ...item, summary: short(item.summary, 240) })),
      engineeringInsights: includeSubjectTraceability ? [] : engineeringBrief.engineeringInsights.slice(0, 3),
      topFindings: includeSubjectTraceability ? [] : engineeringBrief.topFindings.slice(0, 3),
      topImpactChains: includeSubjectTraceability
        ? []
        : reasoningPackage.impactChains.slice(0, 1).map((chain) => ({
            ...chain,
            relationshipSequence: chain.relationshipSequence.slice(0, 1),
            supportingEvidence: chain.supportingEvidence.slice(0, 1),
            citationIds: chain.citationIds.slice(0, 2),
            engineeringExplanation: short(chain.engineeringExplanation, 120),
            impactRationale: short(chain.impactRationale, 120),
          })),
      strongestEvidence: reasoningPackage.strongestEvidence,
      missingEvidence: reasoningPackage.missingEvidence,
      unresolvedRelationships: reasoningPackage.unresolvedRelationships,
    };
    return {
      ...base,
      relationshipPaths: projectedPaths,
      impactPaths,
      relationshipDefinitions: compactFourApplicationSubject
        ? relationshipDefinitions.filter((definition) =>
            projectedRelationships.some((relationship) => relationship.family === definition.id),
          )
        : relationshipDefinitions.slice(0, counts.ontologyDefinitions),
      reasoningPackage,
      engineeringBrief: m2EvidenceState
        ? projectM2EngineeringBrief(boundedEngineeringBrief)
        : boundedEngineeringBrief,
      relationshipFlow,
      impactSummary: {
        classification: "potential",
        pathCount: impactPaths.length,
        impactedEntityIds,
        entitiesByKind,
        entitiesByApplication,
      },
      subjectTraceabilityDiagnostics: {
        graphSubjectTraceabilityEdgeCount,
        applicationParticipationSummaryCount: boundedEngineeringBrief.subjectApplicationParticipation.length,
        applicationsPresent: boundedEngineeringBrief.applicationsPresent,
        representativeEntityCountByApplication: Object.fromEntries(
          boundedEngineeringBrief.subjectApplicationParticipation.map((participation) => [
            participation.application,
            Number(Boolean(participation.representativeEntity)),
          ]),
        ),
        entityLevelSubjectEdgesIncludedInPrompt: reasoningPackage.subjectTraceabilityRelationships.length,
        compactSubjectNarrativeCount: boundedEngineeringBrief.subjectTraceabilityNarratives.length +
          Number(boundedEngineeringBrief.crossSystemParticipationSummary.length > 0),
        hasOntologyResolvedWindchillSapRelationship,
        hasWindchillSapImpactPath,
        contextCharactersUsed: 0,
        contextCharacterLimit: maxContextChars,
        omittedEntityLevelSubjectEdges: Math.max(
          0,
          graphSubjectTraceabilityEdgeCount,
        ),
      },
      sourceSelections: m2EvidenceState || compactFourApplicationSubject
        ? []
        : selectedSources.slice(0, counts.sourceSelections),
      entities: m2EvidenceState
        ? entities
          .filter((entity) => entity.entityId === m2EvidenceState.sourceEntityId || entity.entityId === m2EvidenceState.targetEntityId)
          .map(compactInvestigationEntity)
        : investigationScoped && questionIntent === "summary"
        ? []
        : investigationScoped && questionIntent === "relationship"
          ? protectedCandidate
            ? entities.filter((entity) =>
              entity.entityId === protectedCandidate.relation.sourceEntityId ||
              entity.entityId === protectedCandidate.relation.targetEntityId,
            )
            : []
        : investigationScoped && questionIntent === "impact"
          ? entities.map(compactInvestigationEntity)
          : entities,
      relationships: m2EvidenceState
        ? relationships.filter((relationship) => m2EvidenceState.resolvedRelationshipCitationIds.includes(relationship.citationId))
        : compactFourApplicationSubject
          ? projectedRelationships
          : relationships,
      relationshipGuidance: m2EvidenceState
        ? selectedGuidance.filter((section) =>
          applicationPairKey(section.sourceApplication, section.targetApplication) === applicationPairKey("windchill", "sap"),
        )
        : compactFourApplicationSubject
          ? []
          : selectedGuidance,
      findings: m2EvidenceState
        ? findings.filter((finding) =>
          finding.subjectEntityIds.includes(m2EvidenceState.sourceEntityId ?? "") ||
          finding.subjectEntityIds.includes(m2EvidenceState.targetEntityId ?? ""),
        )
        : compactFourApplicationSubject
          ? []
          : findings,
      unresolvedEvaluations: m2EvidenceState
        ? unresolved.filter((evaluation) => m2EvidenceState.unresolvedEvaluationCitationIds.includes(evaluation.citationId))
        : compactFourApplicationSubject
          ? []
          : unresolved,
      evidence: m2EvidenceState
        ? evidence.filter((item) => m2EvidenceState.allowedCitationIds.includes(item.citationId))
        : compactFourApplicationSubject
          ? evidence.filter((item) => projectedRelationshipEvidenceIds.has(item.citationId))
          : evidence,
      evidenceGroups: compactFourApplicationSubject
        ? {
            direct: [],
            relationship: evidenceGroups.relationship.filter((id) => projectedRelationshipEvidenceIds.has(id)),
            dependency: [],
            impact: [],
          }
        : evidenceGroups,
      conflicts: compactFourApplicationSubject
        ? []
        : conflicts.filter((conflict) => conflict.values.some((item) => entitiesMap.has(item.entityId))),
      citations: m2EvidenceState
        ? citations.filter((citation) => m2EvidenceState.allowedCitationIds.includes(citation.citationId))
        : projectedCitations,
      uncertainties,
      omissions: {
        categories,
        omittedCounts,
        maxContextChars,
        budgetTrace: {
          before: beforeBudgetCounts,
          after: {
            entities: entities.length,
            relationships: relationships.length,
            evidence: evidence.length,
            paths: relevantPaths.length,
            impactPaths: impactPaths.length,
            impactChains: reasoningPackage.impactChains.length,
            reasoningNarratives: reasoningPackage.relationshipNarratives.length + reasoningPackage.impactNarratives.length,
            subjectTraceabilityRelationships: reasoningPackage.subjectTraceabilityRelationships.length,
            subjectTraceabilityNarratives: reasoningPackage.subjectTraceabilityNarratives.length,
          },
          ...(protectedCandidate ? { protectedRelationshipId: protectedCandidate.relation.id } : {}),
        },
      },
    };
  };

  const canTrim = (key: keyof typeof counts): boolean => {
    const minimum = key === "entities" ? protectedMinimums.entities
      : key === "relationships" ? protectedMinimums.relationships
      : key === "evidence" ? protectedMinimums.evidence
      : key === "paths" ? protectedMinimums.paths
      : key === "unresolvedEvaluations" ? protectedMinimums.unresolvedEvaluations
      : key === "reasoningPrimaryEntities" ? protectedMinimums.reasoningPrimaryEntities
      : key === "reasoningRelationshipNarratives" ? protectedMinimums.reasoningRelationshipNarratives
      : key === "reasoningSubjectTraceabilityRelationships" ? protectedMinimums.reasoningSubjectTraceabilityRelationships
      : key === "reasoningSubjectTraceabilityNarratives" ? protectedMinimums.reasoningSubjectTraceabilityNarratives
      : key === "reasoningImpactNarratives" ? protectedMinimums.reasoningImpactNarratives
      : key === "reasoningImpactChains" ? protectedMinimums.reasoningImpactChains
      : 0;
    return counts[key] > minimum;
  };
  const hasProtectedReasoning =
    protectedMinimums.reasoningPrimaryEntities > 0 ||
    protectedMinimums.reasoningRelationshipNarratives > 0 ||
    protectedMinimums.reasoningSubjectTraceabilityRelationships > 0 ||
    protectedMinimums.reasoningSubjectTraceabilityNarratives > 0 ||
    protectedMinimums.reasoningImpactNarratives > 0 ||
    protectedMinimums.reasoningImpactChains > 0;
  let packet = compose();
  while (JSON.stringify(packet).length > maxContextChars && trimOrder.some(canTrim)) {
    const key = trimOrder.find(canTrim);
    if (!key) break;
    counts[key]--;
    packet = compose();
  }
  if (JSON.stringify(packet).length > maxContextChars) {
    const fallbackEntities = allEntityContexts
      .filter((entity) => protectedEntityIds.includes(entity.entityId))
      .map((entity) => investigationScoped && questionIntent === "impact"
        ? compactInvestigationEntity(entity)
        : entity);
    const fallbackRelationships = packet.relationships.slice(0, protectedMinimums.relationships);
    const fallbackEvidence = packet.evidence
      .filter((item) => protectedEvidenceIds.includes(item.evidenceId))
      .map((item) => ({ ...item, summary: short(item.summary, 240) }));
    const fallbackCitationIds = new Set([
      ...(m2EvidenceState?.allowedCitationIds ?? []),
      ...fallbackEntities.map((entity) => entity.citationId),
      ...packet.unresolvedEvaluations.flatMap((evaluation) => [evaluation.citationId, ...evaluation.evidenceCitationIds]),
      ...fallbackRelationships.flatMap((relationship) => [
        relationship.citationId,
        relationship.sourceCitationId,
        relationship.targetCitationId,
        ...relationship.evidenceCitationIds,
      ]),
      ...fallbackEvidence.map((item) => item.citationId),
      ...packet.reasoningPackage.relationshipNarratives.flatMap((item) => item.citationIds),
      ...packet.reasoningPackage.subjectTraceabilityRelationships.flatMap((item) => [
        item.citationId,
        item.sourceCitationId,
        item.targetCitationId,
      ]),
      ...packet.reasoningPackage.subjectTraceabilityNarratives.flatMap((item) => item.citationIds),
      ...packet.reasoningPackage.impactNarratives.flatMap((item) => item.citationIds),
      ...packet.reasoningPackage.impactChains.flatMap((item) => item.citationIds),
    ]);
    packet = {
      ...packet,
      knowledgeGraphSummary: undefined,
      subject: "",
      userMessage: "",
      conflicts: [],
      retrievalConfidence: {
        ...packet.retrievalConfidence,
        components: {
          evidenceSupport: 0,
          relationshipSupport: 0,
          retrievalCoverage: 0,
          groundingAvailability: 0,
        },
      },
      entityCandidates: [],
      selectedEntityIds: [],
      knowledgeGraph: undefined,
      grounding: {
        hasCanonicalEvidence: packet.grounding.hasCanonicalEvidence,
        partialSources: packet.grounding.partialSources,
        staleSources: packet.grounding.staleSources,
        unsupportedIdentifiers: packet.grounding.unsupportedIdentifiers,
      },
      uncertainties: [
        `Context limit omitted ${beforeBudgetCounts.relationships - protectedMinimums.relationships} relationship path(s).`,
      ],
      ambiguity: { detected: false, clarificationRequired: false },
      sourceSelections: [],
      entities: fallbackEntities,
      relationships: fallbackRelationships,
      relationshipPaths: [],
      impactPaths: packet.impactPaths.slice(0, protectedMinimums.paths),
      relationshipDefinitions: [],
      relationshipGuidance: [],
      findings: [],
      unresolvedEvaluations: m2EvidenceState
        ? packet.unresolvedEvaluations.filter((evaluation) =>
          m2EvidenceState.unresolvedEvaluationCitationIds.includes(evaluation.citationId),
        )
        : [],
      evidence: fallbackEvidence,
      evidenceGroups: { direct: [], relationship: [], dependency: [], impact: [] },
      reasoningPackage: {
        ...packet.reasoningPackage,
        investigationSummary: {
          applicationsPresent: packet.reasoningPackage.investigationSummary.applicationsPresent,
          subjectParticipationSummary: packet.reasoningPackage.investigationSummary.subjectParticipationSummary,
          crossSystemParticipationSummary: packet.reasoningPackage.investigationSummary.crossSystemParticipationSummary,
          representativeEntitiesByApplication: packet.reasoningPackage.investigationSummary.representativeEntitiesByApplication,
          evidenceBoundaryStatement: packet.reasoningPackage.investigationSummary.evidenceBoundaryStatement,
          crossSystemSummary: "",
          relationshipCount: 0,
          relationshipSummary: "",
          applicationCoverage: {},
          keyDependencies: [],
          mostConnectedEntities: [],
          highestValueRelationships: [],
          strongestEvidence: [],
          strongestImpactChains: [],
        },
        entityImportance: {},
        primaryEntities: packet.reasoningPackage.primaryEntities.filter((entity) =>
          packet.reasoningPackage.subjectApplicationParticipation.some((participation) =>
            participation.representativeEntityIds.includes(entity.entityId),
          ),
        ),
        keyDependencies: [],
        impactChains: packet.reasoningPackage.impactChains,
        strongestEvidence: [],
        engineeringFindings: [],
        relationshipNarratives: packet.reasoningPackage.relationshipNarratives,
        subjectTraceabilityRelationships: packet.reasoningPackage.subjectTraceabilityRelationships,
        subjectTraceabilityNarratives: packet.reasoningPackage.subjectTraceabilityNarratives,
        subjectApplicationParticipation: packet.reasoningPackage.subjectApplicationParticipation,
        representativeEntitiesByApplication: packet.reasoningPackage.representativeEntitiesByApplication,
        evidenceBoundaryStatement: packet.reasoningPackage.evidenceBoundaryStatement,
        impactNarratives: packet.reasoningPackage.impactNarratives,
        unresolvedRelationships: [],
        missingEvidence: [],
      },
      engineeringBrief: {
        ...packet.engineeringBrief,
        executiveSummary: "",
        crossSystemSummary: "",
        primaryEntities: packet.engineeringBrief.primaryEntities.filter((entity) =>
          packet.engineeringBrief.subjectApplicationParticipation.some((participation) =>
            participation.representativeEntity?.entityId === entity.entityId,
          ),
        ),
        majorRelationships: packet.relationships
          .filter((relationship) => relationship.category !== "subject-traceability")
          .slice(0, protectedMinimums.relationships),
        relationshipNarratives: packet.reasoningPackage.relationshipNarratives,
        subjectTraceabilityRelationships: packet.reasoningPackage.subjectTraceabilityRelationships,
        subjectTraceabilityNarratives: packet.engineeringBrief.subjectTraceabilityNarratives,
        subjectApplicationParticipation: packet.engineeringBrief.subjectApplicationParticipation,
        representativeEntitiesByApplication: packet.engineeringBrief.representativeEntitiesByApplication,
        evidenceBoundaryStatement: packet.engineeringBrief.evidenceBoundaryStatement,
        impactNarratives: packet.engineeringBrief.impactNarratives,
        relationshipEvidence: packet.engineeringBrief.relationshipEvidence
          .filter((item) => protectedEvidenceIds.includes(item.evidenceId))
          .slice(0, 1)
          .map((item) => ({ ...item, summary: short(item.summary, 240) })),
        engineeringInsights: [],
        topFindings: [],
        topImpactChains: packet.engineeringBrief.topImpactChains,
        strongestEvidence: [],
        missingEvidence: [],
        unresolvedRelationships: [],
        recommendedInvestigationAreas: [],
        relationshipFlow: packet.engineeringBrief.relationshipFlow,
      },
      citations: packet.citations
        .filter((citation) => fallbackCitationIds.has(citation.citationId))
        .map((citation) => ({
          citationId: citation.citationId,
          kind: citation.kind,
          label: citation.label,
          ...(citation.source ? { source: citation.source } : {}),
          ...(citation.nativeId ? { nativeId: citation.nativeId } : {}),
        })),
      impactSummary: {
        classification: "potential",
        pathCount: packet.impactPaths.slice(0, protectedMinimums.paths).length,
        impactedEntityIds: [],
        entitiesByKind: {},
        entitiesByApplication: {},
      },
      relationshipFlow: packet.relationshipFlow,
    } as CopilotContextPacket;
    const afterFallbackCounts = {
      entities: packet.entities.length,
      relationships: packet.relationships.length,
      evidence: packet.evidence.length,
      paths: packet.relationshipPaths.length,
      impactPaths: packet.impactPaths.length,
      impactChains: packet.reasoningPackage.impactChains.length,
      reasoningNarratives: packet.reasoningPackage.relationshipNarratives.length + packet.reasoningPackage.impactNarratives.length,
      subjectTraceabilityRelationships: packet.reasoningPackage.subjectTraceabilityRelationships.length,
      subjectTraceabilityNarratives: packet.reasoningPackage.subjectTraceabilityNarratives.length,
    };
    const fallbackOmittedCounts = {
      ...packet.omissions.omittedCounts,
      entities: beforeBudgetCounts.entities - afterFallbackCounts.entities,
      relationships: beforeBudgetCounts.relationships - afterFallbackCounts.relationships,
      evidence: beforeBudgetCounts.evidence - afterFallbackCounts.evidence,
      paths: beforeBudgetCounts.paths - afterFallbackCounts.paths,
      impactPaths: beforeBudgetCounts.impactPaths - afterFallbackCounts.impactPaths,
      impactChains: beforeBudgetCounts.impactChains - afterFallbackCounts.impactChains,
      reasoningNarratives: beforeBudgetCounts.reasoningNarratives - afterFallbackCounts.reasoningNarratives,
      subjectTraceabilityRelationships:
        beforeBudgetCounts.subjectTraceabilityRelationships - afterFallbackCounts.subjectTraceabilityRelationships,
      subjectTraceabilityNarratives:
        beforeBudgetCounts.subjectTraceabilityNarratives - afterFallbackCounts.subjectTraceabilityNarratives,
    };
    packet = {
      ...packet,
      omissions: {
        ...packet.omissions,
        categories: Object.entries(fallbackOmittedCounts)
          .filter(([, count]) => count > 0)
          .map(([category]) => category)
          .sort(),
        omittedCounts: Object.fromEntries(
          Object.entries(fallbackOmittedCounts).filter(([, count]) => count > 0),
        ),
        budgetTrace: {
          ...packet.omissions.budgetTrace,
          after: afterFallbackCounts,
        },
      },
    };
    if (m2EvidenceState) {
      packet = {
        ...packet,
        engineeringBrief: projectM2EngineeringBrief(packet.engineeringBrief),
      };
    }
    if (JSON.stringify(packet).length > maxContextChars && !hasProtectedReasoning) {
      packet = {
        ...packet,
        citations: [],
        reasoningPackage: undefined,
        engineeringBrief: undefined,
        relationshipFlow: undefined,
      } as unknown as CopilotContextPacket;
    };
    if (JSON.stringify(packet).length > maxContextChars) {
      const protectedCategories: string[] = [];
      if (protectedMinimums.entities > 0) protectedCategories.push("relationship endpoint entities");
      if (protectedMinimums.relationships > 0) protectedCategories.push("relationships");
      if (protectedMinimums.evidence > 0) protectedCategories.push("evidence records");
      if (protectedMinimums.paths > 0) protectedCategories.push("impact paths");
      if (protectedMinimums.reasoningRelationshipNarratives > 0) protectedCategories.push("relationship narratives (1)");
      if (protectedMinimums.reasoningSubjectTraceabilityRelationships > 0) protectedCategories.push("subject-traceability relationships (1)");
      if (protectedMinimums.reasoningSubjectTraceabilityNarratives > 0) protectedCategories.push("subject-traceability narratives (1)");
      if (protectedMinimums.reasoningImpactNarratives > 0) protectedCategories.push("impact narratives (1)");
      if (protectedMinimums.reasoningImpactChains > 0) protectedCategories.push("impact chains (1)");
      const packetSize = JSON.stringify(packet).length;
      const largestFields = Object.entries(packet)
        .map(([field, value]) => [field, JSON.stringify(value)?.length ?? 0] as const)
        .sort((left, right) => right[1] - left[1])
        .map(([field, size]) => `${field}=${size}`)
        .join(", ");
      const largestBriefFields = packet.engineeringBrief
        ? Object.entries(packet.engineeringBrief)
        .map(([field, value]) => [field, JSON.stringify(value)?.length ?? 0] as const)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([field, size]) => `${field}=${size}`)
        .join(", ")
        : "none";
      const error = new Error(
        `Context budget exceeded: protected categories preventing fit: ${protectedCategories.join(", ") || "none"}; packet size ${packetSize} characters exceeds configured budget ${maxContextChars}. Compact participation summaries=${packet.reasoningPackage?.subjectApplicationParticipation.length ?? 0}, prompt subject edges=${packet.reasoningPackage?.subjectTraceabilityRelationships.length ?? 0}, subject narratives=${packet.reasoningPackage?.subjectTraceabilityNarratives.length ?? 0}. Largest fields: ${largestFields}. Largest brief fields: ${largestBriefFields}.`,
      );
      error.name = "ContextBudgetExceededError";
      throw error;
    }
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const contextCharactersUsed = JSON.stringify(packet).length;
    if (packet.subjectTraceabilityDiagnostics.contextCharactersUsed === contextCharactersUsed) break;
    packet = {
      ...packet,
      subjectTraceabilityDiagnostics: {
        ...packet.subjectTraceabilityDiagnostics,
        contextCharactersUsed,
      },
    };
  }
  if (JSON.stringify(packet).length > maxContextChars) {
    const error = new Error(
      `Context budget exceeded: compact subject summaries and protected content exceed configured budget ${maxContextChars}.`,
    );
    error.name = "ContextBudgetExceededError";
    throw error;
  }
  return packet;
}