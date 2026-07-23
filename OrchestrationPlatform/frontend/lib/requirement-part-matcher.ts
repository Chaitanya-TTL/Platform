import { normalizeName, sourcePresentation } from "@/lib/bom-comparison";
import type { SourceType, TreeNodeData } from "@/types/bom-comparison";

export function partIdentity(node: TreeNodeData, source: SourceType) {
  const presented = sourcePresentation(node, source);
  return {
    partId: presented.itemId?.toUpperCase(),
    name: presented.name,
    normalizedName: normalizeName(presented.name),
  };
}

export function findMatchingPart(root: TreeNodeData, source: SourceType, partId: string | undefined, name: string) {
  let exact: TreeNodeData | null = null;
  let normalized: TreeNodeData | null = null;
  const targetName = normalizeName(name);
  const visit = (node: TreeNodeData) => {
    const current = partIdentity(node, source);
    if (partId && current.partId === partId.toUpperCase()) exact = node;
    if (!normalized && current.normalizedName === targetName) normalized = node;
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  if (exact) return { node: exact, confidence: 1, reason: "exact-item-id" as const };
  if (normalized) return { node: normalized, confidence: 0.82, reason: "normalized-name" as const };
  return null;
}
