import { isEngineeringIntelligenceInvestigationV1, type EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";

export type FactualServingShadowSelectionDiagnosticV1 = {
  source: string;
  nativeId: string;
  matchingEntityIds: readonly string[];
};

export type FactualServingShadowContextV1 =
  | { status: "canonical-unavailable"; selectionCount: number }
  | { status: "invalid-canonical"; selectionCount: number }
  | {
      status: "ready";
      investigation: EngineeringIntelligenceInvestigationV1;
      entityId?: string;
      subjectId: string;
      selectionCount: number;
      selectedReferences: readonly FactualServingShadowSelectionDiagnosticV1[];
      matchingEntityIds: readonly string[];
      entityResolution: "resolved" | "no-match" | "ambiguous";
    };

const selectionDiagnostics = (
  snapshot: InvestigationSnapshot,
  investigation: EngineeringIntelligenceInvestigationV1,
): readonly FactualServingShadowSelectionDiagnosticV1[] => snapshot.selections.map((selection) => ({
  source: selection.source,
  nativeId: selection.nativeId,
  matchingEntityIds: investigation.entities
    .filter((entity) => entity.provenance.source === selection.source && entity.provenance.nativeId === selection.nativeId)
    .map((entity) => entity.id)
    .sort(),
}));

export function resolveFactualServingShadowContext(
  snapshot: InvestigationSnapshot,
): FactualServingShadowContextV1 {
  const selectionCount = snapshot.selections.length;
  if (!snapshot.canonical) return { status: "canonical-unavailable", selectionCount };
  if (!isEngineeringIntelligenceInvestigationV1(snapshot.canonical.value)) return { status: "invalid-canonical", selectionCount };
  const investigation = snapshot.canonical.value;
  const selectedReferences = selectionDiagnostics(snapshot, investigation);
  const matchingEntityIds = [...new Set(selectedReferences.flatMap((selection) => selection.matchingEntityIds))].sort();
  const entityResolution = matchingEntityIds.length === 1 ? "resolved" : matchingEntityIds.length === 0 ? "no-match" : "ambiguous";
  return {
    status: "ready",
    investigation,
    ...(entityResolution === "resolved" ? { entityId: matchingEntityIds[0] } : {}),
    subjectId: investigation.subject.id,
    selectionCount,
    selectedReferences,
    matchingEntityIds,
    entityResolution,
  };
}
