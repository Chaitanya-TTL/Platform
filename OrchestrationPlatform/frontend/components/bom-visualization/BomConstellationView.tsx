"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  IconArrowsMaximize,
  IconHome,
  IconInfoCircle,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconRotate,
  IconRotateClockwise,
} from "@tabler/icons-react";

import {
  ancestors,
  buildVisualBomGraph,
  descendants,
  layoutConstellation,
  relationshipState,
  visibleBranch,
} from "@/lib/bom-visualization";
import type {
  ComparisonStatus,
  NodeComparison,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
import type {
  GraphTransform,
  PositionedVisualNode,
  VisualBomNode,
} from "@/types/bom-visualization";

const WIDTH = 1120;
const HEIGHT = 760;
const DEFAULT_TRANSFORM: GraphTransform = {
  x: 0,
  y: 0,
  scale: 0.93,
  rotation: 0,
};

const roleColors = {
  root: "#06b6d4",
  assembly: "#6366f1",
  subassembly: "#8b5cf6",
  component: "#64748b",
};

const statusColors: Record<ComparisonStatus, string> = {
  matched: "#10b981",
  changed: "#f59e0b",
  missing: "#f43f5e",
  "source-only": "#0ea5e9",
  probable: "#8b5cf6",
};

export function BomConstellationView({
  root,
  source,
  comparison,
  search,
  selectedId,
  onSelect,
  onFullScreen,
}: {
  root: TreeNodeData;
  source: SourceType;
  comparison?: Record<string, NodeComparison>;
  search: string;
  selectedId?: string;
  onSelect: (node: TreeNodeData) => void;
  onFullScreen: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set([root.id, ...(root.children ?? []).map((child) => child.id)]),
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [transform, setTransform] = useState(DEFAULT_TRANSFORM);
  const [showLegend, setShowLegend] = useState(false);

  const graph = useMemo(
    () => buildVisualBomGraph(root, source, comparison),
    [root, source, comparison],
  );
  const visibleNodes = useMemo(
    () => visibleBranch(graph, focusId, expandedIds, search),
    [graph, focusId, expandedIds, search],
  );
  const positions = useMemo(
    () => layoutConstellation(visibleNodes, graph, focusId, WIDTH, HEIGHT),
    [visibleNodes, graph, focusId],
  );
  const positionMap = useMemo(
    () => Object.fromEntries(positions.map((node) => [node.id, node])),
    [positions],
  );
  const relationship = useMemo(
    () => relationshipState(graph, selectedId ?? null),
    [graph, selectedId],
  );
  const breadcrumbs = ancestors(graph, focusId);
  const activeId = hoveredId ?? selectedId;
  const activeNode = activeId ? graph.byId[activeId] : undefined;

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => {
    setFocusId(null);
    setExpandedIds(
      new Set([root.id, ...(root.children ?? []).map((child) => child.id)]),
    );
    setTransform(DEFAULT_TRANSFORM);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    setTransform((current) => ({
      ...current,
      scale: clamp(current.scale * factor, 0.45, 1.85),
    }));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;

    if (target.closest("[data-control='true']")) return;

    event.preventDefault();
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    setIsPanning(true);
  };

  useEffect(() => {
    if (!isPanning) return;

    const handleDocumentPointerMove = (event: globalThis.PointerEvent) => {
      const drag = dragState.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      event.preventDefault();
      setTransform((current) => ({
        ...current,
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }));
    };

    const finishPanning = (event: globalThis.PointerEvent) => {
      if (dragState.current?.pointerId !== event.pointerId) return;
      dragState.current = null;
      setIsPanning(false);
    };

    window.addEventListener("pointermove", handleDocumentPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", finishPanning);
    window.addEventListener("pointercancel", finishPanning);

    return () => {
      window.removeEventListener("pointermove", handleDocumentPointerMove);
      window.removeEventListener("pointerup", finishPanning);
      window.removeEventListener("pointercancel", finishPanning);
    };
  }, [isPanning]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      draggable={false}
      onDragStartCapture={(event) => event.preventDefault()}
      className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] text-white"
      style={{
        height: "clamp(580px, 70vh, 780px)",
        minHeight: 580,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitUserDrag: "none",
        touchAction: "none",
      }}
    >
      <div
        className={[
          "absolute inset-0 h-full w-full touch-none select-none overflow-hidden",
          isPanning ? "cursor-grabbing" : "cursor-grab",
        ].join(" ")}
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,.08),transparent_38%),linear-gradient(rgba(148,163,184,.024)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.024)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px]" />

        <div
          data-control="true"
          className="absolute left-3 right-3 top-3 z-40 flex items-start justify-between gap-3"
        >
          <div className="flex max-w-[62%] items-center gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/90 p-1.5 text-[10px] shadow-xl backdrop-blur">
            <button
              type="button"
              onClick={() => setFocusId(null)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Return to root"
            >
              <IconHome className="h-3.5 w-3.5" />
            </button>
            {breadcrumbs.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() =>
                  setFocusId(node.id === graph.rootId ? null : node.id)
                }
                className="whitespace-nowrap rounded-lg px-2 py-1 text-slate-400 hover:bg-cyan-400/10 hover:text-cyan-300"
              >
                / {node.name}
              </button>
            ))}
          </div>

          <div className="flex rounded-xl border border-slate-700 bg-slate-950/90 p-1 shadow-xl backdrop-blur">
            <Control
              label="Zoom out"
              onClick={() =>
                setTransform((value) => ({
                  ...value,
                  scale: clamp(value.scale - 0.12, 0.45, 1.85),
                }))
              }
            >
              <IconMinus className="h-4 w-4" />
            </Control>
            <Control
              label="Zoom in"
              onClick={() =>
                setTransform((value) => ({
                  ...value,
                  scale: clamp(value.scale + 0.12, 0.45, 1.85),
                }))
              }
            >
              <IconPlus className="h-4 w-4" />
            </Control>
            <Control
              label="Rotate left"
              onClick={() =>
                setTransform((value) => ({
                  ...value,
                  rotation: value.rotation - 15,
                }))
              }
            >
              <IconRotate className="h-4 w-4" />
            </Control>
            <Control
              label="Rotate right"
              onClick={() =>
                setTransform((value) => ({
                  ...value,
                  rotation: value.rotation + 15,
                }))
              }
            >
              <IconRotateClockwise className="h-4 w-4" />
            </Control>
            <Control label="Reset and fit" onClick={reset}>
              <IconRefresh className="h-4 w-4" />
            </Control>
            <Control
              label="Show legend"
              onClick={() => setShowLegend((value) => !value)}
            >
              <IconInfoCircle className="h-4 w-4" />
            </Control>
            <Control label="Full screen" onClick={onFullScreen}>
              <IconArrowsMaximize className="h-4 w-4" />
            </Control>
          </div>
        </div>

        {showLegend ? <Legend onClose={() => setShowLegend(false)} /> : null}

        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="tree"
          aria-label="BOM knowledge graph"
        >
          <defs>
            <filter id={`node-glow-${source}`}>
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id={`edge-arrow-${source}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#67e8f9" opacity="0.65" />
            </marker>
          </defs>

          <motion.g
            animate={{
              x: transform.x,
              y: transform.y,
              scale: transform.scale,
              rotate: transform.rotation,
            }}
            style={{ transformOrigin: `${WIDTH / 2}px ${HEIGHT / 2}px` }}
            transition={{ type: "spring", stiffness: 230, damping: 30 }}
          >
            {graph.edges.map((edge) => {
              const parent = positionMap[edge.sourceId];
              const child = positionMap[edge.targetId];
              if (!parent || !child) return null;

              const ancestorEdge = selectedId
                ? relationship.ancestorIds.has(edge.sourceId) &&
                  (relationship.ancestorIds.has(edge.targetId) ||
                    edge.targetId === selectedId)
                : false;
              const descendantEdge = selectedId
                ? (edge.sourceId === selectedId ||
                    relationship.descendantIds.has(edge.sourceId)) &&
                  relationship.descendantIds.has(edge.targetId)
                : false;
              const related = !selectedId || ancestorEdge || descendantEdge;
              const color = ancestorEdge
                ? "#f59e0b"
                : descendantEdge
                  ? "#10b981"
                  : edge.comparisonStatus
                    ? statusColors[edge.comparisonStatus]
                    : "#67e8f9";

              return (
                <motion.path
                  key={edge.id}
                  d={curvedPath(parent, child)}
                  fill="none"
                  stroke={color}
                  strokeWidth={
                    ancestorEdge || descendantEdge
                      ? 3.4
                      : parent.isRoot
                        ? 2.2
                        : 1.5
                  }
                  strokeOpacity={
                    related
                      ? ancestorEdge || descendantEdge
                        ? 0.95
                        : 0.48
                      : 0.08
                  }
                  markerEnd={`url(#edge-arrow-${source})`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: reducedMotion ? 0 : 0.55 }}
                />
              );
            })}

            {positions.map((node, index) => (
              <CircleNode
                key={node.id}
                node={node}
                selected={selectedId === node.id}
                hovered={hoveredId === node.id}
                related={isRelated(node.id, selectedId, relationship)}
                expanded={expandedIds.has(node.id)}
                rotation={transform.rotation}
                comparison={comparison?.[node.id]}
                reducedMotion={Boolean(reducedMotion)}
                index={index}
                onHover={setHoveredId}
                onSelect={(id) => {
                  const raw = findNode(root, id);
                  if (raw) onSelect(raw);
                }}
                onToggle={toggleExpanded}
                onFocus={setFocusId}
              />
            ))}
          </motion.g>
        </svg>

        {activeNode ? (
          <NodeTooltip
            node={activeNode}
            comparison={comparison?.[activeNode.id]}
            parent={
              activeNode.parentId ? graph.byId[activeNode.parentId] : undefined
            }
            siblings={
              activeNode.parentId
                ? (graph.byId[activeNode.parentId]?.childIds
                    .filter((id) => id !== activeNode.id)
                    .map((id) => graph.byId[id]) ?? [])
                : []
            }
            ancestors={ancestors(graph, activeNode.id)}
            descendants={descendants(graph, activeNode.id)}
          />
        ) : null}

        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950/85 px-3 py-2 text-[10px] text-slate-500 backdrop-blur">
          Drag to pan · Wheel to zoom · Click to inspect · Double-click an
          assembly to isolate
        </div>
      </div>
    </motion.div>
  );
}

function CircleNode({
  node,
  selected,
  hovered,
  related,
  expanded,
  rotation,
  comparison,
  reducedMotion,
  index,
  onHover,
  onSelect,
  onToggle,
  onFocus,
}: {
  node: PositionedVisualNode;
  selected: boolean;
  hovered: boolean;
  related: boolean;
  expanded: boolean;
  rotation: number;
  comparison?: NodeComparison;
  reducedMotion: boolean;
  index: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const roleColor = node.isRoot
    ? roleColors.root
    : node.isAssembly
      ? node.level === 1
        ? roleColors.assembly
        : roleColors.subassembly
      : roleColors.component;
  const statusColor = node.comparisonStatus
    ? statusColors[node.comparisonStatus]
    : "#334155";
  const dimmed = !related && !hovered;

  return (
    <motion.g
      role="treeitem"
      tabIndex={0}
      initial={
        reducedMotion
          ? false
          : { opacity: 0, scale: 0, x: WIDTH / 2, y: HEIGHT / 2 }
      }
      animate={{
        x: node.x,
        y: node.y,
        opacity: dimmed ? 0.13 : 1,
        scale: selected ? 1.16 : hovered ? 1.1 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 240,
        damping: 25,
        delay: Math.min(0.45, index * 0.02),
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (node.isAssembly) onFocus(node.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect(node.id);
      }}
      className="cursor-pointer outline-none"
    >
      <circle
        r={node.nodeRadius + 8}
        fill="transparent"
        stroke={selected ? "#ffffff" : statusColor}
        strokeWidth={selected ? 4 : node.comparisonStatus ? 3 : 1.6}
        strokeOpacity={selected || node.comparisonStatus ? 0.95 : 0.4}
        strokeDasharray={
          node.comparisonStatus === "probable" ? "4 4" : undefined
        }
      />
      <motion.circle
        r={node.nodeRadius}
        fill={roleColor}
        stroke="#e2e8f0"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        filter={
          selected || hovered ? `url(#node-glow-${node.source})` : undefined
        }
        whileHover={{ scale: 1.06 }}
      />

      <text
        textAnchor="middle"
        y="4"
        className="pointer-events-none text-[10px] font-bold"
        style={{ fill: "#ffffff", stroke: "none" }}
      >
        {node.isRoot ? "P" : node.isAssembly ? "A" : "C"}
      </text>

      <g transform={`rotate(${-rotation})`}>
        <text
          textAnchor="middle"
          y={node.nodeRadius + 28}
          className="pointer-events-none text-[11px] font-semibold"
          style={{
            fill: "#f8fafc",
            stroke: "#020617",
            strokeWidth: 3,
            paintOrder: "stroke fill",
          }}
        >
          {shortLabel(node.name, 24)}
        </text>
        <text
          textAnchor="middle"
          y={node.nodeRadius + 44}
          className="pointer-events-none text-[9px] font-medium"
          style={{
            fill: "#67e8f9",
            stroke: "#020617",
            strokeWidth: 2.5,
            paintOrder: "stroke fill",
          }}
        >
          L{node.level + 1} · {node.itemId ? `ID ${node.itemId}` : "No ID"}
        </text>
      </g>

      {node.isAssembly ? (
        <g
          data-control="true"
          transform={`translate(${node.nodeRadius + 7} ${-node.nodeRadius - 7}) rotate(${-rotation})`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.id);
          }}
        >
          <circle r="10" fill="#0f172a" stroke={roleColor} strokeWidth="2" />
          <text
            textAnchor="middle"
            y="4"
            className="pointer-events-none text-[12px] font-bold"
            style={{ fill: "#ffffff", stroke: "none" }}
          >
            {expanded ? "−" : "+"}
          </text>
        </g>
      ) : null}

      {comparison ? <title>{comparison.reasoning.summary}</title> : null}
    </motion.g>
  );
}

function NodeTooltip({
  node,
  comparison,
  parent,
  siblings,
  ancestors: ancestorNodes,
  descendants: descendantNodes,
}: {
  node: VisualBomNode;
  comparison?: NodeComparison;
  parent?: VisualBomNode;
  siblings: VisualBomNode[];
  ancestors: VisualBomNode[];
  descendants: VisualBomNode[];
}) {
  const classification = node.isRoot
    ? "Product root"
    : node.isAssembly
      ? node.level === 1
        ? "Major assembly"
        : "Subassembly"
      : "Leaf component";

  return (
    <motion.aside
      data-control="true"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute bottom-14 right-3 z-50 w-[310px] max-h-[72%] overflow-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-400">
            {classification} · Level {node.level + 1}
          </p>
          <h3 className="mt-2 text-base font-semibold text-white">
            {node.name}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {node.itemId ? `Item ID ${node.itemId}` : "No business identifier"}
          </p>
        </div>
        <span className="rounded-lg border border-slate-700 px-2 py-1 text-[9px] text-slate-400">
          {node.source}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric value={node.childIds.length} label="Children" />
        <Metric value={node.descendantCount} label="Descendants" />
        <Metric value={node.leafCount} label="Leaves" />
      </div>

      <Section title="Hierarchy path">
        <p className="text-[11px] leading-5 text-slate-300">
          {node.path.join("  ›  ")}
        </p>
      </Section>
      <Section title="Relationship context">
        <Line label="Parent" value={parent?.name ?? "None"} />
        <Line
          label="Ancestors"
          value={String(Math.max(0, ancestorNodes.length - 1))}
        />
        <Line
          label="Siblings"
          value={
            siblings.length
              ? siblings.map((item) => item.name).join(", ")
              : "None"
          }
        />
        <Line
          label="Descendants"
          value={
            descendantNodes.length
              ? descendantNodes
                  .map((item) => item.name)
                  .slice(0, 5)
                  .join(", ")
              : "None"
          }
        />
      </Section>
      <Section title="Business attributes">
        <Line label="Quantity" value={node.quantity ?? "Not provided"} />
        <Line label="Revision" value={node.revision ?? "Not provided"} />
      </Section>

      {comparison ? (
        <Section title="Comparison evidence">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: statusColors[comparison.status] }}
            />
            {comparison.status} · {Math.round(comparison.confidence * 100)}%
          </div>
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            {comparison.reasoning.summary}
          </p>
          <ul className="mt-2 space-y-1 text-[10px] leading-4 text-slate-500">
            {comparison.reasoning.details.slice(0, 5).map((detail) => (
              <li key={detail}>• {detail}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </motion.aside>
  );
}

function Legend({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      data-control="true"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute left-3 top-16 z-50 w-52 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-[10px] text-slate-400 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <b className="uppercase tracking-wider text-slate-200">Graph legend</b>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-white"
        >
          Close
        </button>
      </div>
      <LegendLine color={roleColors.root} label="Product root" />
      <LegendLine color={roleColors.assembly} label="Major assembly" />
      <LegendLine color={roleColors.subassembly} label="Subassembly" />
      <LegendLine color={roleColors.component} label="Leaf component" />
      <div className="my-3 border-t border-slate-800" />
      <LegendLine color="#f59e0b" label="Ancestor path" />
      <LegendLine color="#10b981" label="Descendant path" />
      <p className="mt-3 leading-4 text-slate-600">
        Node fill shows structural role. Outer ring shows comparison status.
      </p>
    </motion.div>
  );
}

function Control({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      data-control="true"
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-slate-800 pt-3">
      <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-center">
      <b className="block text-sm text-white">{value}</b>
      <span className="text-[8px] uppercase text-slate-600">{label}</span>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-slate-900 py-1.5 text-[11px]">
      <span className="w-20 shrink-0 text-slate-600">{label}</span>
      <span className="break-words text-slate-300">{value}</span>
    </div>
  );
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function curvedPath(parent: PositionedVisualNode, child: PositionedVisualNode) {
  const centerX = (parent.x + child.x) / 2;
  const centerY = (parent.y + child.y) / 2;
  const bend = Math.min(
    42,
    Math.hypot(child.x - parent.x, child.y - parent.y) * 0.14,
  );
  const normalX = -(child.y - parent.y);
  const normalY = child.x - parent.x;
  const length = Math.max(1, Math.hypot(normalX, normalY));
  return `M ${parent.x} ${parent.y} Q ${centerX + (normalX / length) * bend} ${centerY + (normalY / length) * bend} ${child.x} ${child.y}`;
}

function isRelated(
  id: string,
  selectedId: string | undefined,
  state: ReturnType<typeof relationshipState>,
) {
  return (
    !selectedId ||
    id === selectedId ||
    state.ancestorIds.has(id) ||
    state.descendantIds.has(id) ||
    state.siblingIds.has(id)
  );
}

function findNode(root: TreeNodeData, id: string): TreeNodeData | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function shortLabel(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
