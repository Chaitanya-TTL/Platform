import type { NodePosition } from "../contracts/projection";
import type { PortSide, Size } from "./layout-contract";

const EPSILON = 1e-9;
const MIN_OFFSET_PERCENT = 8;
const MAX_OFFSET_PERCENT = 92;

export type RadialAttachment = {
  id: string;
  branchId: string;
  side: PortSide;
  offsetPercent: number;
  position: NodePosition;
};

export type RadialConnectionGeometry = {
  branchId: string;
  angle: number;
  source: RadialAttachment;
  target: RadialAttachment;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeDirection(dx: number, dy: number): NodePosition {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= EPSILON) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

export function rectangleBoundaryAttachment({
  id,
  branchId,
  center,
  size,
  direction,
}: {
  id: string;
  branchId: string;
  center: NodePosition;
  size: Size;
  direction: NodePosition;
}): RadialAttachment {
  const unit = normalizeDirection(direction.x, direction.y);
  const halfWidth = Math.max(EPSILON, size.width / 2);
  const halfHeight = Math.max(EPSILON, size.height / 2);
  const scaleX = Math.abs(unit.x) > EPSILON ? halfWidth / Math.abs(unit.x) : Number.POSITIVE_INFINITY;
  const scaleY = Math.abs(unit.y) > EPSILON ? halfHeight / Math.abs(unit.y) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  const position = { x: center.x + unit.x * scale, y: center.y + unit.y * scale };

  const horizontal = Math.abs(unit.x) >= Math.abs(unit.y);
  const side: PortSide = horizontal
    ? unit.x >= 0 ? "EAST" : "WEST"
    : unit.y >= 0 ? "SOUTH" : "NORTH";
  const rawOffset = side === "NORTH" || side === "SOUTH"
    ? ((position.x - (center.x - halfWidth)) / (halfWidth * 2)) * 100
    : ((position.y - (center.y - halfHeight)) / (halfHeight * 2)) * 100;

  return {
    id,
    branchId,
    side,
    offsetPercent: clamp(rawOffset, MIN_OFFSET_PERCENT, MAX_OFFSET_PERCENT),
    position,
  };
}

export function radialConnectionGeometry({
  branchId,
  angle,
  sourceCenter,
  sourceSize,
  targetCenter,
  targetSize,
}: {
  branchId: string;
  angle: number;
  sourceCenter: NodePosition;
  sourceSize: Size;
  targetCenter: NodePosition;
  targetSize: Size;
}): RadialConnectionGeometry {
  const direction = normalizeDirection(Math.cos(angle), Math.sin(angle));
  return {
    branchId,
    angle,
    source: rectangleBoundaryAttachment({
      id: `radial-source:${branchId}`,
      branchId,
      center: sourceCenter,
      size: sourceSize,
      direction,
    }),
    target: rectangleBoundaryAttachment({
      id: `radial-target:${branchId}`,
      branchId,
      center: targetCenter,
      size: targetSize,
      direction: { x: -direction.x, y: -direction.y },
    }),
  };
}
