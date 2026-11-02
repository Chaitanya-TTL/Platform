import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type {
  InvestigationKnowledgeGraph,
  LatticeRelationshipOntology,
  OntologyEvidenceObservation,
  OntologyEvidenceRule,
  OntologyImpactChain,
  OntologyRelationshipDefinition,
  OntologyRelationshipPath,
  OntologyResolvedRelationship,
  OntologyUnresolvedEvaluation,
} from "../contracts/relationship-ontology";
import { COPILOT_RETRIEVAL_CONFIG } from "../../copilot/retrieval-config";

function citationId(kind: string, id: string): string {
  return `cite:${kind}:${encodeURIComponent(id)}`;
}

function stableId(parts: readonly string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(":");
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function propertyValue(properties: Record<string, { text?: string; number?: number; reference?: string; items?: string[] }>, path: string): string | string[] | undefined {
  const property = properties[path];
  if (!property) return undefined;
  if (Array.isArray(property.items)) return property.items.map((item) => String(item).trim()).filter(Boolean);
  const value = property.text ?? property.number ?? property.reference;
  return value === undefined ? undefined : String(value).trim();
}

function ruleMatches(
  rule: OntologyEvidenceRule,
  source: EngineeringIntelligenceInvestigationV1["entities"][number],
  target: EngineeringIntelligenceInvestigationV1["entities"][number],
): { sourceValue: string; targetValue: string } | undefined {
  const sourceValue = propertyValue(source.properties, rule.sourcePath);
  const targetValue = propertyValue(target.properties, rule.targetPath);
  if (typeof sourceValue !== "string" || !targetValue) return undefined;
  if (rule.operator === "exact-scalar" && typeof targetValue === "string" && normalized(sourceValue) === normalized(targetValue))
    return { sourceValue, targetValue };
  if (rule.operator === "exact-list-reference" && Array.isArray(targetValue) && targetValue.some((value) => normalized(value) === normalized(sourceValue)))
    return { sourceValue, targetValue: sourceValue };
  return undefined;
}

function evidenceFor(
  source: EngineeringIntelligenceInvestigationV1["entities"][number],
  target: EngineeringIntelligenceInvestigationV1["entities"][number],
  rule: OntologyEvidenceRule,
  values: { sourceValue: string; targetValue: string },
): OntologyEvidenceObservation[] {
  const observations = [
    {
      id: stableId([source.id, rule.sourcePath, values.sourceValue]),
      application: source.provenance.source,
      entityId: source.id,
      path: `properties.${rule.sourcePath}`,
      value: values.sourceValue,
      provider: source.provenance.provider,
      observedAt: source.provenance.observedAt,
      authority: source.provenance.authority,
    },
    {
      id: stableId([target.id, rule.targetPath, values.targetValue]),
      application: target.provenance.source,
      entityId: target.id,
      path: `properties.${rule.targetPath}`,
      value: values.targetValue,
      provider: target.provenance.provider,
      observedAt: target.provenance.observedAt,
      authority: target.provenance.authority,
    },
  ];
  return observations.map((observation) => ({ ...observation, citationId: citationId("evidence", observation.id) }));
}

function statusRank(status: OntologyResolvedRelationship["status"]): number {
  return status === "SOURCE_EXPLICIT" ? 0 : status === "CONFIRMED" ? 1 : status === "RULE_DERIVED" ? 2 : status === "CALCULATED" ? 3 : 4;
}

function buildPaths(
  entities: InvestigationKnowledgeGraph["entities"],
  relationships: Array<{
    id: string;
    sourceEntityId: string;
    targetEntityId: string;
    forwardType: string;
    forwardMeaning: string;
    inverseType?: string;
    inverseMeaning?: string;
    status: OntologyResolvedRelationship["status"];
    strength: OntologyResolvedRelationship["strength"];
    impactTraversal: boolean;
    citationIds: string[];
  }>,
  impactOnly: boolean,
  maxDepth: number,
): OntologyRelationshipPath[] {
  const ids = new Set(entities.map((entity) => entity.id));
  const outgoing = new Map<string, Array<{
    relationship: typeof relationships[number];
    fromEntityId: string;
    toEntityId: string;
    traversal: "forward" | "inverse";
    type: string;
    meaning: string;
  }>>();
  for (const relationship of relationships) {
    if (impactOnly && !relationship.impactTraversal) continue;
    const forward = outgoing.get(relationship.sourceEntityId) ?? [];
    forward.push({
      relationship,
      fromEntityId: relationship.sourceEntityId,
      toEntityId: relationship.targetEntityId,
      traversal: "forward",
      type: relationship.forwardType,
      meaning: relationship.forwardMeaning,
    });
    outgoing.set(relationship.sourceEntityId, forward);
    if (relationship.inverseType && relationship.inverseMeaning) {
      const inverse = outgoing.get(relationship.targetEntityId) ?? [];
      inverse.push({
        relationship,
        fromEntityId: relationship.targetEntityId,
        toEntityId: relationship.sourceEntityId,
        traversal: "inverse",
        type: relationship.inverseType,
        meaning: relationship.inverseMeaning,
      });
      outgoing.set(relationship.targetEntityId, inverse);
    }
  }
  const paths = new Map<string, OntologyRelationshipPath>();
  for (const start of [...ids].sort()) {
    const queue: Array<{
      entityId: string;
      visitedEntityIds: string[];
      relationshipIds: string[];
      steps: OntologyRelationshipPath["steps"];
      meanings: string[];
      citations: string[];
    }> = [
      { entityId: start, visitedEntityIds: [start], relationshipIds: [], steps: [], meanings: [], citations: [] },
    ];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      if (current.relationshipIds.length >= maxDepth) continue;
      const edges = [...(outgoing.get(current.entityId) ?? [])].sort((a, b) =>
        a.relationship.id.localeCompare(b.relationship.id) || a.traversal.localeCompare(b.traversal),
      );
      for (const edge of edges) {
        const relationship = edge.relationship;
        if (current.relationshipIds.includes(relationship.id)) continue;
        const nextId = edge.toEntityId;
        if (!ids.has(nextId) || current.visitedEntityIds.includes(nextId)) continue;
        const relationshipIds = [...current.relationshipIds, relationship.id];
        const step = {
          relationshipId: relationship.id,
          fromEntityId: edge.fromEntityId,
          toEntityId: edge.toEntityId,
          traversal: edge.traversal,
          type: edge.type,
          meaning: edge.meaning,
        };
        const steps = [...current.steps, step];
        const meanings = [...current.meanings, edge.meaning];
        const citations = [...current.citations, ...relationship.citationIds];
        const pathId = stableId(["path", start, nextId, ...steps.map((item) => `${item.relationshipId}:${item.traversal}`)]);
        const pathRelationships = relationshipIds.map((id) => relationships.find((item) => item.id === id)).filter(Boolean);
        paths.set(pathId, {
          id: pathId,
          sourceEntityId: start,
          targetEntityId: nextId,
          relationshipIds,
          steps,
          meanings,
          status: pathRelationships.sort((a, b) => statusRank(a!.status) - statusRank(b!.status))[0]?.status ?? "POTENTIAL",
          strength: pathRelationships.every((item) => item?.strength === "STRONG") ? "STRONG" : "MEDIUM",
          impactEligible: pathRelationships.every((item) => item?.impactTraversal === true),
          citationIds: [...new Set(citations)].sort(),
        });
        queue.push({ entityId: nextId, visitedEntityIds: [...current.visitedEntityIds, nextId], relationshipIds, steps, meanings, citations });
      }
    }
  }
  return [...paths.values()].sort((a, b) => a.relationshipIds.length - b.relationshipIds.length || a.id.localeCompare(b.id));
}

function resolveDefinitions(
  canonical: EngineeringIntelligenceInvestigationV1,
  ontology: LatticeRelationshipOntology,
  snapshotRevision: number,
  entityIds: Set<string>,
): { resolved: OntologyResolvedRelationship[]; unresolved: OntologyUnresolvedEvaluation[]; evidence: OntologyEvidenceObservation[] } {
  const resolved: OntologyResolvedRelationship[] = [];
  const unresolved: OntologyUnresolvedEvaluation[] = [];
  const evidence: OntologyEvidenceObservation[] = [];
  const entities = canonical.entities.filter((entity) => entityIds.has(entity.id));
  const existingByEndpoints = new Map<string, string[]>();
  for (const relationship of canonical.relationships) {
    const key = `${relationship.sourceEntityId}\u0000${relationship.targetEntityId}`;
    existingByEndpoints.set(key, [...(existingByEndpoints.get(key) ?? []), relationship.id]);
  }

  for (const definition of ontology.relationshipDefinitions) {
    const sources = entities.filter((entity) => definition.sourceApplications.includes(entity.provenance.source ?? "") && definition.sourceKinds.includes(entity.kind));
    const targets = entities.filter((entity) => definition.targetApplications.includes(entity.provenance.source ?? "") && definition.targetKinds.includes(entity.kind));
    let matchedForDefinition = 0;
    for (const source of sources) {
      for (const target of targets) {
        if (source.id === target.id) continue;
        const matched = definition.evidenceRules
          .map((rule) => ({ rule, values: ruleMatches(rule, source, target) }))
          .filter((entry): entry is { rule: OntologyEvidenceRule; values: { sourceValue: string; targetValue: string } } => Boolean(entry.values))
          .sort((a, b) => statusRank(a.rule.status) - statusRank(b.rule.status) || a.rule.id.localeCompare(b.rule.id))[0];
        if (!matched) continue;
        matchedForDefinition++;
        const observations = evidenceFor(source, target, matched.rule, matched.values);
        evidence.push(...observations);
        const edgeEvidenceIds = existingByEndpoints.get(`${source.id}\u0000${target.id}`) ?? [];
        const relationshipId = stableId(["ontology", ontology.ontologyVersion, definition.id, matched.rule.id, source.id, target.id]);
        const ids = [
          citationId("entity", source.id),
          citationId("entity", target.id),
          ...observations.map((observation) => observation.citationId),
          ...edgeEvidenceIds.flatMap((id) => canonical.relationships.find((edge) => edge.id === id)?.evidenceIds.map((evidenceId) => citationId("evidence", evidenceId)) ?? []),
        ];
        resolved.push({
          id: relationshipId,
          definitionId: definition.id,
          evidenceRuleId: matched.rule.id,
          sourceEntityId: source.id,
          targetEntityId: target.id,
          forwardType: definition.forward.type,
          forwardMeaning: definition.forward.meaning,
          inverseType: definition.inverse.type,
          inverseMeaning: definition.inverse.meaning,
          status: matched.rule.status,
          strength: matched.rule.strength,
          mechanism: matched.rule.mechanism,
          impactTraversal: definition.impactTraversal,
          evidence: observations,
          evidenceIds: observations.map((observation) => observation.id),
          canonicalRelationshipIds: edgeEvidenceIds,
          citationIds: [...new Set(ids)].sort(),
          provenance: {
            authority: matched.rule.authority,
            provider: "lattice-relationship-ontology",
            ontologyVersion: ontology.ontologyVersion,
            observedAt: [source.provenance.observedAt, target.provenance.observedAt].sort().at(-1) ?? canonical.temporal.assembledAt,
            snapshotRevision,
          },
        });
      }
    }
    if (matchedForDefinition === 0) {
      unresolved.push({
        id: stableId(["unresolved", ontology.ontologyVersion, definition.id, ...sources.map((item) => item.id), ...targets.map((item) => item.id)]),
        definitionId: definition.id,
        sourceApplication: definition.sourceApplications.join("|"),
        targetApplication: definition.targetApplications.join("|"),
        sourceCandidates: sources.map((entity) => entity.id).sort(),
        targetCandidates: targets.map((entity) => entity.id).sort(),
        reason: sources.length && targets.length ? "evidence-not-found" : "no-compatible-endpoints",
        evidenceRuleIds: definition.evidenceRules.map((rule) => rule.id).sort(),
        candidateCount: sources.length * targets.length,
        citationIds: [...sources.map((entity) => citationId("entity", entity.id)), ...targets.map((entity) => citationId("entity", entity.id))].sort(),
      });
    }
  }
  return { resolved, unresolved, evidence };
}

export function buildKnowledgeGraphSummary(graph: InvestigationKnowledgeGraph): NonNullable<InvestigationKnowledgeGraph["knowledgeGraphSummary"]> {
  const relationshipIds = new Set([
    ...graph.canonicalRelationships.map((relationship) => relationship.id),
    ...graph.resolvedRelationships.flatMap((relationship) =>
      relationship.canonicalRelationshipIds.length ? relationship.canonicalRelationshipIds : [relationship.id],
    ),
  ]);
  const evidenceIds = new Set([
    ...graph.canonicalRelationships.flatMap((relationship) => relationship.evidenceIds),
    ...graph.resolvedRelationships.flatMap((relationship) => relationship.evidenceIds),
    ...graph.relationshipEvidence.map((item) => item.id),
  ]);
  const applicationCoverage: Record<string, number> = {};
  for (const entity of graph.entities) {
    const application = entity.application ?? "unknown";
    applicationCoverage[application] = (applicationCoverage[application] ?? 0) + 1;
  }
  return {
    entityCount: graph.entities.length,
    relationshipCount: relationshipIds.size,
    impactPathCount: (graph.impactChains ?? []).length,
    evidenceCount: evidenceIds.size,
    applicationCoverage,
    ontologyVersion: graph.ontologyVersion,
    maxTraversalDepth: graph.confidenceMetadata.maxTraversalDepth,
  };
}

function materializeImpactChains(
  paths: readonly OntologyRelationshipPath[],
  ontology: LatticeRelationshipOntology,
  relationships: readonly OntologyResolvedRelationship[],
  entities: InvestigationKnowledgeGraph["entities"],
): OntologyImpactChain[] {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const definitionByRelationshipId = new Map(relationships.map((relationship) => [relationship.id, relationship.definitionId]));
  return paths.flatMap((path) => {
    const source = entityById.get(path.sourceEntityId);
    const target = entityById.get(path.targetEntityId);
    if (!source || !target || !path.impactEligible) return [];
    const template = ontology.impactPathTemplates.find((candidate) =>
      candidate.relationshipDefinitionIds.length === path.relationshipIds.length &&
      candidate.relationshipDefinitionIds.every((definitionId, index) =>
        definitionByRelationshipId.get(path.relationshipIds[index]) === definitionId,
      ),
    );
    const relationshipStrength = path.strength === "STRONG" ? 1 : path.strength === "MEDIUM" ? 0.65 : 0.3;
    const relationshipConfidence = path.status === "SOURCE_EXPLICIT" ? 1
      : path.status === "CONFIRMED" ? 0.95
      : path.status === "RULE_DERIVED" ? 0.8
      : path.status === "CALCULATED" ? 0.7
      : 0.4;
    const confidence = Number((relationshipStrength * 0.55 + relationshipConfidence * 0.45).toFixed(3));
    const steps = path.steps.flatMap((step) => {
      const from = entityById.get(step.fromEntityId);
      const to = entityById.get(step.toEntityId);
      return from && to ? [`${from.label} ${step.meaning.trim().replace(/[.]+$/g, "").toLocaleLowerCase()} ${to.label}.`] : [];
    });
    if (steps.length !== path.steps.length) return [];
    const engineeringExplanation = [
      `Changes to ${source.label} may affect ${target.label} through the following governed chain:`,
      ...steps,
      template?.meaning ?? `This establishes a traceable potential engineering dependency from ${source.label} to ${target.label}.`,
    ].join(" ");
    const impactRationale = template
      ? `${template.meaning} This is an impact eligibility statement, not proof of causation.`
      : `Each relationship in this chain is marked for impact traversal by the ontology. The chain indicates potential impact, not proof that a change will cause an effect.`;
    const supportingEvidenceIds = [...new Set(path.citationIds.filter((id) => id.startsWith("cite:evidence:")))].sort();
    return [{
      id: stableId(["impact-chain", path.id]),
      sourceEntityId: path.sourceEntityId,
      impactedEntityId: path.targetEntityId,
      relationshipIds: path.relationshipIds,
      relationshipSequence: path.steps,
      supportingEvidenceIds,
      citationIds: path.citationIds,
      engineeringExplanation,
      confidence,
      impactRationale,
      status: path.status,
      strength: path.strength,
    }];
  });
}

export function enrichInvestigationWithOntology(
  canonical: EngineeringIntelligenceInvestigationV1,
  ontology: LatticeRelationshipOntology,
  snapshotRevision: number,
  derivedOnRead = false,
  requestedGraphDepth: number = COPILOT_RETRIEVAL_CONFIG.graphTraversalDepth,
): EngineeringIntelligenceInvestigationV1 {
  const configuredDepth = Number.isFinite(requestedGraphDepth) && requestedGraphDepth > 0
    ? Math.floor(requestedGraphDepth)
    : COPILOT_RETRIEVAL_CONFIG.graphTraversalDepth;
  const graphDepth = Math.max(configuredDepth, COPILOT_RETRIEVAL_CONFIG.maxTraversalDepth);
  const entityIds = new Set(canonical.entities.map((entity) => entity.id));
  const evaluation = resolveDefinitions(canonical, ontology, snapshotRevision, entityIds);
  const entities: InvestigationKnowledgeGraph["entities"] = canonical.entities
    .map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      ...(entity.provenance.source ? { application: entity.provenance.source } : {}),
      label: entity.displayName,
      ...(entity.provenance.nativeId ? { nativeId: entity.provenance.nativeId } : {}),
      citationId: citationId("entity", entity.id),
      provenance: {
        provider: entity.provenance.provider,
        authority: entity.provenance.authority,
        observedAt: entity.provenance.observedAt,
        freshness: entity.temporal.freshness,
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const canonicalRelationships: InvestigationKnowledgeGraph["canonicalRelationships"] = canonical.relationships
    .filter((relationship) => entityIds.has(relationship.sourceEntityId) && entityIds.has(relationship.targetEntityId))
    .map((relationship) => ({
      id: relationship.id,
      sourceEntityId: relationship.sourceEntityId,
      targetEntityId: relationship.targetEntityId,
      type: relationship.kind,
      citationId: citationId("relationship", relationship.id),
      evidenceIds: [...relationship.evidenceIds].sort(),
      evidenceCitationIds: relationship.evidenceIds.map((id) => citationId("evidence", id)).sort(),
      provenance: {
        provider: relationship.provenance.provider,
        authority: relationship.provenance.authority,
        observedAt: relationship.provenance.observedAt,
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const outgoing: Record<string, string[]> = {};
  const incoming: Record<string, string[]> = {};
  for (const edge of evaluation.resolved) {
    outgoing[edge.sourceEntityId] = [...(outgoing[edge.sourceEntityId] ?? []), edge.id];
    incoming[edge.targetEntityId] = [...(incoming[edge.targetEntityId] ?? []), edge.id];
  }
  for (const edge of canonicalRelationships) {
    outgoing[edge.sourceEntityId] = [...(outgoing[edge.sourceEntityId] ?? []), edge.id];
    incoming[edge.targetEntityId] = [...(incoming[edge.targetEntityId] ?? []), edge.id];
  }
  for (const index of [outgoing, incoming]) {
    for (const ids of Object.values(index)) ids.sort();
  }
  const relationships = evaluation.resolved;
  const resolvedCanonicalIds = new Set(relationships.flatMap((edge) => edge.canonicalRelationshipIds));
  const pathEdges = [
    ...relationships.map((edge) => ({
      id: edge.id,
      sourceEntityId: edge.sourceEntityId,
      targetEntityId: edge.targetEntityId,
      forwardType: edge.forwardType,
      forwardMeaning: edge.forwardMeaning,
      inverseType: edge.inverseType,
      inverseMeaning: edge.inverseMeaning,
      status: edge.status,
      strength: edge.strength,
      impactTraversal: edge.impactTraversal,
      citationIds: edge.citationIds,
    })),
    ...canonicalRelationships.filter((edge) => !resolvedCanonicalIds.has(edge.id)).map((edge) => ({
        id: edge.id,
        sourceEntityId: edge.sourceEntityId,
        targetEntityId: edge.targetEntityId,
        forwardType: edge.type,
        forwardMeaning: `Observed canonical relationship: ${edge.type}`,
        status: "POTENTIAL" as const,
        strength: "WEAK" as const,
        impactTraversal: false,
        citationIds: [edge.citationId, ...edge.evidenceCitationIds],
      })),
  ];
  const relationshipPaths = buildPaths(entities, pathEdges, false, graphDepth);
  const definitionByRelationshipId = new Map(relationships.map((relationship) => [relationship.id, relationship.definitionId]));
  const impactPaths = ontology.impactPathTemplates.length
    ? relationshipPaths.filter((path) => ontology.impactPathTemplates.some((template) =>
        template.relationshipDefinitionIds.length === path.relationshipIds.length &&
        template.relationshipDefinitionIds.every((definitionId, index) =>
          definitionByRelationshipId.get(path.relationshipIds[index]) === definitionId,
        ),
      ))
    : relationshipPaths.filter((path) => path.impactEligible);
  const impactChains = materializeImpactChains(impactPaths, ontology, relationships, entities);
  const mappings = new Map<string, string[]>();
  for (const edge of relationships) {
    const source = entities.find((entity) => entity.id === edge.sourceEntityId)?.application ?? "unknown";
    const target = entities.find((entity) => entity.id === edge.targetEntityId)?.application ?? "unknown";
    const key = `${source}\u0000${target}`;
    mappings.set(key, [...(mappings.get(key) ?? []), edge.id]);
  }
  const knowledgeGraph: InvestigationKnowledgeGraph = {
    schemaVersion: "1.0",
    ontologyVersion: ontology.ontologyVersion,
    derivedOnRead,
    ontology,
    investigationId: canonical.investigationId,
    snapshotRevision,
    entities,
    canonicalRelationships,
    resolvedRelationships: relationships,
    unresolvedEvaluations: evaluation.unresolved,
    relationshipPaths,
    impactPaths,
    impactChains,
    relationshipEvidence: evaluation.evidence,
    crossApplicationMappings: [...mappings.entries()].map(([key, relationshipIds]) => {
      const [sourceApplication, targetApplication] = key.split("\u0000");
      return { sourceApplication, targetApplication, relationshipIds: relationshipIds.sort() };
    }).sort((a, b) => `${a.sourceApplication}:${a.targetApplication}`.localeCompare(`${b.sourceApplication}:${b.targetApplication}`)),
    traversalIndexes: { outgoing, incoming },
    confidenceMetadata: {
      entityCount: entities.length,
      relationshipCount: relationships.length + canonicalRelationships.length,
      unresolvedCount: evaluation.unresolved.length,
      relationshipCoverage: ontology.relationshipDefinitions.length
        ? evaluation.resolved.length / (evaluation.resolved.length + evaluation.unresolved.length || 1)
        : 0,
      maxTraversalDepth: graphDepth,
    },
  };
  knowledgeGraph.knowledgeGraphSummary = buildKnowledgeGraphSummary(knowledgeGraph);
  return { ...canonical, knowledgeGraph };
}
