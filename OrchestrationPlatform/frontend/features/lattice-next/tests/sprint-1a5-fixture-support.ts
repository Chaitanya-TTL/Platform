import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import { asInvestigationId } from "../kernel/contracts/investigation-identity";
import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
import { enrichInvestigationWithValidatedRelationships } from "../plm-brain/enrichment/enrich-investigation-with-validated-relationships";
import { enrichInvestigationWithOntology } from "../plm-brain/universal/ontology-evaluator";
import { parseRelationshipOntology } from "../plm-brain/universal/relationship-ontology-parser";
import { investigation, mappings, now } from "./plm-brain-validated-fixture";

const relationshipsDocument = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/relationships.md"),
  "utf8",
);
export const ontology = parseRelationshipOntology(relationshipsDocument);

export function buildSprint1A5GoldenInvestigation(): EngineeringIntelligenceInvestigationV1 {
  const governed = enrichInvestigationWithValidatedRelationships(investigation, { mappings, now: () => now });
  return enrichInvestigationWithOntology(governed, ontology, 1);
}

export function buildSprint1A5Snapshot(
  canonical: EngineeringIntelligenceInvestigationV1,
): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  return {
    identity: {
      investigationId: asInvestigationId(canonical.investigationId),
      revision: 1,
      executionEpoch: 0,
    },
    lifecycle: "ready",
    subjectLabel: canonical.subject.displayName,
    query: "Validated Sprint 1A.5 golden fixture",
    selections: [],
    executions: {},
    acceptedEvidenceIds: canonical.evidence.map((item) => item.id),
    completeness: {
      overall: "complete",
      requestedSources: ["windchill", "sap", "configit", "codebeamer"],
      successfulSources: ["windchill", "sap", "configit", "codebeamer"],
      partialSources: [],
      failedSources: [],
      pendingSources: [],
      limitations: [],
    },
    canonical: { revision: 1, publishedAt: now, value: canonical },
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

export { relationshipsDocument };
