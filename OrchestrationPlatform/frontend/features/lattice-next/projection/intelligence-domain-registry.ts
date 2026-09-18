import type { IntelligenceDomainId } from "./intelligence-projection-types";
export type IntelligenceDomainDefinition={id:IntelligenceDomainId;title:string;description:string;entityKinds:readonly string[];relationshipFamilies:readonly string[];priority:number;accent:string};
export const INTELLIGENCE_DOMAINS:readonly IntelligenceDomainDefinition[]=[
{id:"physical-attributes",title:"Physical Attributes",description:"Material and physical definition",entityKinds:["physical-attribute"],relationshipFamilies:["physical-attribute"],priority:1,accent:"teal"},
{id:"product-context",title:"Part Details",description:"Product, version and material details",entityKinds:["product-context","product-detail"],relationshipFamilies:["product-context","product-detail"],priority:2,accent:"indigo"},
{id:"requirements",title:"Requirements",description:"Requirements and specifications",entityKinds:["requirement","requirement-revision"],relationshipFamilies:["requirement"],priority:3,accent:"cyan"},
{id:"changes",title:"Change",description:"Windchill changes and SAP material movements",entityKinds:["change-notice","change-task","material-movement"],relationshipFamilies:["change"],priority:4,accent:"amber"},
{id:"stock",title:"Stock",description:"Current SAP stock and valuation quantities",entityKinds:["stock-metric"],relationshipFamilies:["stock"],priority:5,accent:"teal"},
{id:"accounting",title:"Cost",description:"Accounting documents, lines and postings",entityKinds:["accounting-document","accounting-line"],relationshipFamilies:["accounting"],priority:6,accent:"blue"},
{id:"history",title:"History",description:"Movement reconstruction and reconciliation",entityKinds:["history-metric"],relationshipFamilies:["history"],priority:7,accent:"rose"},
{id:"configuration",title:"Configuration",description:"Families and configuration features",entityKinds:["configuration-family","configuration-feature","configuration-option"],relationshipFamilies:["configuration"],priority:8,accent:"fuchsia"},
{id:"rules",title:"Rules",description:"Authoritative configuration rules",entityKinds:["configuration-rule","configuration-rule-field"],relationshipFamilies:["rules"],priority:9,accent:"pink"},
{id:"localization",title:"Localization",description:"Languages and translated configuration content",entityKinds:["localization-language","localization-translation"],relationshipFamilies:["localization"],priority:10,accent:"purple"},
{id:"source-evidence",title:"Source Evidence",description:"Configit extraction and resolution evidence",entityKinds:["source-evidence-group","source-evidence-field"],relationshipFamilies:["source-evidence"],priority:11,accent:"slate"},
{id:"cross-source",title:"Cross-source identity",description:"Source representations",entityKinds:["source-representation"],relationshipFamilies:["correspondence"],priority:11,accent:"violet"}
];
export const domainForEntity=(kind:string):IntelligenceDomainId|undefined=>INTELLIGENCE_DOMAINS.find(domain=>domain.entityKinds.includes(kind))?.id;
export const domainForRelationship=(family:string):IntelligenceDomainId|undefined=>INTELLIGENCE_DOMAINS.find(domain=>domain.relationshipFamilies.includes(family))?.id;
