import type { LatticeHandoff } from "../contracts/handoff";
import {
  isEngineeringIntelligenceInvestigationV1,
  type EngineeringIntelligenceInvestigationV1,
} from "../contracts/intelligence-v1";
export async function investigateSap(
  handoff: LatticeHandoff,
  signal?: AbortSignal,
): Promise<EngineeringIntelligenceInvestigationV1> {
  const response = await fetch("/api/engineering/intelligence/sap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handoff }),
    signal,
  });
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(value?.message ?? "SAP intelligence failed.");
  if (!isEngineeringIntelligenceInvestigationV1(value))
    throw new Error("SAP intelligence returned an invalid canonical contract.");
  return value;
}
