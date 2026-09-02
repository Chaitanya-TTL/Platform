import { describe, expect, it } from "vitest";
import {
  radialConnectionGeometry,
  rectangleBoundaryAttachment,
} from "../layout/radial-connection-geometry";

const center = { x: 100, y: 100 };
const size = { width: 200, height: 100 };

function liesOnBoundary(point: { x: number; y: number }) {
  const onVertical =
    Math.abs(Math.abs(point.x - center.x) - size.width / 2) < 1e-8;
  const onHorizontal =
    Math.abs(Math.abs(point.y - center.y) - size.height / 2) < 1e-8;
  return onVertical || onHorizontal;
}

describe("radial rectangle connection geometry", () => {
  it.each([
    [0, "EAST", "WEST"],
    [Math.PI / 2, "SOUTH", "NORTH"],
    [Math.PI, "WEST", "EAST"],
    [-Math.PI / 2, "NORTH", "SOUTH"],
    [Math.PI / 4, "EAST", "WEST"],
    [(3 * Math.PI) / 4, "SOUTH", "NORTH"],
    [(-3 * Math.PI) / 4, "NORTH", "SOUTH"],
    [-Math.PI / 4, "EAST", "WEST"],
  ])(
    "allocates angle %s to opposing rectangle sides",
    (angle, sourceSide, targetSide) => {
      const result = radialConnectionGeometry({
        branchId: `branch-${angle}`,
        angle,
        sourceCenter: center,
        sourceSize: size,
        targetCenter: center,
        targetSize: size,
      });
      expect(result.source.side).toBe(sourceSide);
      expect(result.target.side).toBe(targetSide);
      expect(liesOnBoundary(result.source.position)).toBe(true);
      expect(liesOnBoundary(result.target.position)).toBe(true);
      expect(Number.isFinite(result.source.position.x)).toBe(true);
      expect(Number.isFinite(result.target.position.y)).toBe(true);
    },
  );

  it("keeps same-side branches on unique deterministic handles", () => {
    const first = radialConnectionGeometry({
      branchId: "a",
      angle: -0.35,
      sourceCenter: center,
      sourceSize: size,
      targetCenter: center,
      targetSize: size,
    });
    const second = radialConnectionGeometry({
      branchId: "b",
      angle: 0.35,
      sourceCenter: center,
      sourceSize: size,
      targetCenter: center,
      targetSize: size,
    });
    expect(first.source.side).toBe("EAST");
    expect(second.source.side).toBe("EAST");
    expect(first.source.id).toBe("radial-source:a");
    expect(second.source.id).toBe("radial-source:b");
    expect(first.source.offsetPercent).not.toBe(second.source.offsetPercent);
    expect(
      radialConnectionGeometry({
        branchId: "a",
        angle: -0.35,
        sourceCenter: center,
        sourceSize: size,
        targetCenter: center,
        targetSize: size,
      }),
    ).toEqual(first);
  });

  it("safely handles a zero direction component and clamps away from corners", () => {
    const result = rectangleBoundaryAttachment({
      id: "radial-source:zero",
      branchId: "zero",
      center,
      size,
      direction: { x: 0, y: -1 },
    });
    expect(result.side).toBe("NORTH");
    expect(result.position).toEqual({ x: 100, y: 50 });
    expect(result.offsetPercent).toBe(50);
    expect(result.offsetPercent).toBeGreaterThanOrEqual(8);
    expect(result.offsetPercent).toBeLessThanOrEqual(92);
  });

  it("covers all four sides with eight deterministic branches", () => {
    const results = Array.from({ length: 8 }, (_, index) =>
      radialConnectionGeometry({
        branchId: `branch-${index}`,
        angle: -Math.PI / 2 + (index * Math.PI) / 4,
        sourceCenter: center,
        sourceSize: size,
        targetCenter: center,
        targetSize: size,
      }),
    );
    expect(new Set(results.map((result) => result.source.side))).toEqual(
      new Set(["NORTH", "EAST", "SOUTH", "WEST"]),
    );
    expect(new Set(results.map((result) => result.source.id)).size).toBe(8);
  });
});
