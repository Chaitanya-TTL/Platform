import { describe, expect, it } from "vitest";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity } from "../contracts/intelligence-v1";
import { buildValidatedPLMBrain, GOVERNED_PLM_MAPPINGS_V1 } from "../plm-brain";

const now="2026-10-21T09:41:11.266Z";
const temporal={capturedAt:now,assembledAt:now,freshness:"current" as const};
const entity=(id:string,source:"windchill"|"sap"|"configit"|"codebeamer",kind:string,nativeId:string,properties:Record<string,{type:string;text?:string;number?:number}>={}):IntelligenceEntity=>({id,kind,displayName:id,identityQuality:"native",assertion:"fact",properties,provenance:{source,provider:`${source}-provider`,nativeId,observedAt:now,authority:"source-authoritative"},temporal});
const entities=[
  entity("subject:steering","windchill","source-representation","OR:wt.part.WTPart:1717121",{preferredProductId:{type:"text",text:"Steering"}}),
  entity("sap:material:mat7893","sap","source-representation","MAT7893",{preferredProductId:{type:"text",text:"MAT7893"}}),
  entity("configit:subject:305","configit","source-representation","305",{preferredProductId:{type:"text",text:"305"}}),
  ...["1190","1191","1192","1194"].map(id=>entity(`codebeamer:item:${id}`,"codebeamer","requirement",id,{itemId:{type:"text",text:id},projectId:{type:"number",number:9},trackerId:{type:"number",number:9734}})),
];
const input:EngineeringIntelligenceInvestigationV1={contractVersion:"1.0",investigationId:"steering-pilot",subject:{id:"subject",displayName:"Steering",candidateIds:entities.map(item=>item.id),confidence:"verified",reasons:["pilot"],provenance:{provider:"fixture",observedAt:now,authority:"backend-derived"},temporal},entities,relationships:[],evidence:[],findings:[],sources:entities.map(item=>({entityId:item.id,source:item.provenance.source!,status:"available",provenance:item.provenance})),identityClusters:[],temporal,summary:{entityCount:entities.length,relationshipCount:0,evidenceCount:0,findingCount:0,availableSourceCount:4,partialSourceCount:0,status:"success"}};

describe("domain-approved Steering pilot mappings",()=>{
  it("extracts exactly six confirmed relationships",()=>{const result=buildValidatedPLMBrain(input,GOVERNED_PLM_MAPPINGS_V1,now);expect(result.relationships).toHaveLength(6);expect(result.evidence).toHaveLength(6);expect(result.validation).toEqual({status:"valid",warnings:[]});expect(result.relationships.filter(item=>item.type==="operationally-represented-as")).toHaveLength(1);expect(result.relationships.filter(item=>item.type==="configured-by")).toHaveLength(1);expect(result.relationships.filter(item=>item.type==="specified-by")).toHaveLength(4)});
  it("records manager-approved governance evidence",()=>{for(const item of buildValidatedPLMBrain(input,GOVERNED_PLM_MAPPINGS_V1,now).evidence){expect(item.mappingBasis).toBe("domain-owner-confirmed");expect(item.mappingReference).toBe("PLM Brain pilot relationship review 2026-10-21");expect(item.verifiedBy).toBe("Lattice pilot domain approver")}});
  it("rejects the SAP edge when the runtime material changes",()=>{const changed={...input,entities:input.entities.map(item=>item.id==="sap:material:mat7893"?{...item,properties:{preferredProductId:{type:"text",text:"MAT9999"}}}:item)};const result=buildValidatedPLMBrain(changed,GOVERNED_PLM_MAPPINGS_V1,now);expect(result.relationships).toHaveLength(5);expect(result.validation.warnings).toContain("missing-target-endpoint:MAP-WC-SAP-STEERING-V1")});
});
