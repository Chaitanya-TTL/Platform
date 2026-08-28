import ELK from "elkjs/lib/elk.bundled.js";
import type { NodePosition, RelationshipProjection } from "../contracts/projection";
import { decomposeProjection } from "../layout/branch-decomposition";
import { buildElkBranchGraph, nodeSize } from "../layout/elk-branch-builder";
import { adaptElkResult, type ElkGraphResult } from "../layout/elk-result-adapter";
import { LATTICE_LAYOUT_REVISION, type Bounds, type LayoutPort, type LayoutRoute, type LayoutViewport, type UniversalLayoutResult } from "../layout/layout-contract";
import { cardinalDirection, collisionFreeRadius, outwardAnchor, sectorAngles, usableViewport } from "../layout/sector-orchestrator";
import { countBranchOverlaps, countInvalidRoutes, countNodeOverlaps, subjectIntrusions } from "../layout/layout-diagnostics";

export const NODE_WIDTH = 272;
export const NODE_HEIGHT = 96;
export const IDENTITY_WIDTH = 344;
export const IDENTITY_HEIGHT = 132;
const elk = new ELK();
const branchLayoutCache = new Map<string, ReturnType<typeof adaptElkResult>>();
const MAX_BRANCH_CACHE = 160;
const branchCacheKey = (branch: { id: string; nodeIds: string[]; edges: Array<{ id: string; source: string; target: string }> }, direction: string) => `${direction}|${branch.id}|${branch.nodeIds.join(",")}|${branch.edges.map((edge) => `${edge.id}:${edge.source}>${edge.target}`).join(",")}`;
const now = () => typeof performance === "undefined" ? Date.now() : performance.now();

export function radialChildPositions(center: NodePosition, childIds: readonly string[], radius: number, startAngle = -Math.PI / 2): Record<string, NodePosition> {
  const ordered = [...childIds].sort((a, b) => a.localeCompare(b));
  const step = ordered.length ? Math.PI * 2 / ordered.length : 0;
  return Object.fromEntries(ordered.map((id, index) => [id, { x: center.x + Math.cos(startAngle + index * step) * radius, y: center.y + Math.sin(startAngle + index * step) * radius }]));
}
const shiftPoint = (point: NodePosition, offset: NodePosition): NodePosition => ({ x: point.x + offset.x, y: point.y + offset.y });
const fallbackBranch = (nodeIds: readonly string[], direction: ReturnType<typeof cardinalDirection>) => {
  const horizontal = direction === "RIGHT" || direction === "LEFT";
  const sign = direction === "LEFT" || direction === "UP" ? -1 : 1;
  const positions = Object.fromEntries(nodeIds.map((id, index) => [id, horizontal ? { x: sign * index * 376, y: (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 144 } : { x: (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 328, y: sign * index * 200 }]));
  const bounds = Object.values(positions).reduce<Bounds>((b,p)=>({x:Math.min(b.x,p.x),y:Math.min(b.y,p.y),width:Math.max(b.x+b.width,p.x+NODE_WIDTH)-Math.min(b.x,p.x),height:Math.max(b.y+b.height,p.y+NODE_HEIGHT)-Math.min(b.y,p.y)}),{x:0,y:0,width:NODE_WIDTH,height:NODE_HEIGHT});
  return { positions, dimensions: Object.fromEntries(nodeIds.map((id)=>[id,{width:NODE_WIDTH,height:NODE_HEIGHT}])), ports: {}, routes: {}, bounds };
};

export async function hybridLayout(projection: RelationshipProjection, pinned: Readonly<Record<string, NodePosition>> = {}, signal = 0, viewport?: LayoutViewport): Promise<UniversalLayoutResult> {
  const started = now();
  const decomposition = decomposeProjection(projection);
  const baseDiagnostics = { strategy: "sector-layered-v2" as const, sourceCount: decomposition?.branches.length ?? 0, rings: decomposition?.branches.length ? 1 : 0, iterations: 0, collisionsResolved: 0, elapsedMs: 0, overlapCount: 0, invalidCoordinateCount: 0, fallbackBranches: 0, nodeOverlapCount: 0, branchOverlapCount: 0, subjectIntrusionCount: 0, invalidRouteCount: 0 };
  if (!decomposition) return { signal, revision: LATTICE_LAYOUT_REVISION, positions: {}, dimensions: {}, ports: {}, routes: {}, branchBounds: {}, branches: [], diagnostics: baseDiagnostics };

  const usable = usableViewport(viewport);
  const subjectNode = projection.nodes.find((node) => node.id === decomposition.subjectId)!;
  const subjectSize = nodeSize(subjectNode.kind);
  const positions: Record<string, NodePosition> = { [decomposition.subjectId]: { x: usable.center.x - subjectSize.width / 2, y: usable.center.y - subjectSize.height / 2 } };
  const dimensions = { [decomposition.subjectId]: subjectSize } as UniversalLayoutResult["dimensions"];
  const ports: UniversalLayoutResult["ports"] = {}, routes: UniversalLayoutResult["routes"] = {}, branchBounds: UniversalLayoutResult["branchBounds"] = {};
  const branches: UniversalLayoutResult["branches"] = [], accepted: Bounds[] = [];
  const angles = sectorAngles(decomposition.branches.map((branch) => branch.id));
  let collisionsResolved = 0, fallbackBranches = 0;

  for (const sector of angles) {
    const branch = decomposition.branches.find((candidate) => candidate.id === sector.id)!;
    const direction = cardinalDirection(sector.angle);
    let local: ReturnType<typeof adaptElkResult>;
    const cacheKey = branchCacheKey(branch, direction);
    const cached = branchLayoutCache.get(cacheKey);
    if (cached) local = structuredClone(cached);
    else {
      try {
        const graph = buildElkBranchGraph(branch, projection, direction);
        local = adaptElkResult(await elk.layout(graph) as ElkGraphResult, branch.rootId, direction);
      } catch {
        local = fallbackBranch(branch.nodeIds, direction); fallbackBranches++;
      }
      branchLayoutCache.set(cacheKey, structuredClone(local));
      if (branchLayoutCache.size > MAX_BRANCH_CACHE) branchLayoutCache.delete(branchLayoutCache.keys().next().value!);
    }
    const extent = Math.max(local.bounds.width, local.bounds.height);
    const baseRadius = Math.max(420, subjectSize.width / 2 + 160, Math.min(760, 300 + extent * 0.22));
    const resolved = collisionFreeRadius(baseRadius, sector.angle, local.bounds, accepted, usable.center);
    collisionsResolved += resolved.iterations;
    const anchor = outwardAnchor(usable.center, sector.angle, resolved.radius);
    for (const [id, p] of Object.entries(local.positions)) positions[id] = shiftPoint(p, anchor);
    Object.assign(dimensions, local.dimensions);
    for (const [id, port] of Object.entries(local.ports) as [string, LayoutPort][] ) ports[id] = { ...port, position: shiftPoint(port.position, anchor) };
    for (const [id, route] of Object.entries(local.routes) as [string, LayoutRoute][] ) routes[id] = { ...route, start: shiftPoint(route.start, anchor), bends: route.bends.map((p: NodePosition) => shiftPoint(p, anchor)), end: shiftPoint(route.end, anchor) };
    const globalBounds = { x: anchor.x + local.bounds.x, y: anchor.y + local.bounds.y, width: local.bounds.width, height: local.bounds.height };
    accepted.push(globalBounds); branchBounds[branch.id] = globalBounds;
    branches.push({ id: branch.id, rootId: branch.rootId, nodeIds: [...branch.nodeIds], edgeIds: branch.edges.map((edge) => edge.id), direction, angle: sector.angle, bounds: globalBounds });
  }

  const orphanAngles = sectorAngles(decomposition.orphanNodeIds, 0);
  for (const orphan of orphanAngles) {
    const id = orphan.id;
    const size = nodeSize(projection.nodes.find((node) => node.id === id)?.kind ?? "component");
    const local = { x: -size.width / 2, y: -size.height / 2, ...size };
    const resolved = collisionFreeRadius(Math.max(760, 520 + accepted.length * 40), orphan.angle, local, accepted, usable.center);
    const anchor = outwardAnchor(usable.center, orphan.angle, resolved.radius);
    positions[id] = { x: anchor.x - size.width / 2, y: anchor.y - size.height / 2 };
    dimensions[id] = size;
    accepted.push({ ...positions[id], ...size });
    collisionsResolved += resolved.iterations;
  }
  for (const [id, p] of Object.entries(pinned)) if (positions[id]) positions[id] = { ...p };
  const invalidCoordinateCount = Object.values(positions).filter((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)).length;
  const subjectBounds = { ...positions[decomposition.subjectId], ...subjectSize };
  const branchOverlapCount = countBranchOverlaps(Object.values(branchBounds));
  const nodeOverlapCount = countNodeOverlaps(positions, dimensions);
  const subjectIntrusionCount = subjectIntrusions(subjectBounds, Object.values(branchBounds));
  const invalidRouteCount = countInvalidRoutes(routes);
  return { signal, revision: LATTICE_LAYOUT_REVISION, positions, dimensions, ports, routes, branchBounds, branches, diagnostics: { ...baseDiagnostics, iterations: branches.length, collisionsResolved, overlapCount: branchOverlapCount, invalidCoordinateCount, fallbackBranches, nodeOverlapCount, branchOverlapCount, subjectIntrusionCount, invalidRouteCount, elapsedMs: Math.round(now() - started) } };
}
