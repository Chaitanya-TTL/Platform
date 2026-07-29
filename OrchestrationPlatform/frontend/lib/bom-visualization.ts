import type { NodeComparison, SourceType, TreeNodeData } from "@/types/bom-comparison";
import type { PositionedVisualNode, VisualBomEdge, VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

function primitive(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
}
function attribute(node: TreeNodeData, keys: string[]) {
  for (const key of keys) { const value = primitive(node.attributes?.[key]); if (value) return value; }
}
function presentation(node: TreeNodeData, source: SourceType) {
  const quantity = attribute(node, ["Qty", "Quantity"]), revision = attribute(node, ["Rev ID", "Revision"]);
  if (source === "teamcenter") {
    const itemId = attribute(node, ["Item ID"]), match = node.name.trim().match(/^[^;]+;\d+-(.*?)(?:\s+x\s+[\d.]+)?$/i);
    return { name: match?.[1]?.trim() || node.name.trim(), itemId, quantity, revision };
  }
  if (source === "configit") {
    const productId = attribute(node, ["Product ID"]), raw = productId || node.name.trim().replace(/^Product\s+/i, ""), match = raw.match(/^(.*)_([A-Za-z0-9]+)$/);
    return { name: match?.[1]?.trim() || raw.trim(), itemId: match?.[2] || productId, quantity, revision };
  }
  return { name: node.name.trim(), itemId: attribute(node, ["Number", "Part Number", "Item ID"]) || node.id.match(/:([A-Za-z0-9]+)$/)?.[1] || node.id.match(/-([A-Za-z0-9]+)$/)?.[1], quantity, revision };
}
function counts(node: TreeNodeData): [number, number] {
  const children = node.children ?? []; if (!children.length) return [0, 1];
  let descendants = 0, leaves = 0;
  for (const child of children) { const [nested, leafCount] = counts(child); descendants += 1 + nested; leaves += leafCount; }
  return [descendants, leaves];
}
export function buildVisualBomGraph(root: TreeNodeData, source: SourceType, comparison?: Record<string, NodeComparison>, occurrenceSafe = false): VisualBomGraph {
  const nodes: VisualBomNode[] = [], edges: VisualBomEdge[] = [], bySourceNodeId: Record<string, string[]> = {};
  const walk = (node: TreeNodeData, level: number, parentId: string | undefined, names: string[], indices: number[]) => {
    const shown = presentation(node, source), id = occurrenceSafe ? (indices.length ? `occ:${indices.join(".")}:${node.id}` : `occ:root:${node.id}`) : node.id;
    const [descendantCount, leafCount] = counts(node);
    const childIds = (node.children ?? []).map((child, index) => occurrenceSafe ? `occ:${[...indices, index].join(".")}:${child.id}` : child.id);
    const visual: VisualBomNode = { id, sourceNodeId: node.id, occurrencePath: indices, source, name: shown.name, itemId: shown.itemId, quantity: shown.quantity, revision: shown.revision, parentId, childIds, level, path: [...names, shown.name], isRoot: !parentId, isAssembly: childIds.length > 0, descendantCount, leafCount, siblingCount: parentId ? Math.max(0, (nodes.find((entry) => entry.id === parentId)?.childIds.length ?? 1) - 1) : 0, comparisonStatus: comparison?.[node.id]?.status };
    nodes.push(visual); (bySourceNodeId[node.id] ??= []).push(id);
    if (parentId) edges.push({ id: `${parentId}->${id}`, sourceId: parentId, targetId: id, depth: level, quantity: shown.quantity, comparisonStatus: comparison?.[node.id]?.status });
    (node.children ?? []).forEach((child, index) => walk(child, level + 1, id, visual.path, [...indices, index]));
  };
  walk(root, 0, undefined, [], []);
  return { rootId: nodes[0].id, nodes, edges, byId: Object.fromEntries(nodes.map((node) => [node.id, node])), bySourceNodeId, maxLevel: Math.max(...nodes.map((node) => node.level), 0) };
}
export function ancestors(graph: VisualBomGraph, id: string | null) { const result: VisualBomNode[] = []; let current = id ? graph.byId[id] : undefined; while (current) { result.unshift(current); current = current.parentId ? graph.byId[current.parentId] : undefined; } return result; }
export function descendants(graph: VisualBomGraph, id: string | null) { const result: VisualBomNode[] = []; const visit = (currentId: string) => { for (const childId of graph.byId[currentId]?.childIds ?? []) { const child = graph.byId[childId]; if (child) { result.push(child); visit(childId); } } }; if (id) visit(id); return result; }
export function relationshipState(graph: VisualBomGraph, id: string | null) { const ancestorIds = new Set(ancestors(graph, id).map((node) => node.id)), descendantIds = new Set(descendants(graph, id).map((node) => node.id)), selected = id ? graph.byId[id] : undefined, siblingIds = new Set(selected?.parentId ? (graph.byId[selected.parentId]?.childIds ?? []).filter((childId) => childId !== id) : []); return { ancestorIds, descendantIds, siblingIds }; }
export function deriveVisibleGraph(graph: VisualBomGraph, expanded: Set<string>, focusId: string | null, mode: "full" | "branch" | "descendants" | "root-path" | "neighbourhood", search = "", forcedIds = new Set<string>()) {
  const allowed = new Set<string>(), relationships = relationshipState(graph, focusId);
  if (!focusId || mode === "full") graph.nodes.forEach((node) => allowed.add(node.id));
  else if (mode === "branch") { relationships.ancestorIds.forEach((id) => allowed.add(id)); relationships.descendantIds.forEach((id) => allowed.add(id)); }
  else if (mode === "descendants") { allowed.add(focusId); relationships.descendantIds.forEach((id) => allowed.add(id)); }
  else if (mode === "root-path") relationships.ancestorIds.forEach((id) => allowed.add(id));
  else { allowed.add(focusId); relationships.siblingIds.forEach((id) => allowed.add(id)); const node = graph.byId[focusId]; if (node?.parentId) allowed.add(node.parentId); node?.childIds.forEach((id) => allowed.add(id)); }
  forcedIds.forEach((id) => { allowed.add(id); ancestors(graph, id).forEach((node) => allowed.add(node.id)); });
  const query = search.trim().toLowerCase(), matches = new Set(graph.nodes.filter((node) => query && `${node.name} ${node.itemId ?? ""} ${node.path.join(" ")}`.toLowerCase().includes(query)).map((node) => node.id));
  for (const id of [...matches, ...forcedIds]) ancestors(graph, id).forEach((node) => { allowed.add(node.id); expanded.add(node.id); });
  const nodes = graph.nodes.filter((node) => { if (!allowed.has(node.id)) return false; if (node.isRoot) return true; let parentId = node.parentId; while (parentId) { if (!expanded.has(parentId) && !matches.has(node.id) && !forcedIds.has(node.id)) return false; parentId = graph.byId[parentId]?.parentId; } return true; });
  const ids = new Set(nodes.map((node) => node.id)), edges = graph.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId));
  return { ...graph, nodes, edges, byId: Object.fromEntries(nodes.map((node) => [node.id, node])) };
}
export function visibleBranch(graph: VisualBomGraph, focusId: string | null, expanded: Set<string>, query: string) { return deriveVisibleGraph(graph, expanded, focusId, focusId ? "branch" : "full", query).nodes; }
function subtreeWeight(graph: VisualBomGraph, id: string, visibleIds: Set<string>): number { const node = graph.byId[id]; if (!node || !visibleIds.has(id)) return 0; const children = node.childIds.filter((childId) => visibleIds.has(childId)); return children.length ? Math.max(1, children.reduce((sum, childId) => sum + subtreeWeight(graph, childId, visibleIds), 0)) : 1; }
export function layoutConstellation(visibleNodes: VisualBomNode[], graph: VisualBomGraph, focusId: string | null, width = 1120, height = 760): PositionedVisualNode[] {
  const visibleIds = new Set(visibleNodes.map((node) => node.id)), rootId = focusId ?? graph.rootId, centerX = width / 2, centerY = height / 2, result: PositionedVisualNode[] = [], maxLevel = Math.max(...visibleNodes.map((node) => node.level), 0), rootLevel = graph.byId[rootId]?.level ?? 0, gap = Math.max(145, Math.min(width, height) * 0.39 / Math.max(1, maxLevel - rootLevel));
  const place = (id: string, start: number, end: number, relativeLevel: number) => { const node = graph.byId[id]; if (!node || !visibleIds.has(id)) return; const angle = (start + end) / 2, radius = relativeLevel ? gap * relativeLevel : 0; result.push({ ...node, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius, angle, nodeRadius: node.isRoot || id === rootId ? 34 : node.isAssembly ? 25 : 18 }); const children = node.childIds.filter((childId) => visibleIds.has(childId)), total = children.reduce((sum, childId) => sum + subtreeWeight(graph, childId, visibleIds), 0); let cursor = start; for (const childId of children) { const portion = (end - start) * (subtreeWeight(graph, childId, visibleIds) / total); place(childId, cursor + 0.02, Math.max(cursor + 0.04, cursor + portion - 0.02), relativeLevel + 1); cursor += portion; } };
  place(rootId, -Math.PI * 1.5, Math.PI * 0.5, 0); return result;
}
