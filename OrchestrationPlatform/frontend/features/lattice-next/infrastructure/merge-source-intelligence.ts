import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity, IntelligenceRelationship } from "../contracts/intelligence-v1";
import { enrichInvestigationWithValidatedRelationships } from "../plm-brain/enrichment/enrich-investigation-with-validated-relationships";
const dedupe=<T extends{id:string}>(items:T[])=>[...new Map(items.map(item=>[item.id,item])).values()];
const stableKey=(values:readonly string[]):string=>[...new Set(values)].sort().join("|").replace(/[^a-zA-Z0-9:_-]+/g,"-").slice(0,180);
const comparableId=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
const subjectEntity=(part:EngineeringIntelligenceInvestigationV1):IntelligenceEntity=>({id:part.subject.id,kind:"source-representation",displayName:part.subject.displayName,identityQuality:"native",assertion:"fact",properties:{preferredProductId:{type:"text",text:part.subject.preferredProductId??""},sourceRole:{type:"text",text:"participating-source-subject"}},provenance:part.subject.provenance,temporal:part.subject.temporal});
export function mergeSourceIntelligence(parts: EngineeringIntelligenceInvestigationV1[]): EngineeringIntelligenceInvestigationV1 {
 if(!parts.length) throw new Error("No source intelligence was returned."); if(parts.length===1) return parts[0];
 const ordered=[...parts].sort((a,b)=>(a.sources[0]?.source??"").localeCompare(b.sources[0]?.source??"")||a.investigationId.localeCompare(b.investigationId)),base=ordered[0];
 const originalSubjects=ordered.map(subjectEntity);
 const entities=dedupe([...originalSubjects,...ordered.flatMap(item=>item.entities)]);
 const canonicalByComparable=new Map<string,string>();for(const entity of entities){const key=comparableId(entity.id);if(!canonicalByComparable.has(key))canonicalByComparable.set(key,entity.id)}
 const canonicalEndpoint=(id:string)=>canonicalByComparable.get(comparableId(id))??id;
 const normalizeRelationship=(relationship:IntelligenceRelationship):IntelligenceRelationship=>({...relationship,sourceEntityId:canonicalEndpoint(relationship.sourceEntityId),targetEntityId:canonicalEndpoint(relationship.targetEntityId)});
 const nativeRelationships=dedupe(ordered.flatMap(item=>item.relationships).filter(relationship=>!(relationship.kind==="represented-by"&&relationship.sourceEntityId.startsWith("investigation-subject:"))).map(normalizeRelationship));
 const evidence=dedupe(ordered.flatMap(item=>item.evidence)),findings=dedupe(ordered.flatMap(item=>item.findings).map(finding=>({...finding,subjectEntityIds:finding.subjectEntityIds.map(canonicalEndpoint)}))),sources=[...new Map(ordered.flatMap(item=>item.sources).map(item=>({...item,entityId:canonicalEndpoint(item.entityId)})).map(item=>[`${item.source}:${item.entityId}`,item])).values()];
 const candidateIds=[...new Set(ordered.flatMap(item=>item.subject.candidateIds).map(canonicalEndpoint))];
 const commonSubject=ordered.every(item=>item.subject.id===base.subject.id);
 const sourceNames=[...new Set(sources.map(item=>item.source))].sort();
 const subjectId=commonSubject?base.subject.id:`investigation-subject:federated:${stableKey(sourceNames)}:${stableKey(candidateIds)}`;
 const displayName=commonSubject?base.subject.displayName:ordered.map(item=>item.subject.displayName).filter((value,index,all)=>all.indexOf(value)===index).join(" + ");
 const federationProvenance={...base.subject.provenance,nativeId:undefined,artifactReference:subjectId,provider:"lattice-canonical-merge",authority:"backend-derived" as const};
 const identityClusters=dedupe(ordered.flatMap(item=>item.identityClusters).map(cluster=>({...cluster,entityIds:cluster.entityIds.map(canonicalEndpoint),preferredEntityId:cluster.preferredEntityId?canonicalEndpoint(cluster.preferredEntityId):undefined})));
 const provisional:EngineeringIntelligenceInvestigationV1={...base,investigationId:`federated-${stableKey(ordered.map(item=>item.investigationId))}`,subject:{...base.subject,id:subjectId,displayName,candidateIds,reasons:[...new Set(ordered.flatMap(item=>item.subject.reasons))],provenance:federationProvenance},entities,relationships:nativeRelationships,evidence,findings,sources,identityClusters,temporal:{...base.temporal,assembledAt:new Date().toISOString()},summary:{entityCount:entities.length,relationshipCount:nativeRelationships.length,evidenceCount:evidence.length,findingCount:findings.length,availableSourceCount:sources.filter(item=>item.status==="available").length,partialSourceCount:sources.filter(item=>item.status!=="available").length,status:sources.every(item=>item.status==="available")?"success":"partial-success"}};
 return enrichInvestigationWithValidatedRelationships(provisional);
}
