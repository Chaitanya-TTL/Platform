import { describe, expect, it } from "vitest";
import {
  classifyChange,
  createSession,
  stabilizeLayout,
} from "../layout/layout-session";
import type { RelationshipProjection } from "../contracts/projection";
import type { UniversalLayoutResult } from "../layout/layout-contract";
const projection = (ids: string[], key = "k"): RelationshipProjection => ({
  structuralKey: key,
  nodes: ids.map((id, i) => ({
    id,
    label: id,
    subtitle: id,
    kind: i ? "component" : "identity",
    source: "x",
    level: i,
    selected: false,
    expanded: true,
    hasChildren: false,
    hiddenChildren: 0,
    relationshipCount: 0,
    childCount: 0,
  })),
  edges: [],
});
const result = (ids: string[]): UniversalLayoutResult => ({
  signal: 1,
  revision: 2,
  positions: Object.fromEntries(ids.map((id, i) => [id, { x: i * 100, y: 0 }])),
  dimensions: Object.fromEntries(
    ids.map((id) => [id, { width: 50, height: 30 }]),
  ),
  ports: {},
  routes: {},
  branchBounds: ids[1]
    ? { [ids[1]]: { x: 100, y: 0, width: 50, height: 30 } }
    : {},
  branches: ids[1]
    ? [
        {
          id: ids[1],
          rootId: ids[1],
          nodeIds: ids.slice(1),
          edgeIds: [],
          direction: "RIGHT",
          angle: 0,
          bounds: { x: 100, y: 0, width: 50, height: 30 },
        },
      ]
    : [],
  radialConnections: {},
  diagnostics: {
    strategy: "sector-layered-v2",
    sourceCount: 1,
    rings: 1,
    iterations: 1,
    collisionsResolved: 0,
    elapsedMs: 1,
    overlapCount: 0,
    invalidCoordinateCount: 0,
    fallbackBranches: 0,
    nodeOverlapCount: 0,
    branchOverlapCount: 0,
    subjectIntrusionCount: 0,
    invalidRouteCount: 0,
  },
});
describe("incremental stability", () => {
  it("classifies expansion and collapse", () => {
    const before = createSession(result(["s", "a"]), projection(["s", "a"]), 1);
    expect(classifyChange(before, projection(["s", "a", "b"]), {})).toBe(
      "expand",
    );
    expect(classifyChange(before, projection(["s"]), {})).toBe("collapse");
  });
  it("preserves unchanged branch anchors", () => {
    const old = result(["s", "a"]);
    old.positions.a = { x: 500, y: 200 };
    old.branchBounds.a = { x: 500, y: 200, width: 50, height: 30 };
    const session = createSession(old, projection(["s", "a"]), 1);
    const next = result(["s", "a"]);
    const stable = stabilizeLayout(next, session, "filter");
    expect(stable.positions.a).toEqual({ x: 500, y: 200 });
  });
  it("tracks generations", () => {
    expect(
      createSession(result(["s"]), projection(["s"]), 42).layoutGeneration,
    ).toBe(42);
  });
});
