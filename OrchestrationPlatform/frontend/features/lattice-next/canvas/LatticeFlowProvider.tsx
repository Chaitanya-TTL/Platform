"use client";

import type { PropsWithChildren } from "react";
import { ReactFlowProvider } from "@xyflow/react";

/**
 * Deliberate provider boundary for every Lattice graph surface. Keep controls,
 * inspectors, keyboard commands, minimap actions and viewport services below
 * this component so they can use React Flow hooks without prop-drilling an
 * imperative instance through the workspace.
 */
export function LatticeFlowProvider({ children }: PropsWithChildren) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}


