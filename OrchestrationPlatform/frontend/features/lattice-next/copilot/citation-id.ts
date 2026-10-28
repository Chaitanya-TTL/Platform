import type { CopilotCitation } from "./contracts";

export type NavigableCitationTarget =
  | { kind: "entity"; id: string }
  | { kind: "relationship"; id: string };

export function parseNavigableCitationId(
  citation: Pick<CopilotCitation, "kind" | "citationId">,
): NavigableCitationTarget | undefined {
  if (citation.kind !== "entity" && citation.kind !== "relationship") {
    return undefined;
  }

  const prefix = `cite:${citation.kind}:`;
  if (!citation.citationId.startsWith(prefix)) return undefined;

  const encodedId = citation.citationId.slice(prefix.length);
  if (!encodedId) return undefined;

  try {
    const id = decodeURIComponent(encodedId);
    if (!id || encodeURIComponent(id) !== encodedId) return undefined;
    return { kind: citation.kind, id };
  } catch {
    return undefined;
  }
}
