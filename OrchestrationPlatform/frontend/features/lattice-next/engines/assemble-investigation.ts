import type { LatticeHandoff } from "../contracts/handoff";
import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
import type { InvestigationGraph } from "../domain/model";
import { buildIntelligenceInvestigation } from "./build-intelligence-investigation";
import { legacyHandoffToIntelligence } from "./legacy-handoff-to-intelligence";
export type InvestigationInput={kind:"legacy-handoff";value:LatticeHandoff}|{kind:"intelligence-v1";value:EngineeringIntelligenceInvestigationV1};
export function assembleInvestigation(input:InvestigationInput):InvestigationGraph{return buildIntelligenceInvestigation(input.kind==="legacy-handoff"?legacyHandoffToIntelligence(input.value):input.value);}
