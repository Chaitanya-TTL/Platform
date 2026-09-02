import type { IntelligenceDomainId } from "./intelligence-projection-types";
export type IntelligenceDomainDefinition={id:IntelligenceDomainId;title:string;description:string;entityKinds:readonly string[];relationshipFamilies:readonly string[];priority:number;accent:string};
export const INTELLIGENCE_DOMAINS:readonly IntelligenceDomainDefinition[]=[
{id:"structure",title:"Structure",description:"Product structure and occurrences",entityKinds:["part","part-occurrence","assembly","material"],relationshipFamilies:["structure"],priority:1,accent:"slate"},
{id:"requirements",title:"Requirements",description:"Requirements, revisions and coverage",entityKinds:["requirement","requirement-revision"],relationshipFamilies:["requirement"],priority:2,accent:"cyan"},
{id:"changes",title:"Changes",description:"Change records, revisions and impact",entityKinds:["change-notice","change-task"],relationshipFamilies:["change"],priority:3,accent:"amber"},
{id:"configuration",title:"Configuration",description:"Features, options and configuration evidence",entityKinds:["configuration-feature","configuration-option"],relationshipFamilies:["configuration"],priority:4,accent:"fuchsia"},
{id:"operations",title:"Operations",description:"Production and operational dependencies",entityKinds:["production-order"],relationshipFamilies:["operation"],priority:5,accent:"emerald"},
{id:"cost-inventory",title:"Cost and inventory",description:"Stock, plant and valuation context",entityKinds:["plant","storage-location","accounting-document"],relationshipFamilies:["cost-and-inventory"],priority:6,accent:"teal"},
{id:"evidence",title:"Evidence",description:"Supporting evidence and explainable findings",entityKinds:["document","finding"],relationshipFamilies:["evidence"],priority:7,accent:"neutral"},
{id:"cross-source",title:"Cross-source identity",description:"Source representations and identity confidence",entityKinds:["source-representation"],relationshipFamilies:["correspondence"],priority:8,accent:"violet"},
] as const;
export const domainDefinition=(id:IntelligenceDomainId)=>INTELLIGENCE_DOMAINS.find(domain=>domain.id===id)!;
export function domainForEntity(kind:string):IntelligenceDomainId|undefined{return INTELLIGENCE_DOMAINS.find(domain=>domain.entityKinds.includes(kind))?.id;}
export function domainForRelationship(family?:string):IntelligenceDomainId|undefined{return INTELLIGENCE_DOMAINS.find(domain=>family&&domain.relationshipFamilies.includes(family))?.id;}
