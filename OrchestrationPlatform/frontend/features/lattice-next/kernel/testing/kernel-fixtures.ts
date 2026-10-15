import { asInvestigationId } from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { SourceSelection } from "../contracts/source-operation";
import { assessCompleteness } from "../application/completeness-policy";

export const threeSourceSelections: readonly SourceSelection[] = [
  { source: "windchill", nativeId: "wc-1", displayName: "Steering" },
  { source: "sap", nativeId: "31", displayName: "Stearing" },
  { source: "configit", nativeId: "cfg-1", displayName: "Steering" },
];

export function draftSnapshot(
  selections: readonly SourceSelection[] = threeSourceSelections,
): InvestigationSnapshot {
  return {
    identity: {
      investigationId: asInvestigationId("investigation-fixture"),
      revision: 1,
      executionEpoch: 1,
    },
    lifecycle: "draft",
    subjectLabel: "Steering",
    query: "Steering",
    selections,
    executions: {},
    acceptedEvidenceIds: [],
    completeness: assessCompleteness(selections.map((item) => item.source), {}),
    warnings: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
