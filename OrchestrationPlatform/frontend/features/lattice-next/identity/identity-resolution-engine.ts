import type { EngineeringEntity } from "../domain/model";
import type { IdentityCluster } from "./identity-cluster";
import { clusterId,clusterName,scorePair } from "./identity-scoring";
export function resolveIdentityClusters(entities:EngineeringEntity[],roots:string[]):IdentityCluster[]{
 const rootSet=new Set(roots),candidates=entities.filter(x=>rootSet.has(x.id)),seen=new Set<string>(),clusters:IdentityCluster[]=[];
 for(const seed of candidates){if(seen.has(seed.id))continue;const members=[seed],evidence:IdentityCluster["evidence"]=[],scores:number[]=[];
  for(const candidate of candidates){if(candidate.id===seed.id||seen.has(candidate.id)||candidate.source===seed.source)continue;const result=scorePair(seed,candidate,rootSet);if(result.automatic){members.push(candidate);evidence.push(...result.evidence);scores.push(result.score)}}
  members.forEach(x=>seen.add(x.id));if(members.length<2)continue;const score=Math.round(scores.reduce((a,b)=>a+b,0)/Math.max(scores.length,1));const confidence=score>=85?"verified":"deterministic";
  clusters.push({clusterId:clusterId(members),displayName:clusterName(members),members:members.map(x=>({entityId:x.id,source:x.source,nativeId:x.provenance.nativeId,name:x.name,root:true})),evidence,conflicts:[],score,confidence,reviewRequired:false});
 }
 return clusters;
}


