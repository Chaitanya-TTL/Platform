import { describe, expect, it } from "vitest";
import { applyRadialFirstHopRoutes } from "../layout/radial-route-adapter";
import type { RadialLayoutConnection } from "../layout/layout-contract";

const connection: RadialLayoutConnection = {
  branchId: "branch-a",
  angle: Math.PI,
  sourceNodeId: "subject",
  targetNodeId: "branch-a",
  edgeId: "edge-a",
  source: { id: "radial-source:branch-a", nodeId: "subject", branchId: "branch-a", side: "WEST", offsetPercent: 50, position: { x: 10, y: 20 } },
  target: { id: "radial-target:branch-a", nodeId: "branch-a", branchId: "branch-a", side: "EAST", offsetPercent: 50, position: { x: -100, y: 20 } },
};

describe("radial first-hop route adaptation", () => {
  it("replaces a synthetic hub route with exact radial endpoints", () => {
    const result = applyRadialFirstHopRoutes({
      "edge-a": { edgeId: "edge-a", start: { x: 100, y: 20 }, bends: [{ x: 180, y: 20 }], end: { x: -90, y: 20 }, family: "structure" },
    }, { "edge-a": connection });
    expect(result["edge-a"].start).toEqual(connection.source.position);
    expect(result["edge-a"].end).toEqual(connection.target.position);
    expect(result["edge-a"].bends).toEqual([]);
    expect(result["edge-a"].label).toEqual({ x: -45, y: 20 });
  });

  it("preserves non-radial routes and is deterministic", () => {
    const routes = { other: { edgeId: "other", start: { x: 0, y: 0 }, bends: [{ x: 1, y: 1 }], end: { x: 2, y: 2 } } };
    const first = applyRadialFirstHopRoutes(routes, { "edge-a": connection });
    const second = applyRadialFirstHopRoutes(routes, { "edge-a": connection });
    expect(first.other).toEqual(routes.other);
    expect(first).toEqual(second);
  });
});
