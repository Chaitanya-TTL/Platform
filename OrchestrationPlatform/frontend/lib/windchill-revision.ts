import type { TreeNodeData } from "@/types/bom-comparison";
import type {
  WindchillRevisionChange,
  WindchillRevisionComparisonResult,
  WindchillRevisionTrees,
} from "@/types/windchill-revision";
import { getWindchillRoot } from "@/components/BomStreamViewer";

export function revisionTrees(
  result: WindchillRevisionComparisonResult,
): WindchillRevisionTrees | null {
  const fromRoot = getWindchillRoot(result.fromTree);
  const toRoot = getWindchillRoot(result.toTree);
  return fromRoot && toRoot ? { fromRoot, toRoot } : null;
}

export function changesForNode(
  node: TreeNodeData,
  map: Record<string, WindchillRevisionChange>,
) {
  return map[node.id];
}
