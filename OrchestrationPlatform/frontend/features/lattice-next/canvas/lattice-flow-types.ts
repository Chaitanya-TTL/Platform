
import type { Edge, Node, Viewport, XYPosition } from "@xyflow/react";
import type { EntityKind, RelationshipKind } from "../domain/model";
import type { CardinalDirection, LayoutPort, LayoutRoute } from "../layout/layout-contract";
export type LatticeNodeCategory = "subject" | "source-representation" | "engineering-item" | "evidence" | "change" | "requirement" | "pending-source" | "unavailable-source" | "cluster";
export type RelationshipFamily = "structure" | "requirement" | "change" | "evidence" | "correspondence" | "operational" | "configuration";
export type ResolutionState = "idle" | "resolving" | "ready" | "partial" | "warning" | "failed";
export type LatticeNodeDataBase = Record<string, unknown> & { category:LatticeNodeCategory; label:string; subtitle:string; source:string; level:number; selected:boolean; expanded:boolean; hasChildren:boolean; hiddenChildren:number; entityKind?:EntityKind; nativeIdentifier?:string; revision?:string; completeness:number; resolutionState:ResolutionState; matchConfidence?:number; childCount:number; lastCapturedAt?:string; participatingSystems:number; coverageSummary:string; relationshipFamilies:RelationshipFamily[]; orientation:"RIGHT"|"DOWN"; activeResolution:boolean; pinned:boolean; evidenceSummary?:string; entering?:boolean; revealIndex?:number; dimmed?:boolean; groupLabel?:string; layoutDirection?:CardinalDirection; radialHandles?:LayoutPort[]; };
export type LatticeSubjectNode=Node<LatticeNodeDataBase & {category:"subject"},"subject">;
export type SourceRepresentationNode=Node<LatticeNodeDataBase & {category:"source-representation"},"source-representation">;
export type EngineeringItemNode=Node<LatticeNodeDataBase & {category:"engineering-item";entityKind:EntityKind},"engineering-item">;
export type EvidenceNode=Node<LatticeNodeDataBase & {category:"evidence"},"evidence">;
export type ChangeNode=Node<LatticeNodeDataBase & {category:"change"},"change">;
export type RequirementNode=Node<LatticeNodeDataBase & {category:"requirement"},"requirement">;
export type PendingSourceNode=Node<LatticeNodeDataBase & {category:"pending-source"},"pending-source">;
export type UnavailableSourceNode=Node<LatticeNodeDataBase & {category:"unavailable-source"},"unavailable-source">;
export type ClusterNode=Node<LatticeNodeDataBase & {category:"cluster"},"cluster">;
export type LatticeFlowNode=LatticeSubjectNode|SourceRepresentationNode|EngineeringItemNode|EvidenceNode|ChangeNode|RequirementNode|PendingSourceNode|UnavailableSourceNode|ClusterNode;
export type LatticeEdgeCategory="structure"|"correspondence"|"requirement"|"change-impact"|"operational-impact"|"configuration"|"evidence"|"pending"|"unavailable";
export type EdgeAnimationState="settled"|"pending"|"resolved"|"trace"|"selected";
export type LatticeEdgeAction="inspect-evidence"|"trace"|"hide-family"|"compare-endpoints"|"open-details";
export type LatticeEdgeDataBase=Record<string,unknown>&{category:LatticeEdgeCategory;relationshipKind:RelationshipKind;label?:string;fullLabel?:string;confidence?:number;direction:"forward"|"inferred"|"bidirectional"|"pending"|"blocked";importance:"primary"|"normal"|"low"|"background";animation:EdgeAnimationState;authoritative:boolean;layoutRoute?:LayoutRoute;branchId?:string;radialAngle?:number;};
export type LatticeFlowEdge=Edge<LatticeEdgeDataBase,"lattice-edge">;
export type LatticePinnedPositions=Readonly<Record<string,XYPosition>>; export type LatticeViewportState=Viewport;

