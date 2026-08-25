import type { EntityKind, RelationshipKind } from "../domain/model";
export type LayoutOrientation = "RIGHT" | "DOWN";
export type ProjectedNode = { id:string; label:string; subtitle:string; kind:EntityKind; source:string; level:number; selected:boolean; expanded:boolean; hasChildren:boolean; hiddenChildren:number; position?:{x:number;y:number} };
export type ProjectedEdge = { id:string; source:string; target:string; kind:RelationshipKind; selected:boolean; label?:string };
export type RelationshipProjection = { nodes:ProjectedNode[]; edges:ProjectedEdge[]; structuralKey:string };
export type RendererViewport = {x:number;y:number;zoom:number};
