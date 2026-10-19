import type { ProjectedNode } from "../contracts/projection";

const LEAF_MIN_WIDTH = 350;
const LEAF_MAX_WIDTH = 580;
const LEAF_MIN_HEIGHT = 150;

const PARENT_MIN_WIDTH = 590;
const PARENT_MAX_WIDTH = 720;
const PARENT_MIN_HEIGHT = 164;

const DOMAIN_WIDTH = 540;
const DOMAIN_HEIGHT = 112;

const SUBJECT_WIDTH = 520;
const SUBJECT_HEIGHT = 180;

const LEAF_HORIZONTAL_PADDING = 118;
const PARENT_HORIZONTAL_PADDING = 126;

const textWidth = (value: string) =>
  Math.ceil(
    [...value].reduce(
      (sum, char) =>
        sum + (char.charCodeAt(0) > 255 ? 15 : 12.5),
      0,
    ),
  );

const lineCount = (
  value: string,
  availableWidth: number,
  maximumLines = 2,
) => {
  if (!value.trim()) return 0;
  return Math.max(
    1,
    Math.min(maximumLines, Math.ceil(textWidth(value) / availableWidth)),
  );
};

export function projectedNodeDimensions(node: ProjectedNode) {
  const value = typeof node.attributes?.value === "string" ? node.attributes.value : "";
  const identifier = typeof node.attributes?.requirementId === "string" ? node.attributes.requirementId : (node.nativeIdentifier ?? "");
  const role = String(node.attributes?.presentationRole ?? "");
  const isDomain = node.id.startsWith("projection:domain:");
  const isSubject = node.level === 0;
  const isGroup = role === "detail-group";
  const isDescription = role === "description";
  const isDetailLeaf = ["detail-field", "description", "custom-field", "attachment", "view-more"].includes(role);

  if (isSubject) return { width: SUBJECT_WIDTH, height: SUBJECT_HEIGHT };
  if (isDomain) return { width: DOMAIN_WIDTH, height: DOMAIN_HEIGHT };
  if (isGroup) return { width: 360, height: 138 };

  if (isDescription) {
    const normalizedLength = value.replace(/\s+/g, " ").trim().length;
    const width = normalizedLength > 420 ? 720 : normalizedLength > 220 ? 640 : 560;
    return { width, height: 238 };
  }

  if (isDetailLeaf) {
    const width = Math.max(320, Math.min(520, textWidth([node.label, value].sort((a,b)=>textWidth(b)-textWidth(a))[0] ?? "") + 112));
    return { width, height: value.length > 72 ? 174 : 148 };
  }

  const longest = [node.label, node.subtitle, value, identifier].reduce(
    (current, candidate) => textWidth(String(candidate)) > textWidth(String(current)) ? String(candidate) : String(current),
    "",
  );
  const isParent = node.hasChildren;
  const minWidth = isParent ? PARENT_MIN_WIDTH : LEAF_MIN_WIDTH;
  const maxWidth = isParent ? PARENT_MAX_WIDTH : LEAF_MAX_WIDTH;
  const minHeight = isParent ? PARENT_MIN_HEIGHT : LEAF_MIN_HEIGHT;
  const horizontalPadding = isParent ? PARENT_HORIZONTAL_PADDING : LEAF_HORIZONTAL_PADDING;
  const width = Math.max(minWidth, Math.min(maxWidth, textWidth(longest) + horizontalPadding));
  const availableTextWidth = Math.max(1, width - horizontalPadding);
  const calculatedHeight = 78 + lineCount(node.label, availableTextWidth) * 35 + lineCount(value, availableTextWidth) * 32 + lineCount(identifier, availableTextWidth, 1) * 23;
  return { width, height: Math.max(minHeight, calculatedHeight) };
}
