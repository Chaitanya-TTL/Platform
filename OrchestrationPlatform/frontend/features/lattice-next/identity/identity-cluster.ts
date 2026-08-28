import type { SourceType } from "@/types/bom-comparison";
export type IdentityConfidence="verified"|"deterministic"|"probable"|"ambiguous"|"conflicting"|"unresolved";
export type IdentityEvidence={kind:"exact-id"|"normalized-id"|"name"|"root-context"|"structure";value:string;weight:number;source:SourceType|string;entityId:string};
export type IdentityConflict={kind:"identifier"|"name"|"structure";message:string;entityIds:string[]};
export type IdentityMember={entityId:string;source:SourceType|string;nativeId?:string;name:string;root:boolean};
export type IdentityCluster={clusterId:string;displayName:string;members:IdentityMember[];evidence:IdentityEvidence[];conflicts:IdentityConflict[];score:number;confidence:IdentityConfidence;reviewRequired:boolean};


