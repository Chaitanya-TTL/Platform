import type { ProjectedNode } from "../contracts/projection";
const MIN_WIDTH = 216;
const MAX_WIDTH = 440;
const textWidth = (value: string) => Math.ceil([...value].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 11.5 : 8.25), 0));
export function projectedNodeDimensions(node: ProjectedNode) {
  const value = typeof node.attributes?.value === "string" ? node.attributes.value : "";
  const identifier = typeof node.attributes?.requirementId === "string" ? node.attributes.requirementId : node.nativeIdentifier ?? "";
  const longest = [node.label, node.subtitle, value, identifier].reduce((a, b) => textWidth(String(b)) > textWidth(String(a)) ? String(b) : String(a), "");
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, textWidth(longest) + 96));
  const available = width - 96;
  const titleLines = textWidth(node.label) > available ? 2 : 1;
  const valueLines = !value ? 0 : textWidth(value) > available ? 2 : 1;
  const height = node.id.startsWith("projection:domain:") ? 84 : node.level === 0 ? 124 : Math.max(84, 68 + (titleLines - 1) * 20 + valueLines * 20);
  return { width, height };
}
