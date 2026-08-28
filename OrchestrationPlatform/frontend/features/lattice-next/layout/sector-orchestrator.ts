import type { Bounds, CardinalDirection, LayoutViewport } from "./layout-contract";
import type { NodePosition } from "../contracts/projection";

export const usableViewport = (viewport?: LayoutViewport) => {
  const width = Math.max(640, (viewport?.width ?? 1440) - (viewport?.inspectorWidth ?? 360) - 2 * (viewport?.gutter ?? 32));
  const height = Math.max(520, (viewport?.height ?? 900) - (viewport?.toolbarHeight ?? 96) - 2 * (viewport?.gutter ?? 32));
  return { width, height, center: { x: width / 2, y: height / 2 } };
};
export const sectorAngles = (ids: readonly string[], start = -Math.PI / 2) => [...ids].sort((a,b)=>a.localeCompare(b)).map((id, index, ordered) => ({ id, angle: start + index * Math.PI * 2 / ordered.length }));
export const cardinalDirection = (angle: number): CardinalDirection => {
  const x = Math.cos(angle), y = Math.sin(angle);
  return Math.abs(x) >= Math.abs(y) ? x >= 0 ? "RIGHT" : "LEFT" : y >= 0 ? "DOWN" : "UP";
};
export const outwardAnchor = (center: NodePosition, angle: number, radius: number): NodePosition => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
export const boundsOverlap = (a: Bounds, b: Bounds, gap = 36) => !(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
export function collisionFreeRadius(base: number, angle: number, local: Bounds, accepted: readonly Bounds[], center: NodePosition) {
  let radius = base, iterations = 0;
  while (iterations < 128) {
    const anchor = outwardAnchor(center, angle, radius);
    const candidate = { x: anchor.x + local.x, y: anchor.y + local.y, width: local.width, height: local.height };
    if (accepted.every((other) => !boundsOverlap(candidate, other))) return { radius, bounds: candidate, iterations };
    radius += Math.max(100, Math.min(240, Math.max(local.width, local.height) * 0.2)); iterations++;
  }
  const anchor = outwardAnchor(center, angle, radius);
  return { radius, bounds: { x: anchor.x + local.x, y: anchor.y + local.y, width: local.width, height: local.height }, iterations };
}
