export type EntityId=string; export type RelationshipId=string;
export type Domain="product"|"plm"|"erp"|"cpq"|"requirements"|"change"|"document"|"supplier"|"manufacturing"|"source"|"data";
export type EvidenceClass="authoritative-source-fact"|"deterministic-calculation"|"verified-cross-reference"|"heuristic-match"|"user-approved-link"|"inferred-relationship"|"simulated-test-data"|"unavailable-evidence";
export type Scalar=string|number|boolean|null;
export interface CanonicalEntity{id:EntityId;kind:string;domain:Domain;label:string;secondaryLabel?:string;source?:string;sourceNativeId?:string;evidenceClass:EvidenceClass;parentClusterId?:EntityId;expandable?:boolean;attributes:Record<string,Scalar>}
export interface CanonicalRelationship{id:RelationshipId;kind:string;sourceId:EntityId;targetId:EntityId;directed:boolean;evidenceClass:EvidenceClass;sourceSystem?:string;confidence?:number;attributes:Record<string,Scalar>}
export interface CanonicalGraphFixture{schemaVersion:1;graphId:string;title:string;focusId:EntityId;simulated:true;entities:CanonicalEntity[];relationships:CanonicalRelationship[]}
