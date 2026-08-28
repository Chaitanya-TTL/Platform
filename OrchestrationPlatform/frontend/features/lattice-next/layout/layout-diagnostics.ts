import type { Bounds, LayoutRoute, Size } from "./layout-contract";
import type { NodePosition } from "../contracts/projection";
import { boundsOverlap } from "./sector-orchestrator";

export const nodeBounds = (id: string, positions: Record<string, NodePosition>, dimensions: Record<string, Size>): Bounds | null => {
  const position = positions[id], size = dimensions[id];
  return position && size ? { ...position, ...size } : null;
};
export function countNodeOverlaps(positions: Record<string, NodePosition>, dimensions: Record<string, Size>, gap = 0) {
  const bounds = Object.keys(positions).map((id) => nodeBounds(id, positions, dimensions)).filter((value): value is Bounds => Boolean(value));
  let count = 0;
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) if (boundsOverlap(bounds[i], bounds[j], gap)) count++;
  return count;
}
export function countBranchOverlaps(bounds: readonly Bounds[]) {
  let count = 0;
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) if (boundsOverlap(bounds[i], bounds[j], 0)) count++;
  return count;
}
export function countInvalidRoutes(routes: Record<string, LayoutRoute>) {
  return Object.values(routes).filter((route) => [route.start, ...route.bends, route.end].some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))).length;
}
export function subjectIntrusions(subject: Bounds, branchBounds: readonly Bounds[], gap = 80) {
  return branchBounds.filter((bounds) => boundsOverlap(subject, bounds, gap)).length;
}
