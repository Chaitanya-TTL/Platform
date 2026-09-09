import type { NodePosition, RelationshipProjection } from "../contracts/projection";
import type { Size } from "./layout-contract";

const NODE_GAP = 32;
const GROUP_GAP = 56;

function descendants(projection: RelationshipProjection, rootId: string) {
  const outgoing = new Map<string, string[]>();
  for (const edge of projection.edges) {
    if (edge.kind !== "contains" && edge.kind !== "represented-by") continue;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const found = new Set<string>();
  const queue = [...(outgoing.get(rootId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (found.has(id)) continue;
    found.add(id);
    queue.push(...(outgoing.get(id) ?? []));
  }
  return found;
}

export function anchorPinnedSubtrees(
  projection: RelationshipProjection,
  positions: Record<string, NodePosition>,
  dimensions: Record<string, Size>,
  pinned: Readonly<Record<string, NodePosition>>,
) {
  const next = Object.fromEntries(Object.entries(positions).map(([id, point]) => [id, { ...point }]));
  const pinnedIds = new Set(Object.keys(pinned));
  for (const [parentId, target] of Object.entries(pinned)) {
    const calculated = next[parentId];
    if (!calculated) continue;
    const dx = target.x - calculated.x;
    const dy = target.y - calculated.y;
    for (const childId of descendants(projection, parentId)) {
      if (!next[childId] || pinnedIds.has(childId)) continue;
      next[childId] = { x: next[childId].x + dx, y: next[childId].y + dy };
    }
    next[parentId] = { ...target };
  }
  return resolveVisibleCollisions(next, dimensions, pinnedIds);
}

function resolveVisibleCollisions(
  positions: Record<string, NodePosition>,
  dimensions: Record<string, Size>,
  pinnedIds: ReadonlySet<string>,
) {
  const next = { ...positions };
  const ids = Object.keys(next).filter((id) => dimensions[id]).sort();
  for (let pass = 0; pass < 10; pass += 1) {
    let moved = false;
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        const leftId = ids[leftIndex], rightId = ids[rightIndex];
        const left = next[leftId], right = next[rightId];
        const leftSize = dimensions[leftId], rightSize = dimensions[rightId];
        const overlapX = Math.min(left.x + leftSize.width + GROUP_GAP, right.x + rightSize.width + GROUP_GAP) - Math.max(left.x, right.x);
        const overlapY = Math.min(left.y + leftSize.height + NODE_GAP, right.y + rightSize.height + NODE_GAP) - Math.max(left.y, right.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const movableId = pinnedIds.has(rightId) && !pinnedIds.has(leftId) ? leftId : rightId;
        if (pinnedIds.has(movableId)) continue;
        const current = next[movableId];
        next[movableId] = { ...current, y: current.y + overlapY + NODE_GAP };
        moved = true;
      }
    }
    if (!moved) break;
  }
  return next;
}
