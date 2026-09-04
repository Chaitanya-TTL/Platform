import type { SourceType } from "@/types/bom-comparison";
export type EntitySource = SourceType | "unified" | "platform";
export type EntityKind = "assembly" | "component" | "identity" | "source-representation" | "finding" | "evidence" | "part" | "part-occurrence" | "material" | "requirement" | "requirement-revision" | "change-notice" | "change-task" | "production-order" | "configuration-feature" | "configuration-option" | "document" | "accounting-document" | "plant" | "storage-location";
export type RelationshipKind =
  | "contains"
  | "represented-by"
  | "corresponds-to"
  | "comparison"
  | "requirement"
  | "described-by"
  | "traced-to"
  | "allocated-to"
  | "implemented-by"
  | "business-impact"
  | "affected-by"
  | "supersedes"
  | "configured-by"
  | "selected-option"
  | "produced-by"
  | "stocked-at"
  | "referenced-in"
  | "supported-by";
export type RelationshipEvidence = {
  sourceLabel: string;
  reason: string;
  nativeId?: string;
  capturedAt?: string;
};
export type EngineeringEntity = {
  id: string;
  sourceNodeId: string;
  source: EntitySource;
  name: string;
  kind: EntityKind;
  level: number;
  attributes: Record<string, string | number | boolean>;
  provenance: { sourceLabel: string; nativeId?: string; capturedAt?: string };
  representationSources?: SourceType[];
  canonicalKind?: string;
  assertion?: "fact" | "inference" | "finding";
  sourceStatus?: string;
  temporal?: { assembledAt: string; capturedAt?: string; freshness: string };
  evidenceIds?: string[];
  identityClusterIds?: string[];
};
export type EngineeringRelationship = {
  id: string;
  from: string;
  to: string;
  kind: RelationshipKind;
  confidence?: number;
  verified?: boolean;
  quantity?: string | number;
  label?: string;
  evidence: RelationshipEvidence[];
  family?: string;
  assertion?: "fact" | "inference" | "finding";
  evidenceIds?: string[];
};
export type InvestigationGraph = {
  entities: EngineeringEntity[];
  relationships: EngineeringRelationship[];
  roots: string[];
  byId: Record<string, EngineeringEntity>;
  relationshipById: Record<string, EngineeringRelationship>;
  metadata?: { investigationId?: string; contractVersion?: string; sourceStatuses?: Record<string,string>; identityClusters?: Array<{ id:string; entityIds:string[]; confidence:string; reasons:string[] }>; evidence?: Record<string,{ id:string; kind:string; summary:string; source:string }>; findings?: Array<{ id:string; kind:string; title:string; summary:string; subjectEntityIds:string[]; evidenceIds:string[] }>; entityAliases?: Readonly<Record<string,string>> };
};
export type InvestigationSelection =
  | { type: "none" }
  | { type: "entity"; id: string }
  | { type: "relationship"; id: string };
