import { describe, expect, it } from "vitest";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
import { investigation as canonicalFixture, now } from "./plm-brain-validated-fixture";
import { buildInvestigationReviewCues } from "../copilot/review-cues";
import type { InvestigationRefreshResult } from "../kernel/infrastructure/current-investigation-runtime";

function snapshot(canonical: EngineeringIntelligenceInvestigationV1 = canonicalFixture): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  return {
    identity: { investigationId: "review-cue-test" as InvestigationSnapshot["identity"]["investigationId"], revision: 5, executionEpoch: 2 },
    lifecycle: "ready",
    subjectLabel: "Validated fixture",
    query: "Validated fixture",
    selections: [
      { source: "windchill", nativeId: "OR:wt.part.WTPart:9001", displayName: "Part" },
      { source: "sap", nativeId: "MAT-200", displayName: "Material" },
    ],
    executions: {},
    acceptedEvidenceIds: [],
    completeness: { overall: "complete", requestedSources: ["windchill", "sap"], successfulSources: ["windchill", "sap"], partialSources: [], failedSources: [], pendingSources: [], limitations: [] },
    canonical: { revision: 5, publishedAt: now, value: canonical },
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("deterministic investigation review cues", () => {
  it("produces cues for partial coverage, unresolved relations, stale values, conflicts, and refresh deltas", () => {
    const base = canonicalFixture;
    const conflictEntities = base.entities.map((entity) => entity.id === "wc:part"
      ? { ...entity, properties: { ...entity.properties, sharedRevision: { type: "text", text: "A" } } }
      : entity.id === "sap:material"
        ? { ...entity, properties: { ...entity.properties, sharedRevision: { type: "text", text: "B" } } }
        : entity);
    const canonical = {
      ...base,
      entities: conflictEntities,
      universalRelationshipEvaluations: [{
        ruleId: "WC_PART_TO_SAP_MATERIAL",
        relationshipType: "operationally-represented-as",
        status: "unresolved",
        sourceApplication: "windchill",
        sourceKinds: ["part"],
        targetApplication: "sap",
        targetKinds: ["material-master"],
        sourceCandidates: [],
        targetCandidates: [],
        compatibleSourceCandidates: [],
        compatibleTargetCandidates: [],
        sourceCandidateCount: 0,
        targetCandidateCount: 0,
        sourceCandidatesTruncated: false,
        targetCandidatesTruncated: false,
        observedSourceKinds: [],
        observedTargetKinds: [],
        evidenceIds: [],
        reasonCode: "linkage-evidence-not-found",
        reason: "No approved source linkage evidence was found.",
        technicalContext: { integrationName: "Fixture", protocol: "REST", direction: "read", sourceObjectType: "Part", targetObjectType: "Material", documentation: [] },
        evaluatedAt: now,
      }],
    } as EngineeringIntelligenceInvestigationV1;
    const active = snapshot(canonical);
    const stale = {
      ...active,
      lifecycle: "partial" as const,
      completeness: { ...active.completeness, overall: "partial" as const, successfulSources: ["windchill"], failedSources: ["sap"] },
      executions: {
        sap: {
          identity: { ...active.identity, executionId: "exec" as never, correlationId: "corr" as never, source: "sap", operation: "gather-intelligence" as const, attempt: 1 },
          status: "failed" as const,
          freshness: "stale" as const,
          warnings: [],
        },
      },
    };
    const refresh: InvestigationRefreshResult = {
      investigationId: "review-cue-test",
      previousRevision: 4,
      revision: 5,
      lifecycle: "partial",
      sourceStatuses: [],
      changedEntityIds: ["wc:part"],
      addedEntityIds: ["sap:new"],
      removedEntityIds: ["old:part"],
    };

    const cues = buildInvestigationReviewCues(stale, refresh);

    expect(cues.map((cue) => cue.id)).toEqual(expect.arrayContaining([
      "coverage:sap",
      "unresolved:WC_PART_TO_SAP_MATERIAL",
      "stale:sap",
      "conflicts:sharedrevision",
      "refresh:5",
    ]));
    expect(cues.find((cue) => cue.id === "refresh:5")?.citationEntityIds).toEqual(["sap:new", "wc:part"]);
  });

  it("returns no cues when no corresponding evidence signal exists", () => {
    expect(buildInvestigationReviewCues(snapshot())).toEqual([]);
  });
});
