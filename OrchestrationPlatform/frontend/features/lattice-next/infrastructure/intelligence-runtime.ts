import type { LatticeHandoff } from "../contracts/handoff";
import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
import { legacyHandoffToIntelligence } from "../engines/legacy-handoff-to-intelligence";
import { assembleCanonicalInvestigation } from "./intelligence-api-client";

export type IntelligenceRuntimeResolution =
  | {
      mode: "canonical";
      value: EngineeringIntelligenceInvestigationV1;
      warning?: undefined;
    }
  | {
      mode: "legacy-compatibility";
      value: EngineeringIntelligenceInvestigationV1;
      warning: string;
    };

export async function resolveIntelligenceRuntime(
  handoff: LatticeHandoff,
  signal?: AbortSignal,
): Promise<IntelligenceRuntimeResolution> {
  try {
    const value = await assembleCanonicalInvestigation(handoff, signal);
    return { mode: "canonical", value };
  } catch {
    return {
      mode: "legacy-compatibility",
      value: legacyHandoffToIntelligence(handoff),
      warning: "The canonical intelligence service is unavailable; showing clearly labelled legacy compatibility data.",
    };
  }
}