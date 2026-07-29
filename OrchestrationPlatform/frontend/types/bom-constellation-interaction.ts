export type ConstellationInteractionMode = "pointer" | "hand" | "box-select";
export type ConstellationEdgeMode = "direct" | "curved" | "bundled";
export type ConstellationDepth = 1 | 2 | 3 | "all";
export type ConstellationSavedView = {
  id: string;
  name: string;
  createdAt: string;
  layout: string;
  spacing: string;
  labels: string;
  focus: string;
  colorBy: string;
  sizeBy: string;
  unrelated: string;
  matched: string;
  edgeMode: ConstellationEdgeMode;
  labelDensity: number;
  layoutLocked: boolean;
  expanded: string[];
  pinned: string[];
  selected: string | null;
  isolatedRoot: string | null;
  transform: { x: number; y: number; scale: number; rotation: number };
};
export type ConstellationHistoryEntry = Pick<
  ConstellationSavedView,
  "expanded" | "pinned" | "selected" | "isolatedRoot" | "transform"
>;
export type ConstellationBox = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};
