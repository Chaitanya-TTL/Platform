import { scanBomDataQuality } from "@/lib/bom-data-quality";
import { descendants } from "@/lib/bom-visualization";
import type { NodeComparison } from "@/types/bom-comparison";
import type { ReverseRequirementTraceResult } from "@/types/requirement-trace";
import type { BranchComparisonSummary, RequirementCoverage, ThreeAnalysisSnapshot, ThreeBranchAnalytics } from "@/types/bom-three";
import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

const rank = { matched: 0, probable: 1, changed: 2, missing: 3, "source-only": 3 } as const;
function comparisonSummary(nodes: VisualBomNode[], comparisons?: Record<string, NodeComparison>): BranchComparisonSummary {
  const values = nodes.map((node) => comparisons?.[node.sourceNodeId]).filter((value): value is NodeComparison => Boolean(value));
  const summary: BranchComparisonSummary = { total: values.length, matched: 0, changed: 0, missing: 0, sourceOnly: 0, probable: 0, health: 100 };
  for (const value of values) { if (value.status === "matched") summary.matched++; if (value.status === "changed") summary.changed++; if (value.status === "missing") summary.missing++; if (value.status === "source-only") summary.sourceOnly++; if (value.status === "probable") summary.probable++; if (!summary.worstStatus || rank[value.status] > rank[summary.worstStatus]) summary.worstStatus = value.status; }
  summary.health = values.length ? Math.round(summary.matched / values.length * 100) : 100; return summary;
}
function complexity(node: VisualBomNode, comparison: BranchComparisonSummary, qualityCount: number, maxDescendants: number) {
  const structural = node.childIds.length * 4 + Math.sqrt(node.descendantCount) * 12 + node.level * 3;
  const risk = comparison.changed * 5 + comparison.missing * 9 + comparison.sourceOnly * 8 + comparison.probable * 4 + qualityCount * 2;
  return Math.min(100, Math.round((structural + risk) / Math.max(1, 1 + Math.sqrt(maxDescendants) * 0.15)));
}
export function buildThreeAnalysis(graph: VisualBomGraph, comparisons?: Record<string, NodeComparison>, requirementFocus?: ReverseRequirementTraceResult | null): ThreeAnalysisSnapshot {
  const quality = scanBomDataQuality(graph), linkedSourceIds = new Set(requirementFocus?.occurrences.filter((item) => item.source === graph.nodes[0]?.source).map((item) => item.nodeId) ?? []), maxDescendants = Math.max(1, ...graph.nodes.map((node) => node.descendantCount));
  const complexityByNode: Record<string, number> = {}, comparisonByNode: Record<string, BranchComparisonSummary> = {}, requirementCoverageByNode: Record<string, RequirementCoverage> = {};
  for (const node of graph.nodes) { const branch = [node, ...descendants(graph, node.id)], comparison = comparisonSummary(branch, comparisons), qualityCount = branch.reduce((sum, item) => sum + (quality.findingIdsByNode[item.id]?.length ?? 0), 0), linked = branch.filter((item) => linkedSourceIds.has(item.sourceNodeId)).length; comparisonByNode[node.id] = comparison; complexityByNode[node.id] = complexity(node, comparison, qualityCount, maxDescendants); requirementCoverageByNode[node.id] = { linked, total: branch.length, percentage: branch.length ? Math.round(linked / branch.length * 100) : 0 }; }
  return { quality, complexityByNode, comparisonByNode, requirementCoverageByNode };
}
export function branchAnalytics(graph: VisualBomGraph, nodeId: string, analysis: ThreeAnalysisSnapshot): ThreeBranchAnalytics | null {
  const node = graph.byId[nodeId]; if (!node) return null;
  const comparison = analysis.comparisonByNode[nodeId], coverage = analysis.requirementCoverageByNode[nodeId], qualityCount = [node, ...descendants(graph, nodeId)].reduce((sum, entry) => sum + (analysis.quality.findingIdsByNode[entry.id]?.length ?? 0), 0), branchShare = Math.round((node.descendantCount + 1) / Math.max(1, graph.nodes.length) * 1000) / 10;
  const summary = [`${node.name} is a level-${node.level + 1} ${node.isAssembly ? "assembly" : "component"} representing ${branchShare}% of the loaded BOM.`];
  if (node.isAssembly) summary.push(`The branch contains ${node.childIds.length} direct children, ${node.descendantCount} total descendants, and ${node.leafCount} leaf components.`);
  if (comparison.total) summary.push(`Comparison health is ${comparison.health}% with ${comparison.changed} changed, ${comparison.missing} missing, ${comparison.sourceOnly} source-only, and ${comparison.probable} probable result${comparison.total === 1 ? "" : "s"}.`);
  summary.push(coverage.linked ? `${coverage.linked} of ${coverage.total} branch occurrences are linked by the active requirement focus.` : "No active requirement-linked occurrences are present in this branch.");
  if (qualityCount) summary.push(`${qualityCount} data-quality observation${qualityCount === 1 ? " requires" : "s require"} review in this branch.`);
  return { node, branchShare, directChildren: node.childIds.length, totalDescendants: node.descendantCount, leafDescendants: node.leafCount, complexity: analysis.complexityByNode[nodeId], comparison, requirementCoverage: coverage, qualityFindingCount: qualityCount, summary };
}
