import type { RelationshipProjection } from "../contracts/projection";
import type { CardinalDirection, PortSide, Size } from "./layout-contract";
import type { DecomposedBranch } from "./branch-decomposition";

export type ElkPortInput = { id: string; width: number; height: number; layoutOptions: Record<string, string> };
export type ElkNodeInput = { id: string; width: number; height: number; ports: ElkPortInput[]; layoutOptions?: Record<string, string> };
export type ElkEdgeInput = { id: string; sources: string[]; targets: string[] };
export type ElkBranchGraph = { id: string; layoutOptions: Record<string, string>; children: ElkNodeInput[]; edges: ElkEdgeInput[] };
const sidePair = (direction: CardinalDirection): [PortSide, PortSide] => direction === "RIGHT" ? ["WEST", "EAST"] : direction === "LEFT" ? ["EAST", "WEST"] : direction === "DOWN" ? ["NORTH", "SOUTH"] : ["SOUTH", "NORTH"];
export const nodeSize = (kind: string): Size => kind === "identity" ? { width: 344, height: 132 } : { width: 272, height: 96 };

export function buildElkBranchGraph(branch: DecomposedBranch, projection: RelationshipProjection, direction: CardinalDirection): ElkBranchGraph {
  const byId = new Map(projection.nodes.map((node) => [node.id, node]));
  const [inputSide, outputSide] = sidePair(direction);
  const children = branch.nodeIds.map((id) => {
    const size = nodeSize(byId.get(id)?.kind ?? "component");
    return { id, ...size, ports: [
      { id: `${id}:in`, width: 1, height: 1, layoutOptions: { "elk.port.side": inputSide, "elk.port.index": "0" } },
      { id: `${id}:out`, width: 1, height: 1, layoutOptions: { "elk.port.side": outputSide, "elk.port.index": "1" } },
    ], layoutOptions: { "elk.portConstraints": "FIXED_ORDER" } };
  });
  const edges = branch.edges.map((edge) => ({ id: edge.id, sources: [`${edge.source}:out`], targets: [`${edge.target}:in`] }));
  return { id: `branch:${branch.id}`, children, edges, layoutOptions: {
    "elk.algorithm": "layered", "elk.direction": direction, "elk.edgeRouting": "ORTHOGONAL",
    "elk.layered.layering.strategy": "NETWORK_SIMPLEX", "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF", "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.considerModelOrder.portModelOrder": "true", "elk.layered.portSortingStrategy": "INPUT_ORDER",
    "elk.separateConnectedComponents": "false", "elk.spacing.nodeNode": "48",
    "elk.layered.spacing.nodeNodeBetweenLayers": "104", "elk.spacing.edgeNode": "28", "elk.spacing.edgeEdge": "18", "elk.spacing.portPort": "12",
    "elk.padding": "[top=24,left=24,bottom=24,right=24]",
  } };
}
