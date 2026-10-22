import type {VerifiedApplication,VerifiedAttributePath} from "./application-attribute";
export type ValidatedRelationshipType="operationally-represented-as"|"configured-by"|"specified-by";
export type MappingEndpoint={application:VerifiedApplication;objectType:string;entityKinds:readonly string[];attributePath:VerifiedAttributePath;expectedValue:string};
export type MappingScope={sourceInstance?:string;targetInstance?:string;sapClient?:string;plant?:string;projectId?:string;trackerId?:string};
export type GovernedMappingRecord={schemaVersion:"1.0";mappingId:string;relationshipType:ValidatedRelationshipType;source:MappingEndpoint;target:MappingEndpoint;scope:MappingScope;verification:{basis:"domain-owner-confirmed"|"source-explicit"|"integration-contract";verifiedBy:string;verifiedAt:string;mappingVersion:string;validFrom?:string;validTo?:string;reference:string};enabled:boolean};
