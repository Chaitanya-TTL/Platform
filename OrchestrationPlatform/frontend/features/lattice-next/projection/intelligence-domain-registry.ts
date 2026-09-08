import type { IntelligenceDomainId } from "./intelligence-projection-types";
export type IntelligenceDomainDefinition={id:IntelligenceDomainId;title:string;description:string;entityKinds:readonly string[];relationshipFamilies:readonly string[];priority:number;accent:string};
export const INTELLIGENCE_DOMAINS:readonly IntelligenceDomainDefinition[]=[
{id:"physical-attributes",title:"Physical Attributes",description:"Material and physical definition",entityKinds:["physical-attribute"],relationshipFamilies:["physical-attribute"],priority:1,accent:"teal"},
{id:"product-context",title:"Product Details",description:"Product, version and material details",entityKinds:["product-context","product-detail"],relationshipFamilies:["product-context","product-detail"],priority:2,accent:"indigo"},
{id:"requirements",title:"Requirements",description:"Requirements and specifications",entityKinds:["requirement","requirement-revision"],relationshipFamilies:["requirement"],priority:3,accent:"cyan"},
{id:"changes",title:"Change",description:"Windchill changes and SAP material movements",entityKinds:["change-notice","change-task","material-movement"],relationshipFamilies:["change"],priority:4,accent:"amber"},
{id:"stock",title:"Stock",description:"Current SAP stock and valuation quantities",entityKinds:["stock-metric"],relationshipFamilies:["stock"],priority:5,accent:"teal"},
{id:"accounting",title:"Accounting",description:"Accounting documents, lines and postings",entityKinds:["accounting-document","accounting-line"],relationshipFamilies:["accounting"],priority:6,accent:"blue"},
{id:"history",title:"History",description:"Movement reconstruction and reconciliation",entityKinds:["history-metric"],relationshipFamilies:["history"],priority:7,accent:"rose"},
{id:"structure",title:"Structure",description:"Product structure and occurrences",entityKinds:["part","part-occurrence","assembly","material","material-master"],relationshipFamilies:["structure"],priority:8,accent:"slate"},
{id:"configuration",title:"Configuration",description:"Features and configuration evidence",entityKinds:["configuration-feature","configuration-option"],relationshipFamilies:["configuration"],priority:9,accent:"fuchsia"},
{id:"evidence",title:"Evidence",description:"Supporting evidence",entityKinds:["document","finding"],relationshipFamilies:["evidence"],priority:10,accent:"neutral"},
{id:"cross-source",title:"Cross-source identity",description:"Source representations",entityKinds:["source-representation"],relationshipFamilies:["correspondence"],priority:11,accent:"violet"}
];
export const domainForEntity=(kind:string):IntelligenceDomainId|undefined=>INTELLIGENCE_DOMAINS.find(domain=>domain.entityKinds.includes(kind))?.id;
export const domainForRelationship=(family:string):IntelligenceDomainId|undefined=>INTELLIGENCE_DOMAINS.find(domain=>domain.relationshipFamilies.includes(family))?.id;
