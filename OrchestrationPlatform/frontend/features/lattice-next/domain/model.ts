import type { SourceType } from "@/types/bom-comparison";
export type EntitySource = SourceType | "unified";
export type EntityKind = "assembly" | "component" | "identity";
export type RelationshipKind =
  | "contains"
  | "represented-by"
  | "corresponds-to"
  | "comparison"
  | "requirement"
  | "business-impact";
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
};
export type InvestigationGraph = {
  entities: EngineeringEntity[];
  relationships: EngineeringRelationship[];
  roots: string[];
  byId: Record<string, EngineeringEntity>;
  relationshipById: Record<string, EngineeringRelationship>;
};
export type InvestigationSelection =
  | { type: "none" }
  | { type: "entity"; id: string }
  | { type: "relationship"; id: string };


