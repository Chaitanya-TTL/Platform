import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAssistantMessage: {
    MarkdownRenderer: ({ content }: { content: string }) => createElement("div", null, content),
  },
}));

import { formatAnswerCitations } from "../CopilotAnswerContent";
import type { CopilotCitation } from "../../copilot/contracts";
import ThoughtLine from "../ThoughtLine";

const citations: CopilotCitation[] = [
  {
    citationId: "cite:entity:entity%3A1",
    kind: "entity",
    label: "Bracket [assembly]",
  },
];

describe("Copilot answer content", () => {
  it("maps only exact citation markers to readable validated labels", () => {
    expect(
      formatAnswerCitations(
        "The record matches (cite:entity:entity%3A1).",
        citations,
      ),
    ).toBe("The record matches [Bracket \\[assembly\\]](https://lattice.invalid/citation/cite%3Aentity%3Aentity%253A1).");
  });

  it("preserves malformed and unmatched citation markers as plain text", () => {
    expect(
      formatAnswerCitations(
        "(cite:entity:unknown) (cite:relationship:entity%3A1) (cite:entity:)",
        citations,
      ),
    ).toBe("(cite:entity:unknown) (cite:relationship:entity%3A1) (cite:entity:)");
  });

  it("renders a readable, accessible working thought line", () => {
    const markup = renderToStaticMarkup(
      <ThoughtLine
        label="Thinking…"
        color="#e2e8f0"
        glyph={<span aria-hidden="true">orb</span>}
        working
        showTimer={false}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Thinking…");
    expect(markup).toContain("--thought-ink:#e2e8f0");
  });
});
