import type { DataQualityFinding, DataQualitySummary } from "@/types/bom-data-quality";
import type { VisualBomGraph } from "@/types/bom-visualization";

export function scanBomDataQuality(graph: VisualBomGraph): DataQualitySummary {
  const findings: DataQualityFinding[] = [];
  const add = (finding: DataQualityFinding) => findings.push(finding);

  for (const node of graph.nodes) {
    if (!node.itemId) add({ id: `missing-id:${node.id}`, nodeId: node.id, sourceNodeId: node.sourceNodeId, category: "missing-item-id", severity: "critical", title: "Missing business identifier", detail: `${node.name} has no normalized Item ID or part number.`, recommendation: "Map the source identifier into the canonical Item ID field." });
    if (!node.revision) add({ id: `missing-revision:${node.id}`, nodeId: node.id, sourceNodeId: node.sourceNodeId, category: "missing-revision", severity: "info", title: "Revision not available", detail: `No revision value is available for ${node.name}.`, recommendation: "Confirm whether the source payload exposes revision or iteration metadata." });
    if (!node.quantity && !node.isRoot) add({ id: `missing-quantity:${node.id}`, nodeId: node.id, sourceNodeId: node.sourceNodeId, category: "missing-quantity", severity: "info", title: "Quantity not available", detail: `No occurrence quantity is available for ${node.name}.`, recommendation: "Expose quantity and unit of measure from the source relationship." });
    if (/\u00a0|\s{2,}|\s$/.test(node.name)) add({ id: `whitespace:${node.id}`, nodeId: node.id, sourceNodeId: node.sourceNodeId, category: "whitespace", severity: "warning", title: "Whitespace anomaly", detail: "The display name contains repeated, trailing, or non-breaking whitespace.", recommendation: "Normalize whitespace during source transformation while preserving the original value for auditing." });
    if (node.name.length > 72) add({ id: `long-label:${node.id}`, nodeId: node.id, sourceNodeId: node.sourceNodeId, category: "long-label", severity: "info", title: "Long product label", detail: `${node.name.length} characters can reduce readability in visual views.`, recommendation: "Provide a short display name or controlled abbreviation." });
    if (node.isAssembly && node.descendantCount >= 15) add({ id: `complex:${node.id}`, nodeId: node.id, sourceNodeId: node.sourceNodeId, category: "complex-branch", severity: "warning", title: "High-complexity branch", detail: `${node.name} contains ${node.descendantCount} descendants.`, recommendation: "Review branch ownership, configuration alternatives, and decomposition quality." });
  }

  for (const [sourceNodeId, occurrenceIds] of Object.entries(graph.bySourceNodeId)) {
    if (occurrenceIds.length > 1) for (const nodeId of occurrenceIds) {
      const node = graph.byId[nodeId];
      add({ id: `repeated:${nodeId}`, nodeId, sourceNodeId, category: "repeated-source-object", severity: "warning", title: "Repeated source object", detail: `${node?.name ?? sourceNodeId} appears in ${occurrenceIds.length} separate BOM occurrences.`, recommendation: "Verify whether the repetition is intentional reuse or a duplicate extraction record." });
    }
  }

  for (const parent of graph.nodes.filter((node) => node.childIds.length > 1)) {
    const groups = new Map<string, string[]>();
    for (const childId of parent.childIds) { const child = graph.byId[childId]; if (!child) continue; const key = child.name.trim().toLowerCase().replace(/\s+/g, " "); groups.set(key, [...(groups.get(key) ?? []), childId]); }
    for (const ids of groups.values()) if (ids.length > 1) for (const nodeId of ids) {
      const child = graph.byId[nodeId];
      add({ id: `duplicate-name:${nodeId}`, nodeId, sourceNodeId: child.sourceNodeId, category: "duplicate-sibling-name", severity: "warning", title: "Duplicate sibling name", detail: `${child.name} occurs ${ids.length} times below ${parent.name}.`, recommendation: "Confirm occurrence identity, quantity, configuration context, and source extraction rules." });
    }
  }

  const critical = findings.filter((item) => item.severity === "critical").length, warning = findings.filter((item) => item.severity === "warning").length, info = findings.filter((item) => item.severity === "info").length;
  const penalty = critical * 6 + warning * 2.5 + info * 0.35, score = Math.max(0, Math.round(100 - penalty / Math.max(1, graph.nodes.length) * 10));
  const findingIdsByNode: Record<string, string[]> = {};
  for (const finding of findings) (findingIdsByNode[finding.nodeId] ??= []).push(finding.id);
  return { score, total: findings.length, critical, warning, info, findings, findingIdsByNode };
}
