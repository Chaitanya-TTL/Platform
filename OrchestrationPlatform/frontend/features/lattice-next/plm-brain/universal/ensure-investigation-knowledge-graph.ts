import "server-only";

import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import { isEngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import { buildKnowledgeGraphSummary, enrichInvestigationWithOntology } from "./ontology-evaluator";
import { loadRelationshipOntology } from "./relationship-ontology-runtime";
import { COPILOT_RETRIEVAL_CONFIG } from "../../copilot/retrieval-config";

export function ensureInvestigationKnowledgeGraph(snapshot: InvestigationSnapshot): InvestigationSnapshot {
  const canonicalSnapshot = snapshot.canonical;
  if (!canonicalSnapshot || !isEngineeringIntelligenceInvestigationV1(canonicalSnapshot.value))
    return snapshot;

  const existingGraph = canonicalSnapshot.value.knowledgeGraph;
  if (
    existingGraph?.schemaVersion === "1.0" &&
    existingGraph.snapshotRevision === canonicalSnapshot.revision &&
    existingGraph.confidenceMetadata.maxTraversalDepth >= Math.max(
      COPILOT_RETRIEVAL_CONFIG.maxTraversalDepth,
      COPILOT_RETRIEVAL_CONFIG.graphTraversalDepth,
    ) &&
    existingGraph.ontology?.ontologyVersion === existingGraph.ontologyVersion &&
    Array.isArray(existingGraph.resolvedRelationships) &&
    Array.isArray(existingGraph.relationshipPaths) &&
    Array.isArray(existingGraph.impactPaths) &&
    Array.isArray(existingGraph.impactChains) &&
    existingGraph.impactChains.every((chain) =>
      Boolean(chain && typeof chain.engineeringExplanation === "string" && typeof chain.confidence === "number"),
    )
  ) {
    if (existingGraph.knowledgeGraphSummary) return snapshot;
    return {
      ...snapshot,
      canonical: {
        ...canonicalSnapshot,
        value: {
          ...canonicalSnapshot.value,
          knowledgeGraph: {
            ...existingGraph,
            knowledgeGraphSummary: buildKnowledgeGraphSummary(existingGraph),
          },
        },
      },
    };
  }

  return {
    ...snapshot,
    canonical: {
      ...canonicalSnapshot,
      value: enrichInvestigationWithOntology(
        canonicalSnapshot.value,
        loadRelationshipOntology(),
        canonicalSnapshot.revision,
        true,
        Math.max(COPILOT_RETRIEVAL_CONFIG.graphTraversalDepth, COPILOT_RETRIEVAL_CONFIG.maxTraversalDepth),
      ),
    },
  };
}
