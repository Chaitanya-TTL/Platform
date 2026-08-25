export type Point={x:number;y:number};
export type PortSide="NORTH"|"SOUTH"|"EAST"|"WEST";
export interface LayoutPort{id:string;side:PortSide;x:number;y:number;}
export interface LayoutNodeResult{id:string;x:number;y:number;width:number;height:number;parentId?:string;ports:LayoutPort[];previous?:Point;displacement:number;cluster?:{hiddenEntities:number;hiddenRelationships:number;expandable:boolean};}
export interface LayoutEdgeResult{id:string;sourceId:string;targetId:string;sections:{start:Point;end:Point;bends:Point[]}[];labelAnchor?:Point;labelPriority:"always"|"active"|"hover"|"zoom"|"inspector";family:string;}
export interface StabilityMetadata{existingNodes:number;movedNodes:number;maximumDisplacement:number;medianDisplacement:number;averageDisplacement:number;pillarDisplacement:number;focusDisplacement:number;overlaps:number;crossings:number;deterministic:boolean;}
export interface LatticeLayoutResult{preset:string;durationMs:number;nodes:LayoutNodeResult[];edges:LayoutEdgeResult[];stability:StabilityMetadata;visibleEntities:number;visibleRelationships:number;preventedEntities:number;preventedRelationships:number;}
