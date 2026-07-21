import type {
  NodeComparison,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
import type {
  PositionedVisualNode,
  VisualBomEdge,
  VisualBomGraph,
  VisualBomNode,
} from "@/types/bom-visualization";

function primitive(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : undefined;
}

function attribute(node: TreeNodeData, keys: string[]) {
  for (const key of keys) {
    const value = primitive(node.attributes?.[key]);
    if (value) return value;
  }
  return undefined;
}

function visualizationPresentation(node: TreeNodeData, source: SourceType) {
  const quantity = attribute(node, ["Qty", "Quantity"]);
  const revision = attribute(node, ["Rev ID", "Revision"]);

  if (source === "teamcenter") {
    const itemId = attribute(node, ["Item ID"]);
    const match = node.name
      .trim()
      .match(/^[^;]+;\d+-(.*?)(?:\s+x\s+[\d.]+)?$/i);

    return {
      name: match?.[1]?.trim() || node.name.trim(),
      itemId,
      quantity,
      revision,
    };
  }

  if (source === "configit") {
    const productId = attribute(node, ["Product ID"]);
    const rawName = productId || node.name.trim().replace(/^Product\s+/i, "");
    const match = rawName.match(/^(.*)_([A-Za-z0-9]+)$/);

    return {
      name: match?.[1]?.trim() || rawName.trim(),
      itemId: match?.[2] || productId,
      quantity,
      revision,
    };
  }

  return {
    name: node.name.trim(),
    itemId:
      attribute(node, ["Number", "Part Number", "Item ID"]) ||
      node.id.trim().match(/-([A-Za-z0-9]+)$/)?.[1],
    quantity,
    revision,
  };
}

function countDescendants(node: TreeNodeData): number {
  return (node.children ?? []).reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0,
  );
}

function countLeaves(node: TreeNodeData): number {
  return node.children?.length
    ? node.children.reduce((sum, child) => sum + countLeaves(child), 0)
    : 1;
}

export function buildVisualBomGraph(
  root: TreeNodeData,
  source: SourceType,
  comparison?: Record<string, NodeComparison>,
): VisualBomGraph {
  const nodes: VisualBomNode[] = [];
  const edges: VisualBomEdge[] = [];

  const walk = (
    node: TreeNodeData,
    level: number,
    parentId: string | undefined,
    path: string[],
    siblingCount: number,
  ) => {
    const shown = visualizationPresentation(node, source);
    const childIds = (node.children ?? []).map((child) => child.id);
    const visual: VisualBomNode = {
      id: node.id,
      source,
      name: shown.name,
      itemId: shown.itemId,
      quantity: shown.quantity,
      revision: shown.revision,
      parentId,
      childIds,
      level,
      path: [...path, shown.name],
      isRoot: !parentId,
      isAssembly: childIds.length > 0,
      descendantCount: countDescendants(node),
      leafCount: countLeaves(node),
      siblingCount,
      comparisonStatus: comparison?.[node.id]?.status,
    };

    nodes.push(visual);

    if (parentId) {
      edges.push({
        id: `${parentId}->${node.id}`,
        sourceId: parentId,
        targetId: node.id,
        depth: level,
        quantity: shown.quantity,
        comparisonStatus: comparison?.[node.id]?.status,
      });
    }

    for (const child of node.children ?? []) {
      walk(
        child,
        level + 1,
        node.id,
        visual.path,
        Math.max(0, childIds.length - 1),
      );
    }
  };

  walk(root, 0, undefined, [], 0);

  return {
    rootId: root.id,
    nodes,
    edges,
    byId: Object.fromEntries(nodes.map((node) => [node.id, node])),
    maxLevel: Math.max(...nodes.map((node) => node.level), 0),
  };
}

function collectBranch(graph: VisualBomGraph, rootId: string) {
  const ids = new Set<string>();
  const visit = (id: string) => {
    ids.add(id);
    for (const childId of graph.byId[id]?.childIds ?? []) visit(childId);
  };
  visit(rootId);
  return graph.nodes.filter((node) => ids.has(node.id));
}

export function visibleBranch(
  graph: VisualBomGraph,
  focusId: string | null,
  expandedIds: Set<string>,
  query: string,
) {
  const base = focusId ? collectBranch(graph, focusId) : graph.nodes;
  const normalized = query.trim().toLowerCase();

  if (normalized) {
    const visibleIds = new Set(
      base
        .filter((node) =>
          `${node.name} ${node.itemId ?? ""} ${node.path.join(" ")}`
            .toLowerCase()
            .includes(normalized),
        )
        .map((node) => node.id),
    );

    for (const id of [...visibleIds]) {
      let current = graph.byId[id];
      while (current?.parentId) {
        visibleIds.add(current.parentId);
        current = graph.byId[current.parentId];
      }
    }
    return base.filter((node) => visibleIds.has(node.id));
  }

  return base.filter((node) => {
    if (node.isRoot || node.id === focusId) return true;
    let parentId = node.parentId;
    while (parentId) {
      if (!expandedIds.has(parentId)) return false;
      parentId = graph.byId[parentId]?.parentId;
    }
    return true;
  });
}

function subtreeWeight(
  graph: VisualBomGraph,
  id: string,
  visibleIds: Set<string>,
): number {
  const node = graph.byId[id];
  if (!node || !visibleIds.has(id)) return 0;
  const children = node.childIds.filter((childId) => visibleIds.has(childId));
  if (!children.length) return 1;
  return Math.max(
    1,
    children.reduce(
      (sum, childId) => sum + subtreeWeight(graph, childId, visibleIds),
      0,
    ),
  );
}

export function layoutConstellation(
  visibleNodes: VisualBomNode[],
  graph: VisualBomGraph,
  focusId: string | null,
  width = 1120,
  height = 760,
): PositionedVisualNode[] {
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const effectiveRootId = focusId ?? graph.rootId;
  const centerX = width / 2;
  const centerY = height / 2;
  const result: PositionedVisualNode[] = [];
  const maxVisibleLevel = Math.max(
    ...visibleNodes.map((node) => node.level),
    0,
  );
  const rootLevel = graph.byId[effectiveRootId]?.level ?? 0;
  const levelCount = Math.max(1, maxVisibleLevel - rootLevel);
  const usableRadius = Math.min(width, height) * 0.39;
  const levelGap = Math.max(145, usableRadius / levelCount);

  const place = (
    id: string,
    startAngle: number,
    endAngle: number,
    relativeLevel: number,
  ) => {
    const node = graph.byId[id];
    if (!node || !visibleIds.has(id)) return;

    const angle = (startAngle + endAngle) / 2;
    const radialDistance = relativeLevel === 0 ? 0 : levelGap * relativeLevel;
    result.push({
      ...node,
      x: centerX + Math.cos(angle) * radialDistance,
      y: centerY + Math.sin(angle) * radialDistance,
      angle,
      nodeRadius:
        node.isRoot || id === effectiveRootId ? 34 : node.isAssembly ? 25 : 18,
    });

    const children = node.childIds.filter((childId) => visibleIds.has(childId));
    if (!children.length) return;

    const totalWeight = children.reduce(
      (sum, childId) => sum + subtreeWeight(graph, childId, visibleIds),
      0,
    );
    const padding = Math.min(0.07, (endAngle - startAngle) * 0.035);
    let cursor = startAngle;

    for (const childId of children) {
      const weight = subtreeWeight(graph, childId, visibleIds);
      const portion = (endAngle - startAngle) * (weight / totalWeight);
      const childStart = cursor + padding;
      const childEnd = cursor + portion - padding;
      place(
        childId,
        childStart,
        Math.max(childStart + 0.02, childEnd),
        relativeLevel + 1,
      );
      cursor += portion;
    }
  };

  place(
    effectiveRootId,
    -Math.PI / 2 - Math.PI,
    -Math.PI / 2 + Math.PI,
    0,
  );

  return result;
}

export function ancestors(
  graph: VisualBomGraph,
  id: string | null,
): VisualBomNode[] {
  if (!id) return [];

  const result: VisualBomNode[] = [];
  let current: VisualBomNode | undefined = graph.byId[id];

  while (current) {
    result.unshift(current);

    const parentId: string | undefined = current.parentId;
    current = parentId ? graph.byId[parentId] : undefined;
  }

  return result;
}


export function descendants(graph: VisualBomGraph, id: string | null) {
  if (!id) return [];
  const result: VisualBomNode[] = [];
  const visit = (currentId: string) => {
    for (const childId of graph.byId[currentId]?.childIds ?? []) {
      const child = graph.byId[childId];
      if (child) {
        result.push(child);
        visit(childId);
      }
    }
  };
  visit(id);
  return result;
}

export function relationshipState(graph: VisualBomGraph, id: string | null) {
  const ancestorIds = new Set(ancestors(graph, id).map((node) => node.id));
  const descendantIds = new Set(descendants(graph, id).map((node) => node.id));
  const selected = id ? graph.byId[id] : undefined;
  const siblingIds = new Set(
    selected?.parentId
      ? graph.byId[selected.parentId]?.childIds.filter(
          (childId) => childId !== id,
        ) ?? []
      : [],
  );
  return { ancestorIds, descendantIds, siblingIds };
}
