import type { SourceType, TreeNodeData } from "@/types/bom-comparison";
import type {
  CrossBomImpactResult,
  ImpactBomResult,
  ImpactMatchReason,
  ImpactOccurrence,
} from "@/types/bom-impact";
function value(node: TreeNodeData, keys: string[]) {
  for (const k of keys) {
    const v = node.attributes?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return undefined;
}
export function impactPresentation(node: TreeNodeData, source: SourceType) {
  const quantity = value(node, ["Qty", "Quantity"]),
    revision = value(node, ["Rev ID", "Revision"]);
  if (source === "teamcenter") {
    const itemId = value(node, ["Item ID"]);
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
    const productId = value(node, ["Product ID"]);
    const raw = productId || node.name.trim().replace(/^Product\s+/i, "");
    const match = raw.match(/^(.*)_([A-Za-z0-9]+)$/);
    return {
      name: match?.[1]?.trim() || raw,
      itemId: match?.[2] || productId,
      quantity,
      revision,
    };
  }
  return {
    name: node.name.trim(),
    itemId:
      value(node, ["Number", "Part Number", "Item ID"]) ||
      node.id.match(/-([A-Za-z0-9]+)$/)?.[1],
    quantity,
    revision,
  };
}
const normId = (v?: string) =>
  v?.trim().toLowerCase().replace(/\s+/g, "") || undefined;
const normName = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
function flatten(root: TreeNodeData, source: SourceType) {
  const rows: Array<{
    node: TreeNodeData;
    path: string[];
    parentName?: string;
  }> = [];
  const walk = (node: TreeNodeData, path: string[], parentName?: string) => {
    const shown = impactPresentation(node, source);
    const next = [...path, shown.name];
    rows.push({ node, path: next, parentName });
    for (const child of node.children ?? []) walk(child, next, shown.name);
  };
  walk(root, []);
  return rows;
}
function occurrence(
  source: SourceType,
  node: TreeNodeData,
  path: string[],
  parentName: string | undefined,
  matchReason: ImpactMatchReason,
): ImpactOccurrence {
  const shown = impactPresentation(node, source);
  return {
    source,
    nodeId: node.id,
    name: shown.name,
    itemId: shown.itemId,
    quantity: shown.quantity,
    revision: shown.revision,
    parentName,
    path,
    matchReason,
    confidence: matchReason === "exact-item-id" ? 1 : 0.88,
  };
}
export function searchPartAcrossBoms(
  selectedSource: SourceType,
  selectedNode: TreeNodeData,
  loadedBoms: Partial<Record<SourceType, TreeNodeData>>,
): CrossBomImpactResult {
  const selected = impactPresentation(selectedNode, selectedSource),
    selectedId = normId(selected.itemId),
    selectedName = normName(selected.name);
  const searchedSources = (Object.keys(loadedBoms) as SourceType[]).filter(
    (s) => loadedBoms[s],
  );
  const results: ImpactBomResult[] = searchedSources.map((source) => {
    const root = loadedBoms[source];
    if (!root) return { source, found: false, occurrences: [] };
    const occurrences = flatten(root, source).flatMap((row) => {
      const shown = impactPresentation(row.node, source),
        candidateId = normId(shown.itemId);
      const exact = Boolean(
        selectedId && candidateId && selectedId === candidateId,
      );
      const fallback = !selectedId && normName(shown.name) === selectedName;
      if (!exact && !fallback) return [];
      return [
        occurrence(
          source,
          row.node,
          row.path,
          row.parentName,
          exact ? "exact-item-id" : "exact-normalized-name",
        ),
      ];
    });
    return { source, found: occurrences.length > 0, occurrences };
  });
  const occurrences = results.flatMap((r) => r.occurrences),
    foundSources = results.filter((r) => r.found).map((r) => r.source),
    missingSources = results.filter((r) => !r.found).map((r) => r.source);
  const observations = [
    `Part exists in ${foundSources.length} of ${searchedSources.length} loaded BOMs.`,
  ];
  if (occurrences.length > foundSources.length)
    observations.push(
      `${occurrences.length} total occurrences indicate reuse within at least one BOM.`,
    );
  if (missingSources.length)
    observations.push(`Part was not found in: ${missingSources.join(", ")}.`);
  const quantities = new Set(
      occurrences.map((x) => x.quantity).filter(Boolean),
    ),
    revisions = new Set(occurrences.map((x) => x.revision).filter(Boolean)),
    parents = new Set(occurrences.map((x) => x.parentName).filter(Boolean));
  if (quantities.size > 1)
    observations.push(`Quantity differs: ${[...quantities].join(", ")}.`);
  if (revisions.size > 1)
    observations.push(`Revision differs: ${[...revisions].join(", ")}.`);
  if (parents.size > 1)
    observations.push(`Parent assembly differs: ${[...parents].join(", ")}.`);
  if (!selectedId)
    observations.push(
      "Matching used exact normalized name because the selected part has no Item ID.",
    );
  return {
    selectedSource,
    selectedNodeId: selectedNode.id,
    selectedName: selected.name,
    selectedItemId: selected.itemId,
    searchedSources,
    foundSources,
    missingSources,
    totalOccurrences: occurrences.length,
    results,
    occurrences,
    observations,
    generatedAt: new Date().toISOString(),
  };
}
