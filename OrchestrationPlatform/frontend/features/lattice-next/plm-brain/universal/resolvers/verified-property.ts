import type {IntelligenceEntity,IntelligenceProperty} from "../../../contracts/intelligence-v1";
type Application="windchill"|"sap"|"configit"|"codebeamer";
const allowedPaths:Record<Application,ReadonlySet<string>>={
	windchill:new Set(["esiMaterialNumber","enterpriseIdentity","partNumber","productContextId","windchillResourceUri"]),
	sap:new Set(["materialNumber","enterpriseIdentity","productContextId"]),
	configit:new Set(["plmComponentReferences","productContextId","sapMaterialReferences","materialMembership","productModelCode"]),
	codebeamer:new Set(["oslcTraceLinkTargetUris","externalReferences","configitModelCode","productContextId"]),
};
const property=(entity:IntelligenceEntity,application:Application,key:string):IntelligenceProperty|undefined=>entity.provenance.source===application&&allowedPaths[application].has(key)?entity.properties[key]:undefined;
export const scalar=(entity:IntelligenceEntity,application:Application,key:string):string|undefined=>{const value=property(entity,application,key);if(!value)return;const resolved=value.text??value.number??value.reference;const normalized=resolved===undefined?"":String(resolved).trim();return normalized||undefined};
export const list=(entity:IntelligenceEntity,application:Application,key:string):string[]=>{const value=property(entity,application,key);if(!value)return[];if(value.type==="list")return(value.items??[]).map(item=>String(item).trim()).filter(Boolean);const scalarValue=value.text??value.number??value.reference;return scalarValue===undefined?[]:[String(scalarValue).trim()].filter(Boolean)};
export const verifiedIdentityProperties=(entity:IntelligenceEntity,application:Application):Record<string,string|string[]>=>{const result:Record<string,string|string[]>={};for(const key of allowedPaths[application]){const value=property(entity,application,key);if(!value)continue;if(value.type==="list"){const items=(value.items??[]).map(item=>String(item).trim()).filter(Boolean);if(items.length)result[key]=items;continue}const scalarValue=value.text??value.number??value.reference;if(scalarValue!==undefined&&String(scalarValue).trim())result[key]=String(scalarValue).trim()}return result};
export const exact=(a?:string,b?:string)=>!!a&&!!b&&a===b;
