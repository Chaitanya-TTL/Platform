import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

export function lowestCommonAncestor(graph: VisualBomGraph, ids: string[]) {
  if (!ids.length) return null;

  const paths = ids.map((id) => {
    const nodes: string[] = [];
    let current: VisualBomNode | undefined = graph.byId[id];

    while (current) {
      nodes.unshift(current.id);
      current = current.parentId ? graph.byId[current.parentId] : undefined;
    }

    return nodes;
  });

  let common: string | null = null;
  const shortest = Math.min(...paths.map((path) => path.length));

  for (let index = 0; index < shortest; index++) {
    const candidate = paths[0]?.[index];
    if (candidate && paths.every((path) => path[index] === candidate)) {
      common = candidate;
    } else {
      break;
    }
  }

  return common;
}

export function expandedToDepth(
  graph: VisualBomGraph,
  depth: 1 | 2 | 3 | "all",
) {
  const limit = depth === "all" ? Number.POSITIVE_INFINITY : depth;
  return new Set(
    graph.nodes
      .filter((node) => node.isAssembly && node.level < limit)
      .map((node) => node.id),
  );
}

export function safeFileName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "bom-constellation"
  );
}
