import type { BomFinding, ThreeBomLayout, ThreeLayoutOptions, ThreePosition } from "@/types/bom-three";
import type { NodeComparison } from "@/types/bom-comparison";
import type { VisualBomGraph } from "@/types/bom-visualization";
const config = { compact: { ring: 8, cluster: 2.2, level: 4 }, balanced: { ring: 12, cluster: 3.5, level: 6 }, expanded: { ring: 17, cluster: 5.2, level: 8 } };
const add = (a: ThreePosition, b: ThreePosition): ThreePosition => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (value: ThreePosition, factor: number): ThreePosition => [value[0] * factor, value[1] * factor, value[2] * factor];
export function layoutThreeBom(graph: VisualBomGraph, options: ThreeLayoutOptions = { spacing: "balanced" }): ThreeBomLayout {
  const settings = config[options.spacing], root = graph.byId[graph.rootId], branches = root?.childIds.filter((id) => graph.byId[id]) ?? [], weights = branches.map((id) => Math.max(1, Math.sqrt((graph.byId[id]?.descendantCount ?? 0) + 1))), total = weights.reduce((sum, value) => sum + value, 0), angleById: Record<string, number> = {};
  let cursor = -Math.PI;
  branches.forEach((id, index) => { const span = Math.PI * 2 * (weights[index] / Math.max(1, total)); angleById[id] = cursor + span / 2; cursor += span; });
  const branchById: Record<string, string> = {};
  for (const node of graph.nodes) branchById[node.id] = node.isRoot ? node.id : node.parentId === graph.rootId ? node.id : (node.parentId ? branchById[node.parentId] : node.id);
  const branchIndexById = Object.fromEntries(branches.map((id, index) => [id, index]));
  const nodes = graph.nodes.map((node) => {
    const complexityScore = node.descendantCount + node.leafCount * 1.5 + node.childIds.length * 2 + node.level * 0.5;
    if (node.isRoot) return { ...node, position: [0, 0, 0] as ThreePosition, branchIndex: -1, complexityScore };
    const branchId = branchById[node.id] ?? node.id, branchIndex = Math.max(0, branchIndexById[branchId] ?? 0), angle = angleById[branchId] ?? 0, direction: ThreePosition = [Math.cos(angle), 0, Math.sin(angle)], base = scale(direction, settings.ring + (node.level - 1) * settings.level);
    let local: ThreePosition = [0, (node.level - 1) * 1.6, 0];
    const parent = node.parentId ? graph.byId[node.parentId] : undefined, siblingIndex = Math.max(0, parent?.childIds.indexOf(node.id) ?? 0), siblingCount = Math.max(1, parent?.childIds.length ?? 1);
    if (node.level > 1) { const localAngle = siblingCount === 1 ? 0 : siblingIndex / siblingCount * Math.PI * 2, radius = settings.cluster * Math.max(0.5, Math.sqrt(siblingCount) / 3); local = [Math.cos(localAngle) * radius, (siblingIndex % 3 - 1) * 1.4, Math.sin(localAngle) * radius]; }
    return { ...node, position: add(base, local), branchIndex, complexityScore };
  });
  return { graph, nodes, byId: Object.fromEntries(nodes.map((node) => [node.id, node])), maxExtent: Math.max(10, ...nodes.map((node) => Math.hypot(...node.position))), center: [0, 0, 0] };
}
export function boundsForNodes(layout: ThreeBomLayout, ids?: Set<string>) { const nodes = ids ? layout.nodes.filter((node) => ids.has(node.id)) : layout.nodes; if (!nodes.length) return { center: [0, 0, 0] as ThreePosition, radius: 10 }; const center = nodes.reduce((result, node) => add(result, node.position), [0, 0, 0] as ThreePosition).map((value) => value / nodes.length) as ThreePosition, radius = Math.max(4, ...nodes.map((node) => Math.hypot(node.position[0] - center[0], node.position[1] - center[1], node.position[2] - center[2]))); return { center, radius }; }
export function mixPosition(a: ThreePosition, b: ThreePosition, t: number): ThreePosition { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function buildFindings(graph: VisualBomGraph, comparisons?: Record<string, NodeComparison>): BomFinding[] { return graph.nodes.flatMap((node) => { const comparison = comparisons?.[node.sourceNodeId], findings: BomFinding[] = []; if (comparison && ["missing", "source-only"].includes(comparison.status)) findings.push({ id: `comparison-${node.id}`, nodeId: node.id, severity: "high", category: "comparison", title: `${node.name} requires reconciliation`, detail: comparison.reasoning.summary }); if (node.isAssembly && node.descendantCount >= 10) findings.push({ id: `complex-${node.id}`, nodeId: node.id, severity: "low", category: "complexity", title: `${node.name} is a complex branch`, detail: `${node.descendantCount} descendants.` }); return findings; }).slice(0, 12); }
