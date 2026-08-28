import type { EngineeringEntity } from "../domain/model";
import type { IdentityCluster,IdentityConfidence,IdentityEvidence } from "./identity-cluster";
const normalized=(value:unknown)=>String(value??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const identifier=(entity:EngineeringEntity)=>String(entity.attributes["Item ID"]??entity.attributes["Part Number"]??entity.attributes.Number??entity.provenance.nativeId??"");
const numericCore=(value:string)=>normalized(value).match(/[0-9]{3,}/)?.[0]??"";
export function scorePair(left:EngineeringEntity,right:EngineeringEntity,rootIds:ReadonlySet<string>){
 const evidence:IdentityEvidence[]=[];let score=0;
 const leftId=identifier(left),rightId=identifier(right),a=normalized(leftId),b=normalized(rightId),an=numericCore(leftId),bn=numericCore(rightId);
 if(a&&b&&a===b){score+=65;evidence.push({kind:"exact-id",value:leftId,weight:65,source:left.source,entityId:left.id})}
 else if(an&&bn&&an===bn){score+=52;evidence.push({kind:"normalized-id",value:an,weight:52,source:left.source,entityId:left.id})}
 const ln=normalized(left.name).replace(/[0-9]+$/,""),rn=normalized(right.name).replace(/[0-9]+$/,"");
 if(ln&&rn&&ln===rn){score+=24;evidence.push({kind:"name",value:left.name,weight:24,source:left.source,entityId:left.id})}
 if(rootIds.has(left.id)&&rootIds.has(right.id)){score+=12;evidence.push({kind:"root-context",value:"selected source roots",weight:12,source:left.source,entityId:left.id})}
 const confidence:IdentityConfidence=score>=85?"verified":score>=65?"deterministic":score>=45?"probable":score>0?"ambiguous":"unresolved";
 return{score:Math.min(score,100),confidence,evidence,automatic:score>=65};
}
export function clusterName(members:EngineeringEntity[]){const clean=members.map(x=>x.name.replace(/^[0-9/_;:.A-Z-]+-?/i,"").replace(/_[0-9]+$/,"_").replace(/_/g," ").trim()).filter(Boolean);return clean.sort((a,b)=>a.length-b.length)[0]??members[0]?.name??"Unified product"}
export function clusterId(members:EngineeringEntity[]){return`identity:${members.map(x=>x.id).sort().join("|")}`}
export function confidenceLabel(value:IdentityCluster["confidence"]){return value[0].toUpperCase()+value.slice(1)}


