import type { NodeComparison } from "@/types/bom-comparison";
import { RadialLayout, RadialArcNode, RadialFinding } from "@/types/bom-radial";
import type { VisualBomGraph } from "@/types/bom-visualization";

function descendantsInBranch(graph: VisualBomGraph, id: string): Set<string> {
  const ids = new Set<string>();
  const visit = (current: string) => {
    ids.add(current);
    for (const child of graph.byId[current]?.childIds ?? []) visit(child);
  };
  visit(id);
  return ids;
}

function weight(graph: VisualBomGraph, id: string, visible: Set<string>): number {
  const node = graph.byId[id];
  if (!node || !visible.has(id)) return 0;
  const children = node.childIds.filter(child => visible.has(child));
  return children.length ? Math.max(1, children.reduce((sum, child) => sum + weight(graph, child, visible), 0)) : 1;
}

export function layoutRadialBom(graph: VisualBomGraph, focusId: string, radius = 340): RadialLayout {
  const visible = descendantsInBranch(graph, focusId);
  const focusLevel = graph.byId[focusId]?.level ?? 0;
  const maxRelativeLevel = Math.max(0, ...[...visible].map(id => (graph.byId[id]?.level ?? focusLevel) - focusLevel));
  const ringCount = Math.max(1, maxRelativeLevel + 1);
  const centerRadius = 56;
  const ringGap = (radius - centerRadius) / ringCount;
  const nodes: RadialArcNode[] = [];
  const totalWeight = weight(graph, focusId, visible);

  const place = (id: string, startAngle: number, endAngle: number) => {
    const node = graph.byId[id];
    if (!node || !visible.has(id)) return;
    const relativeLevel = node.level - focusLevel;
    const branchWeight = weight(graph, id, visible);
    nodes.push({
      ...node,
      startAngle,
      endAngle,
      innerRadius: relativeLevel === 0 ? 0 : centerRadius + (relativeLevel - 1) * ringGap + 5,
      outerRadius: relativeLevel === 0 ? centerRadius : centerRadius + relativeLevel * ringGap,
      branchWeight,
      contribution: totalWeight ? branchWeight / totalWeight : 0,
      relativeLevel,
    });

    const children = node.childIds.filter(child => visible.has(child));
    if (!children.length) return;
    const total = children.reduce((sum, child) => sum + weight(graph, child, visible), 0);
    let cursor = startAngle;
    for (const child of children) {
      const portion = (endAngle - startAngle) * (weight(graph, child, visible) / total);
      place(child, cursor, cursor + portion);
      cursor += portion;
    }
  };

  place(focusId, -Math.PI / 2, Math.PI * 1.5);
  return { graph, focusId, nodes, byId: Object.fromEntries(nodes.map(node => [node.id, node])), totalWeight, maxRelativeLevel };
}

export function branchChangeCount(graph: VisualBomGraph, id: string, comparison?: Record<string, NodeComparison>) {
  const ids = descendantsInBranch(graph, id);
  return [...ids].filter(nodeId => ["changed", "missing", "source-only", "probable"].includes(comparison?.[nodeId]?.status ?? "")).length;
}

export function radialFindings(graph: VisualBomGraph, comparison?: Record<string, NodeComparison>): RadialFinding[] {
  const findings: RadialFinding[] = [];
  for (const node of graph.nodes) {
    const status = comparison?.[node.id]?.status;
    if (status === "missing" || status === "source-only") findings.push({ id:`critical-${node.id}`, nodeId:node.id, severity:"high", title:`${node.name} requires reconciliation`, detail:`Comparison status: ${status}.` });
    else if (status === "changed") findings.push({ id:`changed-${node.id}`, nodeId:node.id, severity:"medium", title:`Changes concentrated around ${node.name}`, detail:comparison?.[node.id]?.reasoning.summary ?? "Cross-source values differ." });
    if (!node.itemId) findings.push({ id:`quality-${node.id}`, nodeId:node.id, severity:"medium", title:`Missing identifier for ${node.name}`, detail:"No Item ID or part number is available." });
    if (node.isAssembly && node.descendantCount >= 10) findings.push({ id:`large-${node.id}`, nodeId:node.id, severity:"low", title:`${node.name} is structurally significant`, detail:`${node.descendantCount} descendants and ${node.leafCount} leaf components.` });
  }
  const priority = { high:0, medium:1, low:2 } as const;
  return findings.sort((a,b) => priority[a.severity] - priority[b.severity]).slice(0, 10);
}
