import type { LatticeFlowEdge, LatticeFlowNode } from "../canvas/lattice-flow-types";
import type { BilateralSide } from "./bilateral-layout-contract";

const structural = (edge: LatticeFlowEdge) =>
  edge.data?.relationshipKind === "contains" || edge.data?.relationshipKind === "represented-by";

export function buildBilateralVisibleGraph(nodes: LatticeFlowNode[], edges: LatticeFlowEdge[]) {
  const subject = nodes.find((node) => node.data.category === "subject" || node.data.level === 0);
  if (!subject) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  for (const edge of edges.filter(structural)) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
  }
  for (const values of children.values()) values.sort((a, b) => a.localeCompare(b));
  const domains = (children.get(subject.id) ?? [])
    .map((id) => byId.get(id))
    .filter((node): node is LatticeFlowNode => Boolean(node));
  return { subject, byId, children, domains };
}

export function inheritBranchSide(rootId: string, side: BilateralSide, children: Map<string, string[]>, sideByNode: Record<string, BilateralSide>, depthByNode: Record<string, number>) {
  const visit = (id: string, depth: number) => {
    sideByNode[id] = side;
    depthByNode[id] = depth;
    for (const child of children.get(id) ?? []) visit(child, depth + 1);
  };
  visit(rootId, 1);
}
