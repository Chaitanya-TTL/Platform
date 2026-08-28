import type { Bounds, CardinalDirection, LayoutPort, LayoutRoute, PortSide, Size } from "./layout-contract";
import type { NodePosition } from "../contracts/projection";

type ElkPoint = { x?: number; y?: number };
type ElkPort = ElkPoint & { id: string; width?: number; height?: number; layoutOptions?: Record<string, string>; properties?: Record<string, string> };
type ElkNode = ElkPoint & { id: string; width?: number; height?: number; ports?: ElkPort[] };
type ElkSection = { startPoint?: ElkPoint; bendPoints?: ElkPoint[]; endPoint?: ElkPoint };
type ElkEdge = { id: string; sections?: ElkSection[] };
export type ElkGraphResult = { width?: number; height?: number; children?: ElkNode[]; edges?: ElkEdge[] };
const finite = (value: number | undefined) => Number.isFinite(value) ? value! : 0;
const defaultSide = (direction: CardinalDirection, output: boolean): PortSide => direction === "RIGHT" ? output ? "EAST" : "WEST" : direction === "LEFT" ? output ? "WEST" : "EAST" : direction === "DOWN" ? output ? "SOUTH" : "NORTH" : output ? "NORTH" : "SOUTH";

export function adaptElkResult(result: ElkGraphResult, rootId: string, direction: CardinalDirection) {
  const raw = Object.fromEntries((result.children ?? []).map((node) => [node.id, { x: finite(node.x), y: finite(node.y) }]));
  const root = (result.children ?? []).find((node) => node.id === rootId) ?? result.children?.[0];
  const rootCenter = { x: finite(root?.x) + finite(root?.width) / 2, y: finite(root?.y) + finite(root?.height) / 2 };
  const positions: Record<string, NodePosition> = {};
  const dimensions: Record<string, Size> = {};
  const ports: Record<string, LayoutPort> = {};
  for (const node of result.children ?? []) {
    positions[node.id] = { x: raw[node.id].x - rootCenter.x, y: raw[node.id].y - rootCenter.y };
    dimensions[node.id] = { width: finite(node.width), height: finite(node.height) };
    for (const port of node.ports ?? []) {
      const side = (port.layoutOptions?.["elk.port.side"] ?? port.properties?.["org.eclipse.elk.port.side"] ?? defaultSide(direction, port.id.endsWith(":out"))) as PortSide;
      ports[port.id] = { id: port.id, nodeId: node.id, side, position: { x: positions[node.id].x + finite(port.x), y: positions[node.id].y + finite(port.y) } };
    }
  }
  const routes: Record<string, LayoutRoute> = {};
  for (const edge of result.edges ?? []) {
    const section = edge.sections?.[0];
    if (!section?.startPoint || !section.endPoint) continue;
    routes[edge.id] = { edgeId: edge.id, start: { x: finite(section.startPoint.x) - rootCenter.x, y: finite(section.startPoint.y) - rootCenter.y }, bends: (section.bendPoints ?? []).map((p) => ({ x: finite(p.x) - rootCenter.x, y: finite(p.y) - rootCenter.y })), end: { x: finite(section.endPoint.x) - rootCenter.x, y: finite(section.endPoint.y) - rootCenter.y } };
  }
  const all = Object.entries(positions);
  const bounds: Bounds = all.length ? {
    x: Math.min(...all.map(([id,p]) => p.x)), y: Math.min(...all.map(([id,p]) => p.y)),
    width: Math.max(...all.map(([id,p]) => p.x + dimensions[id].width)) - Math.min(...all.map(([,p]) => p.x)),
    height: Math.max(...all.map(([id,p]) => p.y + dimensions[id].height)) - Math.min(...all.map(([,p]) => p.y)),
  } : { x: 0, y: 0, width: 0, height: 0 };
  return { positions, dimensions, ports, routes, bounds };
}
