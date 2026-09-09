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
  const value =
    typeof node.attributes?.value === "string"
      ? node.attributes.value
      : "";

  const identifier =
    typeof node.attributes?.requirementId === "string"
      ? node.attributes.requirementId
      : (node.nativeIdentifier ?? "");

  const longest = [node.label, node.subtitle, value, identifier].reduce(
    (current, candidate) =>
      textWidth(String(candidate)) > textWidth(String(current))
        ? String(candidate)
        : String(current),
    "",
  );

  const isDomain = node.id.startsWith("projection:domain:");
  const isSubject = node.level === 0;
  const isParent = node.hasChildren;

  if (isSubject) {
    return { width: SUBJECT_WIDTH, height: SUBJECT_HEIGHT };
  }

  if (isDomain) {
    return { width: DOMAIN_WIDTH, height: DOMAIN_HEIGHT };
  }

  const minWidth = isParent ? PARENT_MIN_WIDTH : LEAF_MIN_WIDTH;
  const maxWidth = isParent ? PARENT_MAX_WIDTH : LEAF_MAX_WIDTH;
  const minHeight = isParent ? PARENT_MIN_HEIGHT : LEAF_MIN_HEIGHT;
  const horizontalPadding = isParent
    ? PARENT_HORIZONTAL_PADDING
    : LEAF_HORIZONTAL_PADDING;

  const width = Math.max(
    minWidth,
    Math.min(maxWidth, textWidth(longest) + horizontalPadding),
  );

  const availableTextWidth = Math.max(1, width - horizontalPadding);
  const titleLines = lineCount(node.label, availableTextWidth);
  const valueLines = lineCount(value, availableTextWidth);
  const identifierLines = lineCount(identifier, availableTextWidth, 1);

  const calculatedHeight =
    78 +
    titleLines * 35 +
    valueLines * 32 +
    identifierLines * 23;

  return {
    width,
    height: Math.max(minHeight, calculatedHeight),
  };
}
