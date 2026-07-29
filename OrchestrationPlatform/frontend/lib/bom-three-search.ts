import type { ThreeSearchResult } from "@/types/bom-three";
import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";

type Predicate = (node: VisualBomNode) => boolean;
function parseFilter(token: string): Predicate | null {
  const [rawKey, ...valueParts] = token.split(":"); if (!valueParts.length) return null;
  const key = rawKey.toLowerCase(), value = valueParts.join(":").toLowerCase();
  if (key === "status") return (node) => (node.comparisonStatus ?? "none") === value;
  if (key === "type") return (node) => value === "assembly" ? node.isAssembly : value === "component" || value === "leaf" ? !node.isAssembly : true;
  if (key === "id") return (node) => `${node.itemId ?? ""} ${node.sourceNodeId}`.toLowerCase().includes(value);
  if (key === "level") return (node) => node.level + 1 === Number(value);
  if (key === "children") { const match = value.match(/^(>=|<=|>|<|=)?(\d+)$/); if (!match) return null; const count = Number(match[2]), operator = match[1] ?? "="; return (node) => operator === ">" ? node.childIds.length > count : operator === "<" ? node.childIds.length < count : operator === ">=" ? node.childIds.length >= count : operator === "<=" ? node.childIds.length <= count : node.childIds.length === count; }
  return null;
}
export function searchThreeBom(graph: VisualBomGraph, query: string): ThreeSearchResult[] {
  const normalized = query.trim(); if (!normalized) return [];
  const tokens = normalized.split(/\s+/), filters = tokens.map(parseFilter).filter((item): item is Predicate => Boolean(item)), textTokens = tokens.filter((token) => !parseFilter(token)).map((token) => token.toLowerCase());
  return graph.nodes.flatMap((node) => {
    if (!filters.every((filter) => filter(node))) return [];
    const fields = { name: node.name.toLowerCase(), itemId: (node.itemId ?? "").toLowerCase(), path: node.path.join(" ").toLowerCase(), sourceId: node.sourceNodeId.toLowerCase() };
    const matchedBy: string[] = []; let score = filters.length * 3;
    for (const token of textTokens) { if (fields.itemId === token || fields.sourceId.endsWith(token)) { score += 10; matchedBy.push("Item ID"); } else if (fields.name.includes(token)) { score += 6; matchedBy.push("Name"); } else if (fields.path.includes(token)) { score += 3; matchedBy.push("Path"); } else return []; }
    return [{ nodeId: node.id, score, matchedBy: [...new Set(matchedBy)] }];
  }).sort((left, right) => right.score - left.score || graph.byId[left.nodeId].level - graph.byId[right.nodeId].level);
}
