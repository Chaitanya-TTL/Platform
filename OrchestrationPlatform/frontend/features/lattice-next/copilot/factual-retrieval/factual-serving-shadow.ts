import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import { composeFactualResponse, type FactualResponseCompositionV1 } from "./factual-response-composer";
import { orchestrateFactualServing, type FactualServingOrchestrationResultV1 } from "./factual-serving-orchestrator";
import { resolveRequestAwareEntity, type RequestAwareSelectionV1 } from "./request-aware-entity-resolver";

export type FactualServingShadowInputV1 = {
  enabled: boolean;
  message: string;
  investigationId: string;
  investigation: EngineeringIntelligenceInvestigationV1;
  entityId?: string;
  subjectId?: string;
  revision?: string;
  version?: string;
  asOf?: string;
  dimensions?: readonly { dimensionId: string; exactValue: unknown }[];
  selections?: readonly RequestAwareSelectionV1[];
};

export type FactualServingShadowResultV1 =
  | { status: "disabled" }
  | {
      status: "observed";
      routeStatus: FactualServingOrchestrationResultV1["status"];
      decisionStatus?: string;
      compositionStatus: FactualResponseCompositionV1["status"];
      wouldServe: boolean;
      fieldId?: string;
      sourceApplication?: string;
      entityResolution?: string;
      matchingEntityIds?: readonly string[];
      nativeRecordKinds?: readonly string[];
      allowedCanonicalKinds?: readonly string[];
      candidateEntityShapes?: readonly {
        entityId: string;
        entityKind?: string;
        nativeRecordKinds: readonly string[];
        metadataFields: readonly string[];
        compatible: boolean;
        rejectionReason?: string;
      }[];
    }
  | { status: "failed"; errorName: string; message: string };

export function runFactualServingShadow(input: FactualServingShadowInputV1): FactualServingShadowResultV1 {
  if (!input.enabled) return { status: "disabled" };
  try {
    const entityResolution = resolveRequestAwareEntity({
      message: input.message,
      investigationId: input.investigationId,
      investigation: input.investigation,
      selections: input.selections ?? [],
      revision: input.revision,
      version: input.version,
      dimensions: input.dimensions,
    });
    const orchestration = orchestrateFactualServing({
      ...input,
      entityId: entityResolution.status === "resolved" ? entityResolution.entityId : undefined,
    });
    const composition = composeFactualResponse(orchestration);
    return {
      status: "observed",
      routeStatus: orchestration.status,
      ...(orchestration.status === "direct-fact-request" ? { decisionStatus: orchestration.decision.status } : {}),
      compositionStatus: composition.status,
      wouldServe: composition.status === "ready-to-serve",
      entityResolution: entityResolution.status,
      ...("matchingEntityIds" in entityResolution ? { matchingEntityIds: entityResolution.matchingEntityIds } : {}),
      ...("nativeRecordKinds" in entityResolution ? { nativeRecordKinds: entityResolution.nativeRecordKinds } : {}),
      ...("allowedCanonicalKinds" in entityResolution ? { allowedCanonicalKinds: entityResolution.allowedCanonicalKinds } : {}),
      ...("candidateEntityShapes" in entityResolution ? { candidateEntityShapes: entityResolution.candidateEntityShapes } : {}),
      ...(composition.status === "ready-to-serve" ? { fieldId: composition.fieldId, sourceApplication: composition.sourceApplication } : {}),
    };
  } catch (error) {
    return {
      status: "failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown factual-serving shadow error.",
    };
  }
}
