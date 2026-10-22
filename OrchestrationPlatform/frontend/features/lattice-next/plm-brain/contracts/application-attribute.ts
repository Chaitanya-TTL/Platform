import type { IntelligenceEntity } from "../../contracts/intelligence-v1";
export type VerifiedApplication="windchill"|"sap"|"configit"|"codebeamer";
export type VerifiedAttributePath=
 | "provenance.nativeId"
 | "properties.preferredProductId"
 | "properties.partNumber"
 | "properties.workItemId"
 | "properties.productModelCode"
 | "properties.itemId"
 | "properties.externalKey"
 | "properties.projectId"
 | "properties.trackerId";
export type ApplicationAttributeValue={application:VerifiedApplication;objectType:string;entityId:string;entityKind:string;attributePath:VerifiedAttributePath;value:string;nativeId?:string;sourceProvider:string;observedAt:string;authority:string};
export type AttributeAdapter={application:VerifiedApplication;supports(entity:IntelligenceEntity):boolean;read(entity:IntelligenceEntity,path:VerifiedAttributePath):ApplicationAttributeValue|undefined};
