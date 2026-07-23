import raw from "@/data/hardcoded-part-requirements.json";
import { findMatchingPart, partIdentity } from "@/lib/requirement-part-matcher";
import type { SourceType, TreeNodeData } from "@/types/bom-comparison";
import type { PartRequirementRecord, RequirementTraceResult } from "@/types/requirement-trace";

const records = raw.records as PartRequirementRecord[];
function recordFor(source: SourceType, node: TreeNodeData) {
  const identity = partIdentity(node, source);
  return records.find((record) => record.source === source && (
    record.partId.toUpperCase() === identity.partId ||
    record.aliases?.some((alias) => alias.toLowerCase() === node.id.toLowerCase()) ||
    record.partName.toLowerCase() === identity.name.toLowerCase()
  ));
}
export function localRequirement(source: SourceType, node: TreeNodeData) {
  return recordFor(source, node) ?? null;
}
export function traceRequirements(selectedSource: SourceType, node: TreeNodeData, loadedBoms: Partial<Record<SourceType, TreeNodeData>>): RequirementTraceResult {
  const selected = partIdentity(node, selectedSource);
  const sources: RequirementTraceResult["sources"] = [];
  for (const [source, root] of Object.entries(loadedBoms) as [SourceType, TreeNodeData][]) {
    const match = findMatchingPart(root, source, selected.partId, selected.name);
    if (!match) continue;
    const record = recordFor(source, match.node);
    if (record) sources.push({ ...record, loaded: true, nodeId: match.node.id, confidence: match.confidence, matchReason: match.reason });
  }
  return {
    selectedSource, selectedNode: node, selectedPartId: selected.partId,
    selectedPartName: selected.name, sources,
    totalRevisions: sources.reduce((total, source) => total + source.revisions.length, 0),
    generatedAt: new Date().toISOString(),
  };
}
