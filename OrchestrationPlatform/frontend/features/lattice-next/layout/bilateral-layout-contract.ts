import type { XYPosition } from "@xyflow/react";
import type { Bounds, LayoutRoute } from "./layout-contract";

export type BilateralSide = "LEFT" | "RIGHT";
export type BilateralLayoutMode = "DEFAULT" | "BILATERAL";
export type BilateralPortPlan = {
  edgeId: string;
  sourceSide: "east" | "west";
  targetSide: "east" | "west";
};
export type BilateralLayoutResult = {
  positions: Record<string, XYPosition>;
  sideByNode: Record<string, BilateralSide>;
  depthByNode: Record<string, number>;
  branchBounds: Record<string, Bounds>;
  routes: Record<string, LayoutRoute>;
  ports: Record<string, BilateralPortPlan>;
};
export const BILATERAL_LAYOUT_CONFIG = {
  subjectToDomainGap: 260,
  levelHorizontalGap: 220,
  siblingVerticalGap: 42,
  branchVerticalGap: 96,
  nodeSafetyPadding: 18,
  sideDeadZone: 60,
  routeDeparture: 72,
} as const;
