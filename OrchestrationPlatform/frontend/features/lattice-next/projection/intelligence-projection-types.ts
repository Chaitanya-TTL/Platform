import type { RelationshipProjection } from "../contracts/projection";
export type IntelligenceDomainId="physical-attributes"|"product-context"|"requirements"|"changes"|"stock"|"accounting"|"history"|"structure"|"configuration"|"evidence"|"cross-source";
export type DomainExpansionLevel="collapsed"|"summary"|"expanded"|"deep";
export type IntelligenceDomainState={domainId:IntelligenceDomainId;level:DomainExpansionLevel};
export type IntelligenceProjectionOptions={expanded:ReadonlySet<string>;selectedId?:string;maxInitialFindings?:number;maxSummaryEntities?:number;maxExpandedEntities?:number};
export type IntelligenceProjection=RelationshipProjection&{domainIds:IntelligenceDomainId[];deferredCounts:Readonly<Record<string,number>>};
