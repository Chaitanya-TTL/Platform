import type {
  BomFinding,
  ThreeBomLayout,
  ThreePosition,
} from "@/types/bom-three";
import type { NodeComparison } from "@/types/bom-comparison";
import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

function branchRoot(graph: VisualBomGraph, node: VisualBomNode): string {
  let current = node;
  while (current.parentId && current.parentId !== graph.rootId)
    current = graph.byId[current.parentId] ?? current;
  return current.id;
}
function fibonacciDirection(index: number, count: number): ThreePosition {
  if (count <= 1) return [0, 0, 1];
  const angle = Math.PI * (3 - Math.sqrt(5)) * index;
  const y = 1 - (index / (count - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}
function normalize(v: ThreePosition): ThreePosition {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: ThreePosition, b: ThreePosition): ThreePosition {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function add(a: ThreePosition, b: ThreePosition): ThreePosition {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(v: ThreePosition, n: number): ThreePosition {
  return [v[0] * n, v[1] * n, v[2] * n];
}
export function mixPosition(
  a: ThreePosition,
  b: ThreePosition,
  t: number,
): ThreePosition {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function layoutThreeBom(graph: VisualBomGraph): ThreeBomLayout {
  const branches = graph.byId[graph.rootId]?.childIds ?? [];
  const directions = Object.fromEntries(
    branches.map((id, i) => [id, fibonacciDirection(i, branches.length)]),
  ) as Record<string, ThreePosition>;
  const indexById = Object.fromEntries(branches.map((id, i) => [id, i]));
  const nodes = graph.nodes.map((node) => {
    const complexityScore =
      node.descendantCount +
      node.leafCount * 1.5 +
      node.level * 0.6 +
      node.childIds.length * 2;
    if (node.isRoot)
      return {
        ...node,
        compactPosition: [0, 0, 0] as ThreePosition,
        explodedPosition: [0, 0, 0] as ThreePosition,
        branchIndex: -1,
        complexityScore,
      };
    const rootId = branchRoot(graph, node);
    const direction = directions[rootId] ?? [0, 0, 1];
    const up: ThreePosition =
      Math.abs(direction[1]) > 0.88 ? [1, 0, 0] : [0, 1, 0];
    const tangent = normalize(cross(direction, up));
    const bitangent = normalize(cross(direction, tangent));
    const parent = node.parentId ? graph.byId[node.parentId] : undefined;
    const siblingIndex = Math.max(0, parent?.childIds.indexOf(node.id) ?? 0);
    const siblingCount = Math.max(1, parent?.childIds.length ?? 1);
    const angle =
      siblingCount === 1 ? 0 : (siblingIndex / siblingCount) * Math.PI * 2;
    const localRadius =
      node.level <= 1 ? 0 : 1.5 + Math.min(3, siblingCount * 0.24);
    const local = add(
      scale(tangent, Math.cos(angle) * localRadius),
      scale(bitangent, Math.sin(angle) * localRadius),
    );
    return {
      ...node,
      branchIndex: indexById[rootId] ?? 0,
      complexityScore,
      compactPosition: add(
        scale(direction, 3.8 + node.level * 2.7),
        scale(local, 0.52),
      ),
      explodedPosition: add(scale(direction, 5.7 + node.level * 5.3), local),
    };
  });
  return {
    graph,
    nodes,
    byId: Object.fromEntries(nodes.map((n) => [n.id, n])),
    maxExtent: Math.max(
      10,
      ...nodes.map((n) => Math.hypot(...n.explodedPosition)),
    ),
  };
}

export function buildFindings(
  graph: VisualBomGraph,
  comparisons?: Record<string, NodeComparison>,
): BomFinding[] {
  const findings: BomFinding[] = [];
  for (const node of graph.nodes) {
    const comparison = comparisons?.[node.id];
    if (comparison && ["missing", "source-only"].includes(comparison.status))
      findings.push({
        id: `comparison-${node.id}`,
        nodeId: node.id,
        severity: "high",
        category: "comparison",
        title: `${node.name} requires reconciliation`,
        detail: `${comparison.status} · ${Math.round(comparison.confidence * 100)}% confidence`,
      });
    else if (comparison?.status === "changed")
      findings.push({
        id: `changed-${node.id}`,
        nodeId: node.id,
        severity: "medium",
        category: "comparison",
        title: `${node.name} has cross-source changes`,
        detail: comparison.reasoning.summary,
      });
    else if (comparison?.status === "probable")
      findings.push({
        id: `probable-${node.id}`,
        nodeId: node.id,
        severity: "medium",
        category: "comparison",
        title: `Review probable match for ${node.name}`,
        detail: `${Math.round(comparison.confidence * 100)}% confidence`,
      });
    if (!node.itemId)
      findings.push({
        id: `id-${node.id}`,
        nodeId: node.id,
        severity: "medium",
        category: "quality",
        title: `${node.name} has no business identifier`,
        detail: "Item ID or part number is not available.",
      });
    if (node.isAssembly && node.descendantCount >= 10)
      findings.push({
        id: `complex-${node.id}`,
        nodeId: node.id,
        severity: "low",
        category: "complexity",
        title: `${node.name} is a complex branch`,
        detail: `${node.descendantCount} descendants and ${node.leafCount} leaf components.`,
      });
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return findings
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .slice(0, 12);
}

export function structuralHealth(
  graph: VisualBomGraph,
  comparisons?: Record<string, NodeComparison>,
) {
  const largest = [...graph.nodes]
    .filter((n) => n.isAssembly)
    .sort((a, b) => b.descendantCount - a.descendantCount)[0];
  const deepest = [...graph.nodes].sort((a, b) => b.level - a.level)[0];
  const missingIds = graph.nodes.filter((n) => !n.itemId).length;
  const changed = graph.nodes.filter(
    (n) => comparisons?.[n.id]?.status === "changed",
  ).length;
  const unresolved = graph.nodes.filter((n) =>
    ["missing", "source-only", "probable"].includes(
      comparisons?.[n.id]?.status ?? "",
    ),
  ).length;
  return { largest, deepest, missingIds, changed, unresolved };
}
