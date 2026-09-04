import type { DomainExpansionLevel } from "./intelligence-projection-types";
export type VisibilityBudget={entities:number;includeEvidence:boolean;includeSecondary:boolean};
export function domainLevel(id:string,expanded:ReadonlySet<string>):DomainExpansionLevel{return expanded.has(`${id}:deep`)?"deep":expanded.has(id)?"expanded":"summary";}
export function visibilityBudget(level:DomainExpansionLevel,total:number):VisibilityBudget{if(level==="deep")return{entities:total,includeEvidence:true,includeSecondary:true};if(level==="expanded")return{entities:Math.min(total,24),includeEvidence:false,includeSecondary:true};return{entities:0,includeEvidence:false,includeSecondary:false};}
export function graphScalePolicy(nodes:number,relationships:number){const density=nodes?relationships/nodes:0;return nodes>500||density>8?{labels:false,maxPerDomain:12,deferEvidence:true}:nodes>150||density>4?{labels:true,maxPerDomain:24,deferEvidence:true}:{labels:true,maxPerDomain:60,deferEvidence:false};}
