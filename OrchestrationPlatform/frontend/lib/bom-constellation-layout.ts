import { ConstellationLayoutMode, ConstellationSpacing, ConstellationLayout, ConstellationNode } from "@/types/bom-constellation";
import type { VisualBomGraph } from "@/types/bom-visualization";

const GAP = {
  compact: { level: 125, sibling: 64 },
  balanced: { level: 180, sibling: 94 },
  expanded: { level: 255, sibling: 138 },
};

export function layoutConstellationGraph(
  graph: VisualBomGraph,
  mode: ConstellationLayoutMode,
  spacing: ConstellationSpacing,
  width = 1400,
  height = 900,
): ConstellationLayout {
  const visibleIds = new Set(graph.nodes.map((node) => node.id));
  const config = GAP[spacing];
  const weights = new Map<string, number>();
  for (let index = graph.nodes.length - 1; index >= 0; index -= 1) {
    const node = graph.nodes[index];
    const children = node.childIds.filter((id) => visibleIds.has(id));
    weights.set(node.id, children.length ? Math.max(1, children.reduce((sum, id) => sum + (weights.get(id) ?? 1), 0)) : 1);
  }
  const weight = (id: string) => weights.get(id) ?? 0;
  const nodes: ConstellationNode[] = [];

  const pushNode = (id: string, x: number, y: number, angle = 0) => {
    const node = graph.byId[id];
    if (!node || !visibleIds.has(id)) return;
    const nodeRadius = node.isRoot ? 30 : node.isAssembly ? 22 : 13;
    nodes.push({
      ...node,
      x,
      y,
      angle,
      nodeRadius,
      targetX: x,
      targetY: y,
      complexity: Math.min(
        100,
        Math.round(
          node.childIds.length * 5 +
            Math.sqrt(node.descendantCount) * 14 +
            node.level * 3,
        ),
      ),
    });
  };

  if (mode === "horizontal" || mode === "vertical") {
    const levels = new Map<number, string[]>();
    for (const node of graph.nodes) {
      const current = levels.get(node.level) ?? [];
      current.push(node.id);
      levels.set(node.level, current);
    }

    for (const [level, ids] of levels) {
      ids.sort((a, b) =>
        graph.byId[a].path.join("/").localeCompare(graph.byId[b].path.join("/")),
      );
      ids.forEach((id, index) => {
        const cross = (index - (ids.length - 1) / 2) * config.sibling;
        const main = (level + 1) * config.level;
        pushNode(
          id,
          mode === "horizontal" ? main : width / 2 + cross,
          mode === "horizontal" ? height / 2 + cross : main,
        );
      });
    }
  } else {
    const centreX = width / 2;
    const centreY = height / 2;
    const root = graph.byId[graph.rootId];
    pushNode(graph.rootId, centreX, centreY);

    const placeBranch = (
      id: string,
      startAngle: number,
      endAngle: number,
      relativeLevel: number,
      branchCentre?: [number, number],
    ) => {
      const node = graph.byId[id];
      if (!node || !visibleIds.has(id)) return;
      const angle = (startAngle + endAngle) / 2;
      let x = centreX + Math.cos(angle) * config.level * relativeLevel;
      let y = centreY + Math.sin(angle) * config.level * relativeLevel;

      if (
        mode === "radial-clusters" &&
        relativeLevel > 1 &&
        branchCentre
      ) {
        const clusterRadius =
          config.sibling *
          Math.max(0.82, Math.sqrt(node.siblingCount + 1) / 2.1);
        x =
          branchCentre[0] +
          Math.cos(angle) * clusterRadius * (relativeLevel - 1);
        y =
          branchCentre[1] +
          Math.sin(angle) * clusterRadius * (relativeLevel - 1);
      }

      pushNode(id, x, y, angle);
      const children = node.childIds.filter((childId) =>
        visibleIds.has(childId),
      );
      const totalWeight = children.reduce(
        (total, childId) =>
          total + weight(childId),
        0,
      );
      let cursor = startAngle;
      for (const childId of children) {
        const span =
          (endAngle - startAngle) *
          (weight(childId) /
            Math.max(1, totalWeight));
        placeBranch(
          childId,
          cursor + 0.018,
          cursor + span - 0.018,
          relativeLevel + 1,
          relativeLevel === 1 ? [x, y] : branchCentre,
        );
        cursor += span;
      }
    };

    const branches =
      root?.childIds.filter((childId) => visibleIds.has(childId)) ?? [];
    const totalWeight = branches.reduce(
      (total, childId) =>
        total + weight(childId),
      0,
    );
    let cursor = -Math.PI;
    for (const branchId of branches) {
      const span =
        Math.PI *
        2 *
        (weight(branchId) /
          Math.max(1, totalWeight));
      placeBranch(branchId, cursor + 0.025, cursor + span - 0.025, 1);
      cursor += span;
    }
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.nodeRadius), 0);
  const maxX = Math.max(
    ...nodes.map((node) => node.x + node.nodeRadius),
    width,
  );
  const minY = Math.min(...nodes.map((node) => node.y - node.nodeRadius), 0);
  const maxY = Math.max(
    ...nodes.map((node) => node.y + node.nodeRadius),
    height,
  );

  return {
    graph,
    nodes,
    byId: Object.fromEntries(nodes.map((node) => [node.id, node])),
    width,
    height,
    bounds: { minX, minY, maxX, maxY },
  };
}
