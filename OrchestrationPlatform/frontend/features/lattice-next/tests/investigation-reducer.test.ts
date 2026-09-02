
import { describe, expect, it } from "vitest";
import { initialInvestigation, investigationReducer } from "../state/investigation-reducer";

describe("investigation interaction reducer", () => {
  it("toggles a collapsed node open without clearing selection", () => {
    let state = initialInvestigation(["root"], ["unified", "teamcenter"]);
    state = investigationReducer(state, { type: "select-entity", id: "child" });
    state = investigationReducer(state, { type: "toggle", id: "child" });
    expect(state.interaction.expansion.expanded.has("child")).toBe(true);
    expect(state.interaction.selection).toEqual({ type: "entity", id: "child" });
  });

  it("toggles an initially expanded root closed", () => {
    let state = initialInvestigation(["root"], ["unified"]);
    expect(state.interaction.expansion.expanded.has("root")).toBe(true);
    state = investigationReducer(state, { type: "toggle", id: "root" });
    expect(state.interaction.expansion.expanded.has("root")).toBe(false);
  });

  it("collapses all requested descendants", () => {
    let state = initialInvestigation(["root"], ["unified"]);
    state = investigationReducer(state, { type: "expand-many", ids: ["root", "child", "leaf"] });
    state = investigationReducer(state, { type: "collapse-many", ids: ["root", "child", "leaf"] });
    expect([...state.interaction.expansion.expanded]).toEqual([]);
  });

  it("reset layout clears only pins and preserves expansion", () => {
    let state = initialInvestigation(["root"], ["unified"]);
    state = investigationReducer(state, { type: "toggle", id: "child" });
    state = investigationReducer(state, { type: "pin-position", id: "root", position: { x: 1, y: 2 } });
    state = investigationReducer(state, { type: "reset-layout" });
    expect(state.interaction.pinnedPositions).toEqual({});
    expect(state.interaction.expansion.expanded.has("child")).toBe(true);
    expect(state.interaction.expansion.expanded.has("root")).toBe(true);
  });


  it("starts a new investigation without clearing page-level source configuration", () => {
    let state = initialInvestigation(["root"], ["unified", "teamcenter"]);
    state = investigationReducer(state, { type: "select-entity", id: "child" });
    state = investigationReducer(state, { type: "pin-position", id: "child", position: { x: 12, y: 24 } });
    state = investigationReducer(state, { type: "query", value: "EYE HEAD" });
    const activeSources = state.activeSources;

    state = investigationReducer(state, { type: "start-new-investigation" });

    expect(state.query).toBe("");
    expect(state.inspectorOpen).toBe(false);
    expect(state.interaction.selection).toEqual({ type: "none" });
    expect(state.interaction.expansion.expanded.size).toBe(0);
    expect(state.interaction.expansion.focusRoot).toBeNull();
    expect(state.interaction.pinnedPositions).toEqual({});
    expect(state.interaction.hover).toEqual({ entityId: null, relationshipId: null });
    expect(state.activeSources).toBe(activeSources);
  });
});

