"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeToolbar,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useStore,
  type EdgeProps,
  type Position,
} from "@xyflow/react";
import {
  IconArrowsExchange,
  IconEye,
  IconFilterOff,
  IconListDetails,
  IconRoute,
} from "@tabler/icons-react";
import type {
  LatticeEdgeCategory,
  LatticeFlowEdge,
} from "../canvas/lattice-flow-types";

const palette: Record<LatticeEdgeCategory, string> = {
  structure: "#94a3b8",
  correspondence: "#38bdf8",
  requirement: "#22d3ee",
  "change-impact": "#f59e0b",
  "operational-impact": "#34d399",
  configuration: "#e879f9",
  evidence: "#94a3b8",
  pending: "#64748b",
  unavailable: "#fb7185",
};

type RouteArguments = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
};

function route(args: RouteArguments, category: LatticeEdgeCategory) {
  if (category === "structure" || category === "configuration") {
    return getSmoothStepPath({
      ...args,
      borderRadius: category === "configuration" ? 4 : 12,
      offset: 24,
    });
  }

  if (
    category === "evidence" &&
    Math.hypot(args.targetX - args.sourceX, args.targetY - args.sourceY) < 220
  ) {
    return getStraightPath(args);
  }

  if (category === "change-impact" || category === "operational-impact") {
    const middleX = (args.sourceX + args.targetX) / 2;
    const middleY = (args.sourceY + args.targetY) / 2;
    return [
      `M ${args.sourceX} ${args.sourceY} Q ${middleX} ${middleY - 34} ${args.targetX} ${args.targetY}`,
      middleX,
      middleY - 17,
    ] as const;
  }

  return getBezierPath({
    ...args,
    curvature: category === "correspondence" ? 0.34 : 0.22,
  });
}

function IntelligentRelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<LatticeFlowEdge>) {
  const zoom = useStore((state) => state.transform[2]);
  const edgeData = data ?? {
    category: "evidence" as const,
    relationshipKind: "represented-by" as const,
    direction: "forward" as const,
    importance: "normal" as const,
    animation: "settled" as const,
    authoritative: true,
  };
  const routed = edgeData.layoutRoute;
  const routePoints = routed ? [routed.start, ...routed.bends, routed.end] : [];
  const routedPath = routePoints.length > 1
    ? `M ${routePoints.map((point) => `${point.x} ${point.y}`).join(" L ")}`
    : null;
  const routedLabelPoint = routed?.label ?? (routePoints.length
    ? routePoints[Math.floor(routePoints.length / 2)]
    : null);
  const fallback = route(
    { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition },
    edgeData.category,
  );
  const [path, labelX, labelY] = routedPath && routedLabelPoint
    ? [routedPath, routedLabelPoint.x, routedLabelPoint.y] as const
    : fallback;

  const color = palette[edgeData.category];
  const width = selected
    ? 1.75
    : edgeData.importance === "primary"
      ? 1.45
      : edgeData.importance === "low"
        ? 1.05
        : 1.3;
  const dash =
    edgeData.category === "evidence"
      ? "2 5"
      : edgeData.category === "pending"
        ? "8 8"
        : edgeData.category === "unavailable"
          ? "7 5"
          : undefined;
  const markerId = `lattice-marker-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const markerUrl = `url(#${markerId})`;
  const showLabel = selected || (edgeData.importance === "primary" ? zoom >= 0.42 : edgeData.importance === "low" || edgeData.importance === "background" ? zoom >= 0.82 : zoom >= 0.58);

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="8"
          markerHeight="8"
          refX="7.2"
          refY="4"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path
            d={edgeData.direction === "inferred" ? "M 1 1 L 7 4 L 1 7" : "M 1 1 L 7 4 L 1 7 Z"}
            fill={edgeData.direction === "inferred" ? "none" : color}
            stroke={color}
            strokeWidth="1"
          />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerStart={
          edgeData.direction === "bidirectional" ? markerUrl : undefined
        }
        markerEnd={markerUrl}
        interactionWidth={18}
        style={{
          stroke: color,
          strokeWidth: width,
          strokeDasharray: dash,
          opacity:
            edgeData.importance === "background"
              ? 0.3
              : edgeData.importance === "low"
                ? 0.55
                : 1,
        }}
        className={`lattice-intelligent-edge edge-${edgeData.category} animation-${edgeData.animation}`}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            data-edge-action="open-details"
            data-edge-id={id}
            className={`lattice-edge-label nodrag nopan ${selected ? "is-selected" : ""}`}
            style={{
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {selected ? edgeData.fullLabel : edgeData.label}
          </button>
        </EdgeLabelRenderer>
      ) : null}
      <EdgeToolbar edgeId={id} x={labelX} y={labelY} isVisible={selected}>
        <div className="lattice-edge-toolbar nodrag nopan nowheel">
          <button data-edge-action="inspect-evidence" data-edge-id={id} title="Inspect evidence"><IconEye /></button>
          <button data-edge-action="trace" data-edge-id={id} title="Trace from here"><IconRoute /></button>
          <button data-edge-action="hide-family" data-edge-id={id} title="Hide relationship type"><IconFilterOff /></button>
          <button data-edge-action="compare-endpoints" data-edge-id={id} title="Compare endpoints"><IconArrowsExchange /></button>
          <button data-edge-action="open-details" data-edge-id={id} title="Open relationship details"><IconListDetails /></button>
        </div>
      </EdgeToolbar>
    </>
  );
}

export default memo(IntelligentRelationshipEdge);
