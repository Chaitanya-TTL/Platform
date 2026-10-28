import { describe, expect, it } from "vitest";
import { isCanvasEventForScope } from "../canvas/canvas-event-scope";

describe("isCanvasEventForScope", () => {
  it("keeps unscoped legacy commands on the main canvas only", () => {
    expect(isCanvasEventForScope(undefined, "main")).toBe(true);
    expect(isCanvasEventForScope(undefined, "copilot-cited:answer-1")).toBe(
      false,
    );
  });

  it("delivers scoped commands only to their matching canvas", () => {
    expect(isCanvasEventForScope("main", "main")).toBe(true);
    expect(isCanvasEventForScope("copilot-cited:answer-1", "main")).toBe(
      false,
    );
    expect(
      isCanvasEventForScope(
        "copilot-cited:answer-1",
        "copilot-cited:answer-1",
      ),
    ).toBe(true);
    expect(
      isCanvasEventForScope(
        "copilot-cited:answer-1",
        "copilot-cited:answer-2",
      ),
    ).toBe(false);
  });

  it("does not allow geometry events from another scope to cross canvases", () => {
    expect(
      isCanvasEventForScope("copilot-cited:answer-1", "main"),
    ).toBe(false);
    expect(isCanvasEventForScope("main", "copilot-cited:answer-1")).toBe(
      false,
    );
  });
});
