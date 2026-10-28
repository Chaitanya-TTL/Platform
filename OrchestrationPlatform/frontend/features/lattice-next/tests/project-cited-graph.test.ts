import { describe, expect, it } from "vitest";
import type {
  CopilotCitation,
  CopilotCitationKind,
} from "../copilot/contracts";
import type {
  EngineeringEntity,
  EngineeringRelationship,
  InvestigationGraph,
  RelationshipKind,
} from "../domain/model";
import {
  createInvestigationGraphCore,
  type InvestigationGraphCore,
} from "../engines/investigation-graph";
import { projectCitedGraph } from "../engines/project-cited-graph";

const entity = (id: string): EngineeringEntity => ({
  id,
  sourceNodeId: id,
  source: "platform",
  name: id,
  kind: "component",
  level: 1,
  attributes: {},
  provenance: { sourceLabel: "fixture" },
});

const relationship = (
  id: string,
  from: string,
  to: string,
  kind: RelationshipKind = "contains",
): EngineeringRelationship => ({
  id,
  from,
  to,
  kind,
  evidence: [],
});

const graph = (
  entities: EngineeringEntity[],
  relationships: EngineeringRelationship[],
): InvestigationGraph => ({
  entities,
  relationships,
  roots: entities
    .filter(
      (item) =>
        !relationships.some(
          (link) =>
            link.to === item.id &&
            (link.kind === "contains" || link.kind === "represented-by"),
        ),
    )
    .map((item) => item.id),
  byId: Object.fromEntries(entities.map((item) => [item.id, item])),
  relationshipById: Object.fromEntries(
    relationships.map((item) => [item.id, item]),
  ),
});

const citation = (
  kind: CopilotCitationKind,
  targetId: string,
): CopilotCitation => ({
  kind,
  citationId: `cite:${kind}:${encodeURIComponent(targetId)}`,
  label: targetId,
});

const graphCore = (domain: InvestigationGraph): InvestigationGraphCore =>
  createInvestigationGraphCore(domain);

describe("projectCitedGraph", () => {
  it("includes a cited entity and only its shortest parent path", () => {
    const domain = graph(
      ["root", "parent", "target", "sibling", "neighbor", "other-root"].map(
        entity,
      ),
      [
        relationship("root-parent", "root", "parent"),
        relationship("parent-target", "parent", "target", "represented-by"),
        relationship("parent-sibling", "parent", "sibling"),
        relationship("target-neighbor", "target", "neighbor", "supported-by"),
      ],
    );

    const result = projectCitedGraph(domain, graphCore(domain), [
      citation("entity", "target"),
    ]);

    expect(result.projection.nodes.map((node) => node.id)).toEqual([
      "parent",
      "root",
      "target",
    ]);
    expect(result.projection.edges.map((edge) => edge.id)).toEqual([
      "parent-target",
      "root-parent",
    ]);
    expect(result.unresolvedCitations).toEqual([]);
  });

  it("includes a cited relationship, its real endpoints, and each endpoint path", () => {
    const domain = graph(
      [
        "root-a",
        "source",
        "root-b",
        "target",
        "source-branch",
        "target-branch",
        "neighbor",
      ].map(entity),
      [
        relationship("a-source", "root-a", "source"),
        relationship("b-target", "root-b", "target"),
        relationship("cited-edge", "source", "target", "supported-by"),
        relationship("source-branch-edge", "source", "source-branch"),
        relationship("target-branch-edge", "target", "target-branch"),
        relationship("target-neighbor", "target", "neighbor", "traced-to"),
      ],
    );

    const result = projectCitedGraph(domain, graphCore(domain), [
      citation("relationship", "cited-edge"),
    ]);

    expect(result.projection.nodes.map((node) => node.id)).toEqual([
      "root-a",
      "root-b",
      "source",
      "target",
    ]);
    expect(result.projection.edges.map((edge) => edge.id)).toEqual([
      "a-source",
      "b-target",
      "cited-edge",
    ]);
  });

  it("chooses one shortest path deterministically when parent paths tie", () => {
    const domain = graph(
      ["root-z", "parent-z", "root-a", "parent-a", "target"].map(entity),
      [
        relationship("z-root-parent", "root-z", "parent-z"),
        relationship("z-parent-target", "parent-z", "target"),
        relationship("a-root-parent", "root-a", "parent-a"),
        relationship("a-parent-target", "parent-a", "target"),
      ],
    );

    const result = projectCitedGraph(domain, graphCore(domain), [
      citation("entity", "target"),
    ]);

    expect(result.projection.nodes.map((node) => node.id)).toEqual([
      "parent-a",
      "root-a",
      "target",
    ]);
    expect(result.projection.edges.map((edge) => edge.id)).toEqual([
      "a-parent-target",
      "a-root-parent",
    ]);
  });

  it("terminates on cycles while taking a shortest real path to a root", () => {
    const domain = graph(
      ["root", "a", "b", "target"].map(entity),
      [
        relationship("root-a", "root", "a"),
        relationship("a-b", "a", "b"),
        relationship("b-a", "b", "a"),
        relationship("b-target", "b", "target"),
      ],
    );

    const result = projectCitedGraph(domain, graphCore(domain), [
      citation("entity", "target"),
    ]);

    expect(result.projection.nodes.map((node) => node.id)).toEqual([
      "a",
      "b",
      "root",
      "target",
    ]);
    expect(result.projection.edges.map((edge) => edge.id)).toEqual([
      "a-b",
      "b-target",
      "root-a",
    ]);
  });

  it("keeps a no-parent target visible without inventing a parent", () => {
    const domain = graph(["root", "neighbor"].map(entity), [
      relationship("unrelated", "root", "neighbor"),
    ]);

    const result = projectCitedGraph(domain, graphCore(domain), [
      citation("entity", "root"),
    ]);

    expect(result.projection.nodes.map((node) => node.id)).toEqual(["root"]);
    expect(result.projection.edges).toEqual([]);
  });

  it("reports invalid or unresolved graph citations and ignores non-graph references", () => {
    const domain = graph(["real"].map(entity), []);
    const invalid = {
      kind: "entity",
      citationId: "cite:entity:bad%escape",
      label: "Malformed entity",
    } satisfies CopilotCitation;
    const missingEntity = citation("entity", "missing");
    const missingRelationship = citation("relationship", "missing-edge");
    const nonGraph = citation("evidence", "evidence-1");

    const result = projectCitedGraph(domain, graphCore(domain), [
      invalid,
      missingEntity,
      missingRelationship,
      nonGraph,
    ]);

    expect(result.projection.nodes).toEqual([]);
    expect(result.projection.edges).toEqual([]);
    expect(result.unresolvedCitations).toEqual([
      invalid,
      missingEntity,
      missingRelationship,
    ]);
  });

  it("uses selected flags for direct citations and dimming for context", () => {
    const domain = graph(
      ["root", "direct", "endpoint", "other"].map(entity),
      [
        relationship("root-direct", "root", "direct"),
        relationship("root-endpoint", "root", "endpoint"),
        relationship("cited-edge", "direct", "endpoint", "supported-by"),
        relationship("cited-context-edge", "endpoint", "other", "traced-to"),
      ],
    );

    const result = projectCitedGraph(domain, graphCore(domain), [
      citation("entity", "direct"),
      citation("relationship", "cited-edge"),
    ]);

    expect(result.projection.nodes).toMatchObject([
      { id: "direct", selected: true, dimmed: false },
      { id: "endpoint", selected: false, dimmed: true },
      { id: "root", selected: false, dimmed: true },
    ]);
    expect(result.projection.edges).toMatchObject([
      { id: "cited-edge", selected: true },
      { id: "root-direct", selected: false },
      { id: "root-endpoint", selected: false },
    ]);
  });
});
