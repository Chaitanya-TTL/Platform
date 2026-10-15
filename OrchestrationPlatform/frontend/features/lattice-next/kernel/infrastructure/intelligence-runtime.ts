import type { LatticeHandoff } from "../contracts/handoff";
import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
import { investigateConfigit } from "./configit-intelligence-client";
import { investigateSap } from "./sap-intelligence-client";
import { investigateWindchill } from "./windchill-intelligence-client";
export type IntelligenceRuntimeResult={source:string;status:"fulfilled"|"rejected";value?:EngineeringIntelligenceInvestigationV1;reason?:string};
export async function runIntelligenceRuntime(handoff:LatticeHandoff,signal?:AbortSignal):Promise<IntelligenceRuntimeResult[]>{const ops:Array<readonly [string,(h:LatticeHandoff,s?:AbortSignal)=>Promise<EngineeringIntelligenceInvestigationV1>]>=[];if(handoff.sources.some(x=>x.source==="windchill"))ops.push(["windchill",investigateWindchill]);if(handoff.sources.some(x=>x.source==="sap"))ops.push(["sap",investigateSap]);if(handoff.sources.some(x=>x.source==="configit"))ops.push(["configit",investigateConfigit]);return Promise.all(ops.map(async([source,execute])=>{try{return{source,status:"fulfilled",value:await execute(handoff,signal)}}catch(error){return{source,status:"rejected",reason:error instanceof Error?error.message:String(error)}}}));}
