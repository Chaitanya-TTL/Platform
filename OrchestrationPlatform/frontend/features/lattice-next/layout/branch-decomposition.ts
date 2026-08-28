import type { ProjectedEdge, RelationshipProjection } from "../contracts/projection";

const STRUCTURAL = new Set(["contains", "represented-by"]);
export type DecomposedBranch = { id: string; rootId: string; nodeIds: string[]; edges: ProjectedEdge[] };
export type DecomposedGraph = {
  subjectId: string;
  branches: DecomposedBranch[];
  crossBranchEdges: ProjectedEdge[];
  orphanNodeIds: string[];
};
const stable = (a: string, b: string) => a.localeCompare(b);

export function decomposeProjection(projection: RelationshipProjection): DecomposedGraph | null {
  if (!projection.nodes.length) return null;
  const ids = new Set(projection.nodes.map((node) => node.id));
  const structural = projection.edges.filter((edge) => STRUCTURAL.has(edge.kind) && ids.has(edge.source) && ids.has(edge.target));
  const incoming = new Map<string, number>();
  for (const edge of structural) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  const subject = [...projection.nodes].sort((a, b) => {
    const aRank = a.kind === "identity" ? 0 : a.level === 0 ? 1 : 2;
    const bRank = b.kind === "identity" ? 0 : b.level === 0 ? 1 : 2;
    return aRank - bRank || a.level - b.level || (incoming.get(a.id) ?? 0) - (incoming.get(b.id) ?? 0) || stable(a.id, b.id);
  })[0];
  const outgoing = new Map<string, ProjectedEdge[]>();
  for (const edge of structural) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  for (const edges of outgoing.values()) edges.sort((a, b) => stable(a.target, b.target) || stable(a.id, b.id));
  const primary = (outgoing.get(subject.id) ?? []).map((edge) => edge.target);
  const roots = primary.length ? [...new Set(primary)].sort(stable) : projection.nodes.filter((node) => node.id !== subject.id && (incoming.get(node.id) ?? 0) === 0).map((node) => node.id).sort(stable);
  const owner = new Map<string, string>();
  const branches: DecomposedBranch[] = roots.map((rootId) => {
    const nodeIds: string[] = [];
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === subject.id || owner.has(id)) continue;
      owner.set(id, rootId); nodeIds.push(id);
      for (const edge of outgoing.get(id) ?? []) queue.push(edge.target);
    }
    nodeIds.sort(stable);
    const owned = new Set(nodeIds);
    const edges = structural.filter((edge) => owned.has(edge.source) && owned.has(edge.target)).sort((a, b) => stable(a.id, b.id));
    return { id: rootId, rootId, nodeIds, edges };
  }).filter((branch) => branch.nodeIds.length);
  const crossBranchEdges = projection.edges.filter((edge) => {
    if (edge.source === subject.id || edge.target === subject.id) return !STRUCTURAL.has(edge.kind);
    return owner.get(edge.source) !== owner.get(edge.target) || !STRUCTURAL.has(edge.kind);
  }).sort((a, b) => stable(a.id, b.id));
  const orphanNodeIds = projection.nodes.map((node) => node.id).filter((id) => id !== subject.id && !owner.has(id)).sort(stable);
  return { subjectId: subject.id, branches, crossBranchEdges, orphanNodeIds };
}
