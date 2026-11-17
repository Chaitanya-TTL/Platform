import { createElement, isValidElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const markdownRendererState = vi.hoisted(() => ({
  content: "",
  citationClicks: [] as (() => void)[],
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAssistantMessage: {
    MarkdownRenderer: ({
      content,
      components,
    }: {
      content: string;
      components?: {
        a?: (props: { href?: string; children?: ReactNode; node?: unknown }) => ReactNode;
      };
    }) => {
      markdownRendererState.content = content;
      const citationLinks = [...content.matchAll(/\[([^\]]+)\]\((https:\/\/lattice\.invalid\/citation\/[^)]+)\)/g)];
      if (!citationLinks.length || !components?.a) return createElement("div", null, content);
      const anchors = citationLinks.map((citationLink) =>
        components.a!({ href: citationLink[2], children: citationLink[1] }),
      );
      markdownRendererState.citationClicks = anchors.flatMap((anchor) =>
        isValidElement<{ onClick?: () => void }>(anchor) && anchor.props.onClick
          ? [anchor.props.onClick]
          : [],
      );
      return createElement("div", null, content, ...anchors);
    },
  },
}));

import { CopilotAnswerContent, formatAnswerCitations } from "../CopilotAnswerContent";
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

  it("renders finalized answer content only once", () => {
    const markup = renderToStaticMarkup(
      <CopilotAnswerContent
        content="The validated answer."
        onCitationSelect={vi.fn()}
      />,
    );

    expect(markup.match(/The validated answer\./g)).toHaveLength(1);
  });

  it("renders the persisted balanced Primary entities section without changing its representatives", () => {
    const section = [
      "Primary entities",
      "- Steering System Requirements\n  requirement; Codebeamer",
      "- Steering part 0000003874\n  part-occurrence; Windchill",
      "- Material MAT7893\n  operational material; SAP",
      "- Steering, Work-item ID 305\n  product/work-item subject; Configit",
    ].join("\n");
    const markup = renderToStaticMarkup(
      <CopilotAnswerContent
        content={section}
        onCitationSelect={vi.fn()}
      />,
    );

    expect(markup).toContain(section);
    expect(markup).not.toContain("Market MRKT");
  });

  it("passes through persisted Product 360 application sections and citations", () => {
    const representativeCitations: CopilotCitation[] = [
      {
        citationId: "cite:entity:codebeamer%3Aprimary-codebeamer%3Aitem%3A1187",
        kind: "entity",
        label: "Steering System Requirements",
      },
      {
        citationId: "cite:entity:windchill%3A0%3A0000003874%2F0000003874%230",
        kind: "entity",
        label: "Steering part 0000003874",
      },
      {
        citationId: "cite:entity:sap%3Amaterial%3Amat7893",
        kind: "entity",
        label: "Material MAT7893",
      },
      {
        citationId: "cite:entity:configit%3Asubject%3A305",
        kind: "entity",
        label: "Steering, Work-item ID 305",
      },
      {
        citationId: "cite:entity:configit%3Afamily%3Amrkt",
        kind: "entity",
        label: "Market (MRKT)",
      },
      {
        citationId: "cite:relationship:codebeamer%3Amanages%3A1187",
        kind: "relationship",
        label: "Customer Requirement Specifications manages Steering System Requirements",
      },
    ];
    const answer = [
      "## Cross-application synthesis",
      "Steering is represented across Codebeamer, Windchill, SAP, and Configit as a requirements subject, engineering part, operational material, and configurable product/work-item (cite:entity:codebeamer%3Aprimary-codebeamer%3Aitem%3A1187) (cite:entity:windchill%3A0%3A0000003874%2F0000003874%230) (cite:entity:sap%3Amaterial%3Amat7893) (cite:entity:configit%3Asubject%3A305).",
      "## Investigation subject and scope",
      "This is a coverage summary of the extracted investigation. Use the listed drill-down areas to retrieve complete object inventories.",
      "## Codebeamer requirements view",
      "### Representative",
      "- Steering System Requirements (requirement) (cite:entity:codebeamer%3Aprimary-codebeamer%3Aitem%3A1187).",
      "## Windchill engineering view",
      "### Representative",
      "- Steering part 0000003874 (engineering part occurrence) (cite:entity:windchill%3A0%3A0000003874%2F0000003874%230).",
      "## SAP operational/material view",
      "### Representative",
      "- Material MAT7893 (Operational material) (cite:entity:sap%3Amaterial%3Amat7893).",
      "### Source status",
      "- Partial coverage; source data may be stale (cite:entity:sap%3Amaterial%3Amat7893).",
      "## Configit configuration view",
      "### Representative",
      "- Steering, Work-item ID 305 (product/work-item subject) (cite:entity:configit%3Asubject%3A305).",
      "### Selected hierarchy",
      "- Market (MRKT) (configuration-family) (cite:entity:configit%3Afamily%3Amrkt).",
      "## Verified governed relationships",
      "### Subject-derived",
      "- Shared investigation-subject participation covers Codebeamer, Windchill, SAP, and Configit; it does not establish object-level connectivity or impact (cite:entity:configit%3Asubject%3A305).",
      "Selected evidence includes no source-authoritative relationships, POC-synthetic relationships, ontology-resolved relationships.",
      "## Evidence boundaries",
      "Shared-subject participation establishes investigation scope only; it does not prove a direct relationship, impact, or causality.",
      "Canonical relationships with unclassified authority:",
      "- Customer Requirement Specifications manages Steering System Requirements (cite:relationship:codebeamer%3Amanages%3A1187).",
    ].join("\n");
    const onCitationSelect = vi.fn();
    markdownRendererState.content = "";
    markdownRendererState.citationClicks = [];
    const markup = renderToStaticMarkup(
      <CopilotAnswerContent
        content={answer}
        answerContext={{
          messageId: "product-360-answer",
          answer: {
            answer,
            claims: [],
            recommendations: [],
            uncertainties: [],
            followUpQuestions: [],
            snapshotRevision: 7,
            citations: representativeCitations,
          },
        }}
        onCitationSelect={onCitationSelect}
      />,
    );

    const displayedAnswer = markdownRendererState.content;
    expect(displayedAnswer).not.toMatch(/<ul|<li|class=|style=/i);
    expect(displayedAnswer).not.toMatch(/cite:(?:entity|relationship):/);
    expect(displayedAnswer).not.toMatch(/\) \.|\bEA \.|\bRequirements \./);
    expect(displayedAnswer).toContain("Steering is represented across Codebeamer, Windchill, SAP, and Configit");
    expect(displayedAnswer).toContain("Steering, Work-item ID 305");
    expect(displayedAnswer).toContain("Market (MRKT) (configuration-family)");
    expect(displayedAnswer).toContain("Partial coverage; source data may be stale");
    expect(displayedAnswer).not.toContain("### Source-authoritative");
    expect(displayedAnswer).not.toContain("### POC-synthetic");
    expect(displayedAnswer).not.toContain("### Ontology-resolved");
    expect(displayedAnswer).not.toContain("Canonical authority not recorded");
    expect(displayedAnswer).not.toContain("### Canonical relationships with unclassified authority");
    const relationshipsSection = displayedAnswer.split("## Verified governed relationships")[1]?.split("## Evidence boundaries")[0] ?? "";
    const evidenceBoundarySection = displayedAnswer.split("## Evidence boundaries")[1] ?? "";
    expect(relationshipsSection).toContain(
      "Selected evidence includes no source-authoritative relationships, POC-synthetic relationships, ontology-resolved relationships.",
    );
    expect(evidenceBoundarySection).toContain("Canonical relationships with unclassified authority:");
    expect(relationshipsSection).not.toContain("Customer Requirement Specifications manages Steering System Requirements");
    expect(markup).toContain("Open entity reference: Steering System Requirements");
    expect(markup).toContain("Open relationship reference: Customer Requirement Specifications manages Steering System Requirements");
    expect(markdownRendererState.citationClicks.length).toBeGreaterThanOrEqual(2);
    markdownRendererState.citationClicks[0]();
    expect(onCitationSelect).toHaveBeenCalledWith(expect.objectContaining({
      citation: expect.objectContaining({ citationId: representativeCitations[0].citationId }),
    }));
    markdownRendererState.citationClicks.at(-1)?.();
    expect(onCitationSelect).toHaveBeenCalledWith(expect.objectContaining({
      citation: expect.objectContaining({ citationId: representativeCitations[5].citationId }),
    }));
    for (const citation of representativeCitations) {
      expect(displayedAnswer).toContain(citation.label);
    }
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
