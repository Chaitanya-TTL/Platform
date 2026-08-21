import type { SourceType } from "@/types/bom-comparison";
export type EntityKind = "assembly" | "component";
export type RelationshipKind =
  | "contains"
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
  source: SourceType;
  name: string;
  kind: EntityKind;
  level: number;
  attributes: Record<string, string | number | boolean>;
  provenance: { sourceLabel: string; nativeId?: string; capturedAt?: string };
};
export type EngineeringRelationship = {
  id: string;
  from: string;
  to: string;
  kind: RelationshipKind;
  confidence?: number;
  verified?: boolean;
  quantity?: string | number;
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
