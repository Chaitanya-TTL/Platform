import "server-only";

import type { InvestigationId } from "../../kernel/contracts/investigation-identity";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import { isEngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type {
  ImpactEvidenceResponseV1,
  PlmBrainImpactEvidenceRequest,
  PlmBrainEntityResolutionResponse,
} from "../contracts/impact-evidence-service-v1";
import type { InvestigationKnowledgeGraph, OntologyResolvedRelationship } from "../contracts/relationship-ontology";
import { ensureInvestigationKnowledgeGraph } from "./ensure-investigation-knowledge-graph";
import type { ImpactEvidenceAuthorization } from "./impact-evidence-authorization";

export class ImpactEvidenceServiceError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "ImpactEvidenceServiceError";
  }
}

export interface ImpactEvidenceService {
  resolveEntity(
    investigationId: string,
    candidateEntityId: string,
    authorization: ImpactEvidenceAuthorization,
  ): Promise<PlmBrainEntityResolutionResponse>;
  retrieveImpactEvidence(
    investigationId: string,
    subjectEntityId: string,
    scope: PlmBrainImpactEvidenceRequest["scope"],
    authorization: ImpactEvidenceAuthorization,
  ): Promise<ImpactEvidenceResponseV1>;
  retrieveInvestigationEvidence(
    investigationId: string,
    authorization: ImpactEvidenceAuthorization,
  ): Promise<ImpactEvidenceResponseV1>;
}

type SnapshotLoader = (investigationId: InvestigationId) => Promise<InvestigationSnapshot | undefined>;
type SnapshotEnricher = (snapshot: InvestigationSnapshot) => InvestigationSnapshot;

function logInvestigationEvidenceDiagnostic(event: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "development") {
    console.info(`[lattice.investigation-evidence.${event}]`, details);
  }
}

export function createImpactEvidenceService(
  loadSnapshot: SnapshotLoader,
  enrichSnapshot: SnapshotEnricher = ensureInvestigationKnowledgeGraph,
): ImpactEvidenceService {
  async function loadGraph(investigationId: string): Promise<InvestigationKnowledgeGraph> {
    if (!investigationId.trim()) throw new ImpactEvidenceServiceError(400, "Investigation ID is required.");
    const snapshot = await loadSnapshot(investigationId as InvestigationId);
    const snapshotMatches = snapshot?.identity.investigationId === investigationId;
    const canonicalValue = snapshot?.canonical?.value;
    const canonicalIsValid = isEngineeringIntelligenceInvestigationV1(canonicalValue);
    const canonicalInvestigationId = canonicalIsValid ? canonicalValue.investigationId : undefined;
    const storedGraph = canonicalIsValid ? canonicalValue.knowledgeGraph : undefined;
    logInvestigationEvidenceDiagnostic("snapshot-prerequisites", {
      requestedInvestigationId: investigationId,
      snapshotFound: Boolean(snapshot),
      snapshotInvestigationId: snapshot?.identity.investigationId,
      snapshotMatches,
      snapshotRevision: snapshot?.identity.revision,
      snapshotLifecycle: snapshot?.lifecycle,
      acceptedEvidenceCount: snapshot?.acceptedEvidenceIds?.length,
      canonicalPresent: Boolean(snapshot?.canonical),
      canonicalIsValid,
      canonicalRevision: snapshot?.canonical?.revision,
      canonicalInvestigationId,
      canonicalEntityCount: canonicalIsValid ? canonicalValue.entities.length : undefined,
      canonicalRelationshipCount: canonicalIsValid ? canonicalValue.relationships.length : undefined,
      canonicalEvidenceCount: canonicalIsValid ? canonicalValue.evidence.length : undefined,
      canonicalSourceCount: canonicalIsValid ? canonicalValue.sources.length : undefined,
      storedGraphPresent: Boolean(storedGraph),
      storedGraphInvestigationId: storedGraph?.investigationId,
      storedGraphRevision: storedGraph?.snapshotRevision,
    });
    if (!snapshot || !snapshotMatches || !canonicalIsValid) {
      throw new ImpactEvidenceServiceError(404, "Investigation was not found.");
    }

    const enriched = enrichSnapshot(snapshot);
    const canonical = enriched.canonical?.value;
    const graph = isEngineeringIntelligenceInvestigationV1(canonical)
      ? canonical.knowledgeGraph
      : undefined;
    const graphGenerationPath = graph?.derivedOnRead
      ? "derived-on-read"
      : storedGraph
        ? "reused-stored-graph"
        : graph
          ? "enriched-canonical"
          : "unavailable";
    logInvestigationEvidenceDiagnostic("graph-prepared", {
      requestedInvestigationId: investigationId,
      graphGenerationPath,
      graphPresent: Boolean(graph),
      graphInvestigationId: graph?.investigationId,
      graphSnapshotRevision: graph?.snapshotRevision,
      graphEntityCount: graph?.entities.length,
      graphCanonicalRelationshipCount: graph?.canonicalRelationships.length,
      graphResolvedRelationshipCount: graph?.resolvedRelationships.length,
      graphRelationshipEvidenceCount: graph?.relationshipEvidence.length,
      graphImpactPathCount: graph?.impactPaths.length,
      graphImpactChainCount: graph?.impactChains?.length,
    });
    if (!graph || graph.investigationId !== investigationId) {
      logInvestigationEvidenceDiagnostic("conflict", {
        requestedInvestigationId: investigationId,
        conflictReason: !graph ? "authoritative-graph-unavailable" : "graph-investigation-id-mismatch",
        canonicalInvestigationId,
        graphInvestigationId: graph?.investigationId,
        responseBody: { message: "Authoritative impact evidence is unavailable." },
      });
      throw new ImpactEvidenceServiceError(409, "Authoritative impact evidence is unavailable.");
    }
    return graph;
  }

  return {
    async resolveEntity(investigationId, candidateEntityId, authorization) {
      if (!candidateEntityId.trim()) throw new ImpactEvidenceServiceError(400, "Candidate entity ID is required.");
      const graph = await loadGraph(investigationId);
      const matches = graph.entities.filter((entity) =>
        entity.id === candidateEntityId || entity.nativeId === candidateEntityId,
      );
      const candidateIds = [...new Set(matches.map((entity) => entity.id))].sort();
      const disposition = matches.length === 1 ? "Resolved" : matches.length > 1 ? "Ambiguous" : "Unresolved";
      const entity = matches.length === 1
        ? {
            system: matches[0].application ?? "unknown",
            entityType: matches[0].kind,
            canonicalId: matches[0].id,
            displayName: matches[0].label,
          }
        : undefined;

      return {
        contractVersion: "1.0",
        investigationId,
        requestId: authorization.requestId,
        traceId: authorization.traceId,
        disposition,
        entity,
        candidateIds,
        diagnostics: disposition === "Unresolved" ? ["No exact entity ID matched in this investigation."] :
          disposition === "Ambiguous" ? ["The identifier matched multiple entities in this investigation."] : [],
      };
    },

    async retrieveImpactEvidence(investigationId, subjectEntityId, scope, authorization) {
      if (!subjectEntityId.trim()) throw new ImpactEvidenceServiceError(400, "Subject entity ID is required.");
      if (scope.maxHops === null || scope.maxHops < 0 || scope.maxHops > 3 || scope.asOf !== null) {
        throw new ImpactEvidenceServiceError(400, "The requested impact scope is not supported.");
      }
      const graph = await loadGraph(investigationId);
      if (!graph.entities.some((entity) => entity.id === subjectEntityId)) {
        throw new ImpactEvidenceServiceError(404, "Subject entity was not found in this investigation.");
      }

      const selectedRelationships = graph.resolvedRelationships.filter((relationship) =>
        relationshipAllowed(relationship, scope),
      );
      const selectedRelationshipIds = new Set(selectedRelationships.map((relationship) => relationship.id));
      const paths = graph.impactPaths.filter((path) =>
        path.sourceEntityId === subjectEntityId &&
        pathWithinScope(path.relationshipIds, selectedRelationshipIds, scope.maxHops),
      );
      const chains = (graph.impactChains ?? []).filter((chain) =>
        chain.sourceEntityId === subjectEntityId &&
        pathWithinScope(chain.relationshipIds, selectedRelationshipIds, scope.maxHops),
      );
      const referencedRelationshipIds = new Set([
        ...paths.flatMap((path) => path.relationshipIds),
        ...chains.flatMap((chain) => chain.relationshipIds),
      ]);
      const relationships = selectedRelationships
        .filter((relationship) => referencedRelationshipIds.has(relationship.id));
      const evidenceIds = new Set([
        ...relationships.flatMap((relationship) => relationship.evidenceIds),
        ...chains.flatMap((chain) => chain.supportingEvidenceIds),
      ]);
      const sources = graph.relationshipEvidence
        .filter((observation) =>
          evidenceIds.has(observation.id) &&
          observationAllowed(observation, scope),
        )
        .map((observation) => sourceReference(observation, graph.snapshotRevision, authorization));

      const sourceEvidenceIds = new Set(sources.map((source) => source.evidenceId));
      if (
        [...evidenceIds].some((id) => !sourceEvidenceIds.has(id)) ||
        sources.some((source) => !source.provenanceId || !source.provider || !source.authority)
      ) {
        throw new ImpactEvidenceServiceError(409, "Required evidence provenance is incomplete.");
      }

      return {
        investigationId,
        relationships: relationships.map((relationship) => ({
          id: relationship.id,
          sourceEntityId: relationship.sourceEntityId,
          targetEntityId: relationship.targetEntityId,
          forwardType: relationship.forwardType,
          forwardMeaning: relationship.forwardMeaning,
          inverseMeaning: relationship.inverseMeaning,
          status: relationship.status,
          strength: relationship.strength,
          evidenceIds: relationship.evidenceIds,
          citationIds: relationship.citationIds,
        })),
        paths: paths.map((path) => ({
          id: path.id,
          sourceEntityId: path.sourceEntityId,
          targetEntityId: path.targetEntityId,
          entityIds: [path.sourceEntityId, ...path.steps.map((step) => step.toEntityId)],
          relationshipIds: path.relationshipIds,
          steps: path.steps,
          meanings: path.meanings,
          status: path.status,
          strength: path.strength,
          impactEligible: path.impactEligible,
          citationIds: path.citationIds,
        })),
        chains: chains.map((chain) => ({
          id: chain.id,
          sourceEntityId: chain.sourceEntityId,
          impactedEntityId: chain.impactedEntityId,
          relationshipIds: chain.relationshipIds,
          relationshipSequence: chain.relationshipSequence,
          supportingEvidenceIds: chain.supportingEvidenceIds,
          citationIds: chain.citationIds,
          engineeringExplanation: chain.engineeringExplanation,
          confidence: chain.confidence,
          impactRationale: chain.impactRationale,
          status: chain.status,
          strength: chain.strength,
        })),
        sources,
        sourceVersion: String(graph.snapshotRevision),
        ontologyVersion: graph.ontologyVersion,
        authorizationDecisionId: authorization.decisionId,
        requestId: authorization.requestId,
        traceId: authorization.traceId,
      };
    },

    async retrieveInvestigationEvidence(investigationId, authorization) {
      const graph = await loadGraph(investigationId);
      return {
        investigationId,
        relationships: graph.resolvedRelationships.map((relationship) => ({
          id: relationship.id,
          sourceEntityId: relationship.sourceEntityId,
          targetEntityId: relationship.targetEntityId,
          forwardType: relationship.forwardType,
          forwardMeaning: relationship.forwardMeaning,
          inverseMeaning: relationship.inverseMeaning,
          status: relationship.status,
          strength: relationship.strength,
          evidenceIds: relationship.evidenceIds,
          citationIds: relationship.citationIds,
        })),
        paths: graph.impactPaths.map((path) => ({
          id: path.id,
          sourceEntityId: path.sourceEntityId,
          targetEntityId: path.targetEntityId,
          entityIds: [path.sourceEntityId, ...path.steps.map((step) => step.toEntityId)],
          relationshipIds: path.relationshipIds,
          steps: path.steps,
          meanings: path.meanings,
          status: path.status,
          strength: path.strength,
          impactEligible: path.impactEligible,
          citationIds: path.citationIds,
        })),
        chains: (graph.impactChains ?? []).map((chain) => ({
          id: chain.id,
          sourceEntityId: chain.sourceEntityId,
          impactedEntityId: chain.impactedEntityId,
          relationshipIds: chain.relationshipIds,
          relationshipSequence: chain.relationshipSequence,
          supportingEvidenceIds: chain.supportingEvidenceIds,
          citationIds: chain.citationIds,
          engineeringExplanation: chain.engineeringExplanation,
          confidence: chain.confidence,
          impactRationale: chain.impactRationale,
          status: chain.status,
          strength: chain.strength,
        })),
        sources: graph.relationshipEvidence.map((observation) =>
          sourceReference(observation, graph.snapshotRevision, authorization),
        ),
        sourceVersion: String(graph.snapshotRevision),
        ontologyVersion: graph.ontologyVersion,
        authorizationDecisionId: authorization.decisionId,
        requestId: authorization.requestId,
        traceId: authorization.traceId,
      };
    },
  };
}

function sourceReference(
  observation: InvestigationKnowledgeGraph["relationshipEvidence"][number],
  snapshotRevision: number,
  authorization: ImpactEvidenceAuthorization,
): ImpactEvidenceResponseV1["sources"][number] {
  return {
    evidenceId: observation.id,
    sourceType: "ontology-observation",
    sourceSystem: observation.application ?? observation.provider ?? "unknown",
    recordId: observation.entityId,
    revision: String(snapshotRevision),
    location: observation.path ?? null,
    deepLink: null,
    provenanceId: observation.id,
    authorizationDecisionId: authorization.decisionId,
    citationId: observation.citationId ?? null,
    authority: observation.authority ?? "",
    provider: observation.provider ?? "",
    observedAt: observation.observedAt ?? "",
  };
}

function relationshipAllowed(
  relationship: OntologyResolvedRelationship,
  scope: PlmBrainImpactEvidenceRequest["scope"],
): boolean {
  const types = scope.relationshipTypes;
  const systems = scope.sourceSystems;
  return (types.length === 0 || types.includes(relationship.forwardType) || types.includes("*")) &&
    (systems.length === 0 || relationship.evidence.some((item) =>
      (item.application && systems.includes(item.application)) ||
      systems.includes(item.provider),
    ));
}

function observationAllowed(
  observation: { application?: string; provider: string; observedAt: string },
  scope: PlmBrainImpactEvidenceRequest["scope"],
): boolean {
  return (scope.sourceSystems.length === 0 ||
      (observation.application !== undefined && scope.sourceSystems.includes(observation.application)) ||
      scope.sourceSystems.includes(observation.provider));
}

function pathWithinScope(
  relationshipIds: readonly string[],
  allowedRelationshipIds: ReadonlySet<string>,
  maxHops: number | null,
): boolean {
  return relationshipIds.length > 0 &&
    (maxHops === null || relationshipIds.length <= maxHops) &&
    relationshipIds.every((id) => allowedRelationshipIds.has(id));
}
