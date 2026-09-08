"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  useStore,
  type EdgeProps,
  type Position,
} from "@xyflow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type {
  LatticeEdgeCategory,
  LatticeFlowEdge,
} from "../canvas/lattice-flow-types";
import { latticeMotion } from "../motion/lattice-motion";

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

type ActiveRoute = {
  path: string;
  labelX: number;
  labelY: number;
};

function calculateActiveRoute(args:RouteArguments,category:LatticeEdgeCategory):ActiveRoute {
  const distance=Math.hypot(args.targetX-args.sourceX,args.targetY-args.sourceY);
  if(category==="evidence"&&distance<180){const [path,labelX,labelY]=getStraightPath(args);return{path,labelX,labelY}}
  const curvature=distance>760?0.36:distance>460?0.31:distance>260?0.26:0.21;
  const [path,labelX,labelY]=getBezierPath({...args,curvature:category==="correspondence"?Math.max(curvature,0.34):curvature});
  return{path,labelX,labelY};
}
function offsetLabelFromPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  labelX: number,
  labelY: number,
) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / length;
  const normalY = dx / length;
  const offset = 11;

  return {
    x: labelX + normalX * offset,
    y: labelY + normalY * offset,
  };
}

function isRepeatedChildRelationship(kind: string, label: string) {
  const normalizedKind = kind.trim().toLowerCase();
  const normalizedLabel = label.trim().toLowerCase();

  return (
    normalizedKind === "contains" ||
    normalizedKind === "requirement" ||
    normalizedLabel === "contains requirement"
  );
}

function EdgeView({
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
  const reducedMotion = useReducedMotion();
  const [geometryMoving, setGeometryMoving] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const handleGeometryMotion = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      if (typeof detail?.active === "boolean") {
        setGeometryMoving(detail.active);
      }
    };

    window.addEventListener("lattice:geometry-motion", handleGeometryMotion);
    return () =>
      window.removeEventListener(
        "lattice:geometry-motion",
        handleGeometryMotion,
      );
  }, []);

  const edgeData =
    data ??
    ({
      category: "evidence",
      relationshipKind: "represented-by",
      direction: "forward",
      importance: "normal",
      animation: "settled",
      authoritative: true,
    } as LatticeFlowEdge["data"]);

  const route = useMemo(
    () =>
      calculateActiveRoute(
        {
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
        },
        edgeData.category,
      ),
    [
      edgeData.category,
      sourcePosition,
      sourceX,
      sourceY,
      targetPosition,
      targetX,
      targetY,
    ],
  );

  const labelPosition = useMemo(
    () =>
      offsetLabelFromPath(
        sourceX,
        sourceY,
        targetX,
        targetY,
        route.labelX,
        route.labelY,
      ),
    [sourceX, sourceY, targetX, targetY, route.labelX, route.labelY],
  );

  const color = palette[edgeData.category];
  const markerId = `lattice-marker-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const label = String(edgeData.fullLabel ?? edgeData.label ?? "").trim();
  const repeatedChildLabel = isRepeatedChildRelationship(
    edgeData.relationshipKind,
    label,
  );
  const zoomThreshold = edgeData.importance === "primary" ? 0.42 : 0.58;
  const repeatedLabelThreshold = 0.92;
  const showLabel =
    Boolean(label) &&
    !geometryMoving &&
    (selected ||
      hovered ||
      zoom >= (repeatedChildLabel ? repeatedLabelThreshold : zoomThreshold));

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
          <motion.path
            d={
              edgeData.direction === "inferred"
                ? "M 1 1 L 7 4 L 1 7"
                : "M 1 1 L 7 4 L 1 7 Z"
            }
            fill={edgeData.direction === "inferred" ? "none" : color}
            stroke={color}
            strokeWidth="1"
            initial={{ opacity: reducedMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: reducedMotion ? 0 : 0.2,
              duration: reducedMotion ? 0 : 0.08,
            }}
          />
        </marker>
      </defs>

      <motion.path
        d={route.path}
        fill="none"
        stroke={color}
        strokeWidth={
          selected ? 1.8 : edgeData.importance === "primary" ? 1.5 : 1.25
        }
        strokeDasharray={
          edgeData.category === "evidence"
            ? "2 5"
            : edgeData.category === "pending"
              ? "8 8"
              : undefined
        }
        markerStart={
          edgeData.direction === "bidirectional"
            ? `url(#${markerId})`
            : undefined
        }
        markerEnd={`url(#${markerId})`}
        className={`react-flow__edge-path lattice-intelligent-edge edge-${edgeData.category}`}
        initial={
          reducedMotion
            ? { opacity: 1, pathLength: 1 }
            : { opacity: 0.35, pathLength: 0 }
        }
        animate={{
          opacity: edgeData.importance === "low" ? 0.56 : 1,
          pathLength: 1,
        }}
        transition={reducedMotion ? { duration: 0 } : latticeMotion.edge}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      <AnimatePresence>
        {showLabel ? (
          <EdgeLabelRenderer>
            <motion.button
              initial={{ opacity: 0, scale: 0.98, y: 2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 2 }}
              transition={reducedMotion ? { duration: 0 } : latticeMotion.label}
              type="button"
              data-edge-action="open-details"
              data-edge-id={id}
              className={`lattice-edge-label nodrag nopan ${selected ? "is-selected" : ""}`}
              style={{
                transform: `translate(-50%, -50%) translate(${labelPosition.x}px, ${labelPosition.y}px)`,
              }}
            >
              {label}
            </motion.button>
          </EdgeLabelRenderer>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export const IntelligentRelationshipEdge = memo(EdgeView);
