import raw from "@/data/hardcoded-part-requirements.json";
import { findMatchingPart, partIdentity } from "@/lib/requirement-part-matcher";
import type { SourceType, TreeNodeData } from "@/types/bom-comparison";
import type {
  PartRequirementRecord,
  RequirementCatalogEntry,
  RequirementTraceResult,
  ReverseRequirementTraceResult,
} from "@/types/requirement-trace";

export const requirementRecords = raw.records as PartRequirementRecord[];

function recordFor(source: SourceType, node: TreeNodeData) {
  const identity = partIdentity(node, source);
  return requirementRecords.find(
    (record) =>
      record.source === source &&
      (record.partId.toUpperCase() === identity.partId ||
        record.aliases?.some((alias) => alias.toLowerCase() === node.id.toLowerCase()) ||
        record.partName.toLowerCase() === identity.name.toLowerCase()),
  );
}

export function traceRequirements(
  selectedSource: SourceType,
  node: TreeNodeData,
  loaded: Partial<Record<SourceType, TreeNodeData>>,
): RequirementTraceResult {
  const selected = partIdentity(node, selectedSource);
  const sources: RequirementTraceResult["sources"] = [];

  for (const [source, root] of Object.entries(loaded) as [SourceType, TreeNodeData][]) {
    const match = findMatchingPart(root, source, selected.partId, selected.name);
    if (!match) continue;
    const record = recordFor(source, match.node);
    if (record) {
      sources.push({
        ...record,
        loaded: true,
        nodeId: match.node.id,
        confidence: match.confidence,
        matchReason: match.reason,
      });
    }
  }

  return {
    selectedSource,
    selectedNode: node,
    selectedPartId: selected.partId,
    selectedPartName: selected.name,
    sources,
    totalRevisions: sources.reduce((total, source) => total + source.revisions.length, 0),
    generatedAt: new Date().toISOString(),
  };
}

export function requirementCatalog(
  loaded: Partial<Record<SourceType, TreeNodeData>>,
): RequirementCatalogEntry[] {
  const active = new Set(Object.keys(loaded));
  return requirementRecords
    .filter((record) => active.has(record.source))
    .flatMap((record) => record.revisions.map((revision) => ({ record, revision })))
    .sort((left, right) => right.revision.createdAt.localeCompare(left.revision.createdAt));
}

export function reverseTrace(
  entry: RequirementCatalogEntry,
  loaded: Partial<Record<SourceType, TreeNodeData>>,
): ReverseRequirementTraceResult {
  const occurrences: ReverseRequirementTraceResult["occurrences"] = [];

  for (const [source, root] of Object.entries(loaded) as [SourceType, TreeNodeData][]) {
    const match = findMatchingPart(root, source, entry.record.partId, entry.record.partName);
    if (!match) continue;
    const identity = partIdentity(match.node, source);
    occurrences.push({
      source,
      nodeId: match.node.id,
      name: identity.name,
      itemId: identity.partId,
      relationship: source === entry.record.source ? "direct" : "corresponding",
      confidence: match.confidence,
    });
  }

  const searched = Object.keys(loaded) as SourceType[];
  const foundSources = [...new Set(occurrences.map((occurrence) => occurrence.source))];
  return {
    record: entry.record,
    revision: entry.revision,
    occurrences,
    foundSources,
    missingSources: searched.filter((source) => !foundSources.includes(source)),
  };
}
