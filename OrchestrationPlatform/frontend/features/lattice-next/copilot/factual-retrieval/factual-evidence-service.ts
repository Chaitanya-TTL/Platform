import "server-only";

import type {
  ApplicationParticipationEvidenceV1,
  EngineeringFactEvidenceV1,
  GenericFactV1,
} from "../../contracts/factual-evidence-v1";
import type { EngineeringProvenance } from "../../contracts/intelligence-v1";
import { isEngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type { InvestigationId } from "../../kernel/contracts/investigation-identity";
import { asInvestigationId } from "../../kernel/contracts/investigation-identity";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import { isAcceptedSnapshot } from "../../kernel/application/source-evidence-projection";
import { ensureInvestigationKnowledgeGraph } from "../../plm-brain/universal/ensure-investigation-knowledge-graph";
import {
  projectApplicationParticipation,
  projectStructuredFacts,
} from "./structured-fact-projection";

export interface FactualEvidenceAuthorization {
  decisionId: string;
  requestId: string;
  traceId: string;
}

export interface FactEvidencePlanV1 {
  requested: boolean;
  linkedEntityIds: readonly string[];
  sourceApplications: readonly string[];
  fieldIds: readonly string[];
  exactIdentifiers: readonly string[];
  reasonCode: string;
}

export interface ApplicationContextPlanV1 {
  requested: boolean;
  linkedEntityIds: readonly string[];
  sourceApplications: readonly string[];
  reasonCode: string;
}

export interface FactualEvidenceSnapshotBinding {
  sourceVersion: string;
  ontologyVersion: string;
}

type FactEvidenceCandidate = Omit<EngineeringFactEvidenceV1, "provenance"> & {
  provenance?: EngineeringProvenance;
};

export interface FactEvidenceServiceResponse {
  contractVersion: "1.0";
  evidence: {
    investigationId: string;
    snapshotRevision: number;
    sourceVersion: string;
    ontologyVersion: string;
    authorizationDecisionId: string;
    requestId: string;
    traceId: string;
    authoritativeEntityIds: readonly string[];
    facts: readonly FactEvidenceCandidate[];
  };
}

export interface ApplicationContextServiceResponse {
  contractVersion: "1.0";
  evidence: {
    investigationId: string;
    snapshotRevision: number;
    sourceVersion: string;
    ontologyVersion: string;
    authorizationDecisionId: string;
    requestId: string;
    traceId: string;
    authoritativeEntityIds: readonly string[];
    participations: readonly ApplicationParticipationEvidenceV1[];
  };
}

export class FactualEvidenceServiceError extends Error {
  constructor(readonly status: 404 | 409, message: string) {
    super(message);
    this.name = "FactualEvidenceServiceError";
  }
}

type SnapshotLoader = (investigationId: InvestigationId) => Promise<InvestigationSnapshot | undefined>;
type SnapshotEnricher = (snapshot: InvestigationSnapshot) => InvestigationSnapshot;

const containsIgnoreCase = (values: readonly string[], value: string): boolean =>
  values.some((candidate) => candidate.toLowerCase() === value.toLowerCase());

function sourceProvenanceOf(fact: GenericFactV1): EngineeringProvenance | undefined {
  if ("provider" in fact.provenance) return fact.provenance;
  return fact.provenance.source ??
    fact.provenance.entity ??
    fact.provenance.evidence[0]?.provenance;
}

function evidenceIdsOf(fact: GenericFactV1): readonly string[] {
  if (fact.evidenceIds) return fact.evidenceIds;
  if ("evidence" in fact.provenance) {
    return fact.provenance.evidence.map((evidence) => evidence.id);
  }
  return [];
}

function matchesExactIdentifier(fact: GenericFactV1, identifiers: readonly string[]): boolean {
  if (identifiers.length === 0) return true;
  const factIdentifiers = [
    fact.sourceNativeId,
    fact.sourceEntityId,
    sourceProvenanceOf(fact)?.nativeId,
  ].filter((identifier): identifier is string => Boolean(identifier));
  return identifiers.some((identifier) => factIdentifiers.includes(identifier));
}

export function createFactualEvidenceService(
  loadSnapshot: SnapshotLoader,
  enrichSnapshot: SnapshotEnricher = ensureInvestigationKnowledgeGraph,
) {
  async function loadBoundSnapshot(
    investigationId: string,
    binding: FactualEvidenceSnapshotBinding,
  ) {
    if (!investigationId.trim()) {
      throw new FactualEvidenceServiceError(404, "Investigation was not found.");
    }

    const snapshot = await loadSnapshot(asInvestigationId(investigationId));
    if (!snapshot ||
        String(snapshot.identity.investigationId) !== investigationId ||
        !snapshot.canonical ||
        !isEngineeringIntelligenceInvestigationV1(snapshot.canonical.value)) {
      throw new FactualEvidenceServiceError(404, "Investigation was not found.");
    }

    const enriched = enrichSnapshot(snapshot);
    if (!isAcceptedSnapshot(enriched)) {
      throw new FactualEvidenceServiceError(409, "The current accepted investigation snapshot is unavailable.");
    }

    const graph = enriched.canonical.value.knowledgeGraph;
    if (!graph ||
        graph.investigationId !== investigationId ||
        binding.sourceVersion !== String(graph.snapshotRevision) ||
        binding.ontologyVersion !== graph.ontologyVersion) {
      throw new FactualEvidenceServiceError(409, "The factual evidence snapshot does not match the authorized graph snapshot.");
    }

    return { snapshot: enriched, graph };
  }

  return {
    async retrieveFacts(
      investigationId: string,
      plan: FactEvidencePlanV1,
      binding: FactualEvidenceSnapshotBinding,
      authorization: FactualEvidenceAuthorization,
    ): Promise<FactEvidenceServiceResponse> {
      const { snapshot, graph } = await loadBoundSnapshot(investigationId, binding);
      const projection = projectStructuredFacts(snapshot);
      const graphEntityIds = new Set(graph.entities.map((entity) => entity.id));
      const facts = projection.facts
        .filter((fact) =>
          (plan.fieldIds.length === 0 || containsIgnoreCase(plan.fieldIds, fact.fieldId)) &&
          (plan.sourceApplications.length === 0 ||
            containsIgnoreCase(plan.sourceApplications, fact.sourceApplication)) &&
          matchesExactIdentifier(fact, plan.exactIdentifiers) &&
          (plan.linkedEntityIds.length === 0 ||
            plan.linkedEntityIds.includes(fact.subjectId ?? "") ||
            plan.linkedEntityIds.includes(fact.sourceEntityId))
        )
        .map((fact) => ({
          ...fact,
          snapshotRevision: graph.snapshotRevision,
          evidenceIds: evidenceIdsOf(fact),
          authorizationDecisionId: authorization.decisionId,
          provenance: sourceProvenanceOf(fact),
        }));

      return {
        contractVersion: "1.0",
        evidence: {
          investigationId,
          snapshotRevision: graph.snapshotRevision,
          sourceVersion: String(graph.snapshotRevision),
          ontologyVersion: graph.ontologyVersion,
          authorizationDecisionId: authorization.decisionId,
          requestId: authorization.requestId,
          traceId: authorization.traceId,
          authoritativeEntityIds: [...new Set(
            facts
              .map((fact) => fact.sourceEntityId)
              .filter((entityId) => graphEntityIds.has(entityId)),
          )],
          facts,
        },
      };
    },

    async retrieveApplicationContext(
      investigationId: string,
      plan: ApplicationContextPlanV1,
      binding: FactualEvidenceSnapshotBinding,
      authorization: FactualEvidenceAuthorization,
    ): Promise<ApplicationContextServiceResponse> {
      const { snapshot, graph } = await loadBoundSnapshot(investigationId, binding);
      const graphEntityIds = new Set(graph.entities.map((entity) => entity.id));
      const participations = projectApplicationParticipation(snapshot)
        .filter((participation) =>
          (plan.sourceApplications.length === 0 ||
            containsIgnoreCase(plan.sourceApplications, participation.sourceApplication)) &&
          (plan.linkedEntityIds.length === 0 ||
            participation.canonicalEntityIds.some((id) => plan.linkedEntityIds.includes(id)))
        )
        .map((participation) => ({
          ...participation,
          authorizationDecisionId: authorization.decisionId,
        }));

      return {
        contractVersion: "1.0",
        evidence: {
          investigationId,
          snapshotRevision: graph.snapshotRevision,
          sourceVersion: String(graph.snapshotRevision),
          ontologyVersion: graph.ontologyVersion,
          authorizationDecisionId: authorization.decisionId,
          requestId: authorization.requestId,
          traceId: authorization.traceId,
          authoritativeEntityIds: [...new Set(
            participations.flatMap((participation) =>
              participation.canonicalEntityIds.filter((entityId) => graphEntityIds.has(entityId)),
            ),
          )],
          participations,
        },
      };
    },
  };
}
