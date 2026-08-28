export type LatticeNodeAction = "focus" | "expand-one" | "expand-branch" | "collapse-descendants" | "open-details" | "toggle-pin" | "trace-upstream" | "trace-downstream" | "compare-representations" | "reset-position";
export type LatticeNodeActionIntent = { nodeId: string; action: LatticeNodeAction };
