import type { IntelligenceDomainId } from "./intelligence-projection-types";
export type IntelligenceDomainDefinition={id:IntelligenceDomainId;title:string;description:string;entityKinds:readonly string[];relationshipFamilies:readonly string[];priority:number;accent:string};
export const INTELLIGENCE_DOMAINS:readonly IntelligenceDomainDefinition[]=[
{id:"physical-attributes",title:"Physical Attributes",description:"Material and physical definition",entityKinds:["physical-attribute"],relationshipFamilies:["physical-attribute"],priority:1,accent:"teal"},
{id:"product-context",title:"Product Context",description:"Version and lifecycle context",entityKinds:["product-context"],relationshipFamilies:["product-context"],priority:2,accent:"indigo"},
{id:"requirements",title:"Requirements",description:"Requirements and specifications",entityKinds:["requirement","requirement-revision"],relationshipFamilies:["requirement"],priority:3,accent:"cyan"},
{id:"changes",title:"Changes",description:"Revisions and change impact",entityKinds:["change-notice","change-task"],relationshipFamilies:["change"],priority:4,accent:"amber"},
{id:"structure",title:"Structure",description:"Product structure and occurrences",entityKinds:["part","part-occurrence","assembly","material","material-master"],relationshipFamilies:["structure"],priority:5,accent:"slate"},
{id:"configuration",title:"Configuration",description:"Features and configuration evidence",entityKinds:["configuration-feature","configuration-option"],relationshipFamilies:["configuration"],priority:6,accent:"fuchsia"},
{id:"operations",title:"Operations",description:"Production and operational dependencies",entityKinds:["production-order","material-movement"],relationshipFamilies:["operation"],priority:7,accent:"emerald"},
{id:"cost-inventory",title:"Cost and inventory",description:"Stock, plant and valuation context",entityKinds:["plant","storage-location","accounting-document","stock-position","valuation-context"],relationshipFamilies:["cost-and-inventory"],priority:8,accent:"teal"},
{id:"evidence",title:"Evidence",description:"Supporting evidence",entityKinds:["document","finding"],relationshipFamilies:["evidence"],priority:9,accent:"neutral"},
{id:"cross-source",title:"Cross-source identity",description:"Source representations",entityKinds:["source-representation"],relationshipFamilies:["correspondence"],priority:10,accent:"violet"}
];
export const domainForEntity=(kind:string):IntelligenceDomainId|undefined=>INTELLIGENCE_DOMAINS.find(domain=>domain.entityKinds.includes(kind))?.id;
export const domainForRelationship=(family:string):IntelligenceDomainId|undefined=>INTELLIGENCE_DOMAINS.find(domain=>domain.relationshipFamilies.includes(family))?.id;
