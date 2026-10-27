export interface RelationshipApplicationPair {
  sourceApplication: string;
  targetApplication: string;
}

export interface RelationshipGuidanceSection extends RelationshipApplicationPair {
  heading: string;
  content: string;
}

function normalizeApplication(application: string): string {
  return application.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function pairKey(pair: RelationshipApplicationPair): string {
  return `${normalizeApplication(pair.sourceApplication)}\u0000${normalizeApplication(pair.targetApplication)}`;
}

export function parseRelationshipGuidance(markdown: string): readonly RelationshipGuidanceSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: RelationshipGuidanceSection[] = [];

  for (let index = 0; index < lines.length; index++) {
    const headingLine = lines[index];
    const match = headingLine.match(/^###\s+(?:\d+(?:\.\d+)?\s+)?(.+?)\s+to\s+(.+?)\s*$/i);
    if (!match) continue;

    let end = index + 1;
    while (end < lines.length && !/^#{1,3}\s/.test(lines[end])) end++;
    const content = lines.slice(index + 1, end).join("\n").trim();

    if (content) {
      sections.push({
        sourceApplication: match[1].trim(),
        targetApplication: match[2].trim(),
        heading: headingLine.replace(/^###\s+/, "").trim(),
        content,
      });
    }

    index = end - 1;
  }

  return sections;
}

export function selectRelationshipGuidance(
  sections: readonly RelationshipGuidanceSection[],
  pairs: readonly RelationshipApplicationPair[],
): readonly RelationshipGuidanceSection[] {
  const requestedPairs = new Set(
    pairs
      .filter((pair) => pair.sourceApplication.trim() && pair.targetApplication.trim())
      .map(pairKey),
  );
  return sections.filter((section) => requestedPairs.has(pairKey(section)));
}
