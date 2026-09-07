import type { ProjectedNode } from "../contracts/projection";
const MIN_WIDTH = 196;
const MAX_WIDTH = 440;
const textWidth = (value: string) => Math.ceil([...value].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 10 : 7.4), 0));
export function projectedNodeDimensions(node: ProjectedNode) {
  const value = typeof node.attributes?.value === "string" ? node.attributes.value : "";
  const identifier = typeof node.attributes?.requirementId === "string" ? node.attributes.requirementId : node.nativeIdentifier ?? "";
  const longest = [node.label, node.subtitle, value, identifier].reduce((a, b) => textWidth(String(b)) > textWidth(String(a)) ? String(b) : String(a), "");
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, textWidth(longest) + 88));
  const available = width - 88;
  const titleLines = textWidth(node.label) > available ? 2 : 1;
  const valueLines = !value ? 0 : textWidth(value) > available ? 2 : 1;
  const height = node.id.startsWith("projection:domain:") ? 76 : node.level === 0 ? 112 : Math.max(76, 60 + (titleLines - 1) * 18 + valueLines * 18);
  return { width, height };
}
