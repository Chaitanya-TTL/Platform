import type { TreeNodeData } from "@/types/bom-comparison";
import type {
  WindchillChangeImpactResult,
  WindchillNodeImpact,
} from "@/types/windchill-change-impact";
import type {
  WindchillRevisionChange,
  WindchillRevisionComparisonResult,
  WindchillRevisionStatus,
} from "@/types/windchill-revision";

export type ReviewChangeRecord = {
  key: string;
  status: WindchillRevisionStatus;
  itemId: string;
  name: string;
  fromPath?: string | null;
  toPath?: string | null;
  differences: WindchillRevisionChange["differences"];
  branch: string;
};

export type ReviewImpactRecord = {
  nodeId: string;
  name: string;
  itemId?: string;
  partId?: string;
  path: string[];
  impact: WindchillNodeImpact;
};

function nodeMeta(node: TreeNodeData) {
  const attributes = node.attributes ?? {};
  return {
    itemId: String(attributes["Item ID"] ?? "") || undefined,
    partId: String(attributes["Part ID"] ?? "") || undefined,
  };
}

export function indexBom(root: TreeNodeData | null) {
  const byId: Record<string, TreeNodeData> = {};
  const paths: Record<string, string[]> = {};
  if (!root) return { byId, paths };
  const visit = (node: TreeNodeData, path: string[]) => {
    byId[node.id] = node;
    paths[node.id] = [...path, node.name];
    (node.children ?? []).forEach((child) => visit(child, paths[node.id]));
  };
  visit(root, []);
  return { byId, paths };
}

function nameFromPath(path?: string | null) {
  if (!path) return "Unnamed BOM occurrence";
  const parts = path.split(/[\\/→>]+/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? path;
}

function branchFromPath(path?: string | null) {
  if (!path) return "Other changes";
  const parts = path.split(/[\\/→>]+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-2) ?? "Other changes" : "Root structure";
}

export function revisionChangeRecords(result: WindchillRevisionComparisonResult | null): ReviewChangeRecord[] {
  if (!result) return [];
  return result.changes
    .filter((change) => change.status !== "unchanged")
    .map((change, index) => ({
      key: `${change.status}-${change.itemId}-${index}`,
      status: change.status,
      itemId: change.itemId,
      name: nameFromPath(change.toPath || change.fromPath) || change.itemId,
      fromPath: change.fromPath,
      toPath: change.toPath,
      differences: change.differences,
      branch: branchFromPath(change.toPath || change.fromPath),
    }));
}

export function groupedRevisionChanges(records: ReviewChangeRecord[]) {
  return records.reduce<Record<string, ReviewChangeRecord[]>>((groups, record) => {
    (groups[record.branch] ??= []).push(record);
    return groups;
  }, {});
}

export function impactRecords(root: TreeNodeData | null, result: WindchillChangeImpactResult | null) {
  const { byId, paths } = indexBom(root);
  if (!result) return [] as ReviewImpactRecord[];
  return Object.entries(result.impactMap).map(([nodeId, impact]) => {
    const node = byId[nodeId];
    const meta = node ? nodeMeta(node) : {};
    return {
      nodeId,
      name: node?.name ?? meta.itemId ?? nodeId,
      itemId: meta.itemId,
      partId: meta.partId,
      path: paths[nodeId] ?? [],
      impact,
    };
  });
}

export function relatedNoticeNumbers(record: ReviewImpactRecord) {
  return (record.impact.notices ?? [])
    .map((notice) => notice.number)
    .filter((value): value is string => Boolean(value));
}
