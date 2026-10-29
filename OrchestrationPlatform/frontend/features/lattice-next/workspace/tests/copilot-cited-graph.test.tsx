import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelationshipProjection } from "../../contracts/projection";
import type { CitedGraphProjection } from "../../engines/project-cited-graph";
import { CopilotCitedGraph } from "../CopilotCitedGraph";

const mocks = vi.hoisted(() => ({
  providerChildren: undefined as React.ReactNode,
  canvasProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("../../canvas/LatticeFlowProvider", () => ({
  LatticeFlowProvider: ({
    children,
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    mocks.providerChildren = children;
    return <section data-testid="lattice-flow-provider">{children}</section>;
  },
}));

vi.mock("../../components/RelationshipCanvas", () => ({
  RelationshipCanvas: (props: Record<string, unknown>) => {
    mocks.canvasProps = props;
    const projection = props.projection as RelationshipProjection;
    return (
      <div
        data-testid="relationship-canvas"
        data-node-ids={projection.nodes.map((node) => node.id).join(",")}
        data-edge-ids={projection.edges.map((edge) => edge.id).join(",")}
      />
    );
  },
}));

const projection: RelationshipProjection = {
  nodes: [
    {
      id: "entity-a",
      label: "Entity A",
      subtitle: "Cited entity",
      kind: "component",
      source: "platform",
      level: 1,
      selected: true,
      expanded: true,
      hasChildren: false,
      hiddenChildren: 0,
      relationshipCount: 1,
      childCount: 0,
    },
    {
      id: "entity-b",
      label: "Entity B",
      subtitle: "Relationship endpoint",
      kind: "component",
      source: "platform",
      level: 1,
      selected: false,
      expanded: true,
      hasChildren: false,
      hiddenChildren: 0,
      relationshipCount: 1,
      childCount: 0,
      dimmed: true,
    },
  ],
  edges: [
    {
      id: "relationship-ab",
      source: "entity-a",
      target: "entity-b",
      kind: "supported-by",
      selected: true,
      label: "supported by",
    },
  ],
  structuralKey: "entity-a|entity-b::relationship-ab",
};

const citedGraph = (
  focusedProjection: RelationshipProjection,
  unresolvedCitations: CitedGraphProjection["unresolvedCitations"] = [],
): CitedGraphProjection => ({
  projection: focusedProjection,
  unresolvedCitations,
});

describe("CopilotCitedGraph", () => {
  beforeEach(() => {
    mocks.providerChildren = undefined;
    mocks.canvasProps = undefined;
  });

  it("renders only the supplied projection under a separate provider and scopes the canvas", () => {
    const markup = renderToStaticMarkup(
      <CopilotCitedGraph
        answerMessageId="answer-1"
        citedGraph={citedGraph(projection)}
        focusTarget={{ kind: "relationship", id: "relationship-ab" }}
        emptyMessage="No graph citations are available."
        unavailableMessage="Some cited graph items are unavailable."
      />,
    );

    expect(markup).toContain('data-testid="lattice-flow-provider"');
    expect(markup).toContain('data-testid="relationship-canvas"');
    expect(markup).toContain('data-node-ids="entity-a,entity-b"');
    expect(markup).toContain('data-edge-ids="relationship-ab"');
    expect(mocks.canvasProps).toMatchObject({
      canvasScopeId: "copilot-cited:answer-1",
      listenToWorkspaceEvents: false,
      focusTargetIds: ["entity-a", "entity-b"],
      showSelectionToolbar: false,
      orientation: "RIGHT",
      layoutMode: "DEFAULT",
    });
  });

  it("shows a truthful empty state without rendering an investigation graph fallback", () => {
    const markup = renderToStaticMarkup(
      <CopilotCitedGraph
        answerMessageId="answer-empty"
        citedGraph={citedGraph({ nodes: [], edges: [], structuralKey: "::" })}
        emptyMessage="No graph citations are available."
        unavailableMessage="Cited graph items could not be resolved."
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("No graph citations are available.");
    expect(markup).not.toContain("relationship-canvas");
    expect(mocks.canvasProps).toBeUndefined();
  });

  it("distinguishes unresolved citations from an empty answer projection", () => {
    const unresolved = {
      kind: "entity",
      citationId: "cite:entity:missing",
      label: "Missing entity",
    } as const;
    const markup = renderToStaticMarkup(
      <CopilotCitedGraph
        answerMessageId="answer-unavailable"
        citedGraph={citedGraph({ nodes: [], edges: [], structuralKey: "::" }, [
          unresolved,
        ])}
        emptyMessage="No graph citations are available."
        unavailableMessage="Cited graph items could not be resolved."
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Cited graph items could not be resolved.");
    expect(markup).not.toContain("No graph citations are available.");
    expect(markup).not.toContain("relationship-canvas");
  });
});
