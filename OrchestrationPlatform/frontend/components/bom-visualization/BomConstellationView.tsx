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
  IconX,
} from "@tabler/icons-react";
import { RequirementSnapshotCard } from "@/components/bom-requirements/RequirementSnapshotCard";
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
import type { RequirementTraceResult } from "@/types/requirement-trace";
const WIDTH = 1120,
  HEIGHT = 760,
  DEFAULT_TRANSFORM: GraphTransform = { x: 0, y: 0, scale: 0.93, rotation: 0 };
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
  onClearSelection,
  onFullScreen,
  requirementTraceEnabled = false,
  requirementResult,
}: {
  root: TreeNodeData;
  source: SourceType;
  comparison?: Record<string, NodeComparison>;
  search: string;
  selectedId?: string;
  onSelect: (node: TreeNodeData) => void;
  onClearSelection: () => void;
  onFullScreen: () => void;
  requirementTraceEnabled?: boolean;
  requirementResult?: RequirementTraceResult | null;
}) {
  const reduced = useReducedMotion(),
    drag = useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    } | null>(null);
  const [panning, setPanning] = useState(false),
    [focusId, setFocusId] = useState<string | null>(null),
    [expanded, setExpanded] = useState<Set<string>>(
      () => new Set([root.id, ...(root.children ?? []).map((c) => c.id)]),
    ),
    [hovered, setHovered] = useState<string | null>(null),
    [transform, setTransform] = useState(DEFAULT_TRANSFORM),
    [legend, setLegend] = useState(false),
    [tooltipDismissed, setTooltipDismissed] = useState(false);
  const graph = useMemo(
      () => buildVisualBomGraph(root, source, comparison),
      [root, source, comparison],
    ),
    visible = useMemo(
      () => visibleBranch(graph, focusId, expanded, search),
      [graph, focusId, expanded, search],
    ),
    positions = useMemo(
      () => layoutConstellation(visible, graph, focusId, WIDTH, HEIGHT),
      [visible, graph, focusId],
    ),
    positionMap = useMemo(
      () => Object.fromEntries(positions.map((node) => [node.id, node])),
      [positions],
    ),
    relationship = useMemo(
      () => relationshipState(graph, selectedId ?? null),
      [graph, selectedId],
    ),
    breadcrumbs = ancestors(graph, focusId),
    activeId = hovered ?? selectedId,
    activeNode =
      !tooltipDismissed && activeId ? graph.byId[activeId] : undefined,
    traceNode = selectedId ? positionMap[selectedId] : undefined;
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const reset = () => {
    setFocusId(null);
    setExpanded(new Set([root.id, ...(root.children ?? []).map((c) => c.id)]));
    setTransform(DEFAULT_TRANSFORM);
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setTransform((current) => ({
      ...current,
      scale: clamp(current.scale * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 1.85),
    }));
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("[data-control='true']")) return;
    event.preventDefault();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    setPanning(true);
  };
  useEffect(() => {
    if (!panning) return;
    const move = (event: globalThis.PointerEvent) => {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      setTransform((current) => ({
        ...current,
        x: state.originX + event.clientX - state.startX,
        y: state.originY + event.clientY - state.startY,
      }));
    };
    const finish = (event: globalThis.PointerEvent) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      setPanning(false);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [panning]);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      className="relative w-full shrink-0 select-none overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] text-white"
      style={{
        height: "clamp(580px,70vh,780px)",
        minHeight: 580,
        touchAction: "none",
      }}
    >
      <div
        className={`absolute inset-0 h-full w-full touch-none overflow-hidden ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        onWheel={wheel}
        onPointerDown={down}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,.10),transparent_38%),linear-gradient(rgba(148,163,184,.024)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.024)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px]" />
        <div
          data-control="true"
          className="absolute left-3 right-3 top-3 z-40 flex items-start justify-between gap-3"
        >
          <div className="flex max-w-[62%] items-center gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/90 p-1.5 text-[10px]">
            <button
              onClick={() => setFocusId(null)}
              className="rounded-lg p-1.5 text-slate-400"
            >
              <IconHome className="h-3.5 w-3.5" />
            </button>
            {breadcrumbs.map((node) => (
              <button
                key={node.id}
                onClick={() =>
                  setFocusId(node.id === graph.rootId ? null : node.id)
                }
                className="whitespace-nowrap rounded-lg px-2 py-1 text-slate-400"
              >
                / {node.name}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-slate-700 bg-slate-950/90 p-1">
            <Control
              label="Zoom out"
              onClick={() =>
                setTransform((v) => ({
                  ...v,
                  scale: clamp(v.scale - 0.12, 0.45, 1.85),
                }))
              }
            >
              <IconMinus />
            </Control>
            <Control
              label="Zoom in"
              onClick={() =>
                setTransform((v) => ({
                  ...v,
                  scale: clamp(v.scale + 0.12, 0.45, 1.85),
                }))
              }
            >
              <IconPlus />
            </Control>
            <Control
              label="Rotate left"
              onClick={() =>
                setTransform((v) => ({ ...v, rotation: v.rotation - 15 }))
              }
            >
              <IconRotate />
            </Control>
            <Control
              label="Rotate right"
              onClick={() =>
                setTransform((v) => ({ ...v, rotation: v.rotation + 15 }))
              }
            >
              <IconRotateClockwise />
            </Control>
            <Control label="Reset" onClick={reset}>
              <IconRefresh />
            </Control>
            <Control label="Legend" onClick={() => setLegend((v) => !v)}>
              <IconInfoCircle />
            </Control>
            <Control label="Full screen" onClick={onFullScreen}>
              <IconArrowsMaximize />
            </Control>
          </div>
        </div>
        {legend ? <Legend onClose={() => setLegend(false)} /> : null}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <filter id={`node-glow-${source}`}>
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`trace-glow-${source}`}>
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
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
              const a = positionMap[edge.sourceId],
                b = positionMap[edge.targetId];
              if (!a || !b) return null;
              const ancestorEdge =
                  !!selectedId &&
                  relationship.ancestorIds.has(edge.sourceId) &&
                  (relationship.ancestorIds.has(edge.targetId) ||
                    edge.targetId === selectedId),
                descendantEdge =
                  !!selectedId &&
                  (edge.sourceId === selectedId ||
                    relationship.descendantIds.has(edge.sourceId)) &&
                  relationship.descendantIds.has(edge.targetId),
                related = !selectedId || ancestorEdge || descendantEdge,
                color = ancestorEdge
                  ? "#f59e0b"
                  : descendantEdge
                    ? "#10b981"
                    : edge.comparisonStatus
                      ? statusColors[edge.comparisonStatus]
                      : "#67e8f9";
              return (
                <motion.path
                  key={edge.id}
                  d={curvedPath(a, b)}
                  fill="none"
                  stroke={color}
                  strokeWidth={
                    ancestorEdge || descendantEdge ? 3.4 : a.isRoot ? 2.2 : 1.5
                  }
                  strokeOpacity={
                    related
                      ? ancestorEdge || descendantEdge
                        ? 0.95
                        : 0.48
                      : 0.08
                  }
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: reduced ? 0 : 0.55 }}
                />
              );
            })}
            {requirementTraceEnabled && requirementResult && traceNode ? (
              <motion.path
                d={`M ${traceNode.x} ${traceNode.y} Q ${traceNode.x + 90} ${traceNode.y - 90} ${WIDTH - 300} 165`}
                fill="none"
                stroke="#a78bfa"
                strokeWidth="3"
                strokeDasharray="8 8"
                filter={`url(#trace-glow-${source})`}
                animate={{
                  strokeDashoffset: [0, -32],
                  opacity: [0.45, 1, 0.45],
                }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            ) : null}
            {positions.map((node, index) => (
              <CircleNode
                key={node.id}
                node={node}
                selected={selectedId === node.id}
                traceSelected={
                  requirementTraceEnabled && selectedId === node.id
                }
                hovered={hovered === node.id}
                related={isRelated(node.id, selectedId, relationship)}
                expanded={expanded.has(node.id)}
                rotation={transform.rotation}
                comparison={comparison?.[node.id]}
                reduced={Boolean(reduced)}
                index={index}
                onHover={setHovered}
                onSelect={(id) => {
                  const raw = findNode(root, id);
                  if (raw) {
                    setTooltipDismissed(false);
                    onSelect(raw);
                  }
                }}
                onToggle={toggle}
                onFocus={setFocusId}
              />
            ))}
          </motion.g>
        </svg>
        {requirementTraceEnabled && requirementResult ? (
          <RequirementSnapshotCard
            result={requirementResult}
            className="absolute right-5 top-28 z-50"
          />
        ) : activeNode ? (
          <NodeTooltip
            node={activeNode}
            comparison={comparison?.[activeNode.id]}
            parent={
              activeNode.parentId ? graph.byId[activeNode.parentId] : undefined
            }
            ancestors={ancestors(graph, activeNode.id)}
            descendants={descendants(graph, activeNode.id)}
            onClose={() => {
              setHovered(null);
              setTooltipDismissed(true);
              onClearSelection();
            }}
          />
        ) : null}
      </div>
    </motion.div>
  );
}
function CircleNode({
  node,
  selected,
  traceSelected,
  hovered,
  related,
  expanded,
  rotation,
  comparison,
  reduced,
  index,
  onHover,
  onSelect,
  onToggle,
  onFocus,
}: {
  node: PositionedVisualNode;
  selected: boolean;
  traceSelected: boolean;
  hovered: boolean;
  related: boolean;
  expanded: boolean;
  rotation: number;
  comparison?: NodeComparison;
  reduced: boolean;
  index: number;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const role = node.isRoot
      ? roleColors.root
      : node.isAssembly
        ? node.level === 1
          ? roleColors.assembly
          : roleColors.subassembly
        : roleColors.component,
    status = node.comparisonStatus
      ? statusColors[node.comparisonStatus]
      : "#334155";
  return (
    <motion.g
      role="treeitem"
      tabIndex={0}
      initial={
        reduced ? false : { opacity: 0, scale: 0, x: WIDTH / 2, y: HEIGHT / 2 }
      }
      animate={{
        x: node.x,
        y: node.y,
        opacity: related || hovered ? 1 : 0.13,
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
      className="cursor-pointer outline-none"
    >
      {traceSelected ? (
        <motion.circle
          r={node.nodeRadius + 16}
          fill="transparent"
          stroke="#a78bfa"
          strokeWidth="4"
          animate={{
            r: [
              node.nodeRadius + 10,
              node.nodeRadius + 22,
              node.nodeRadius + 10,
            ],
            opacity: [1, 0.2, 1],
          }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      ) : null}
      <circle
        r={node.nodeRadius + 8}
        fill="transparent"
        stroke={traceSelected ? "#a78bfa" : selected ? "#fff" : status}
        strokeWidth={selected ? 4 : node.comparisonStatus ? 3 : 1.6}
        strokeOpacity={selected || node.comparisonStatus ? 0.95 : 0.4}
      />
      <motion.circle
        r={node.nodeRadius}
        fill={role}
        stroke="#e2e8f0"
        strokeOpacity=".7"
        strokeWidth="1.5"
        filter={
          selected || hovered ? `url(#node-glow-${node.source})` : undefined
        }
      />
      <text
        textAnchor="middle"
        y="4"
        className="pointer-events-none text-[10px] font-bold"
        fill="#fff"
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
          <circle r="10" fill="#0f172a" stroke={role} strokeWidth="2" />
          <text textAnchor="middle" y="4" fill="#fff">
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
  ancestors: up,
  descendants: down,
  onClose,
}: {
  node: VisualBomNode;
  comparison?: NodeComparison;
  parent?: VisualBomNode;
  ancestors: VisualBomNode[];
  descendants: VisualBomNode[];
  onClose: () => void;
}) {
  return (
    <motion.aside
      data-control="true"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="absolute bottom-14 right-3 z-50 w-[310px] max-h-[72%] overflow-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl"
    >
      <div className="flex justify-between">
        <div>
          <p className="text-[9px] uppercase text-cyan-400">
            Level {node.level + 1}
          </p>
          <h3 className="mt-2 font-semibold">{node.name}</h3>
          <p className="text-xs text-slate-500">
            {node.itemId ? `Item ID ${node.itemId}` : "No ID"}
          </p>
        </div>
        <button onClick={onClose}>
          <IconX className="h-4 w-4" />
        </button>
      </div>
      <Section title="Hierarchy">
        <p className="text-[11px] text-slate-300">{node.path.join(" › ")}</p>
        <p className="mt-2 text-[10px] text-slate-500">
          Parent: {parent?.name ?? "None"} · Ancestors{" "}
          {Math.max(0, up.length - 1)} · Descendants {down.length}
        </p>
      </Section>
      {comparison ? (
        <Section title="Comparison">
          <p className="text-xs text-white">
            {comparison.status} · {Math.round(comparison.confidence * 100)}%
          </p>
          <p className="mt-2 text-[10px] text-slate-400">
            {comparison.reasoning.summary}
          </p>
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
      className="absolute left-3 top-16 z-50 w-52 rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-[10px] text-slate-400"
    >
      <div className="flex justify-between">
        <b>Graph legend</b>
        <button onClick={onClose}>Close</button>
      </div>
      <p className="mt-3">Violet pulse: Requirement Trace selection</p>
      <p className="mt-2">Amber: ancestor path</p>
      <p className="mt-2">Green: descendant path</p>
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
      <h4 className="mb-2 text-[9px] font-bold uppercase text-slate-600">
        {title}
      </h4>
      {children}
    </section>
  );
}
function curvedPath(a: PositionedVisualNode, b: PositionedVisualNode) {
  const cx = (a.x + b.x) / 2,
    cy = (a.y + b.y) / 2,
    bend = Math.min(42, Math.hypot(b.x - a.x, b.y - a.y) * 0.14),
    nx = -(b.y - a.y),
    ny = b.x - a.x,
    length = Math.max(1, Math.hypot(nx, ny));
  return `M ${a.x} ${a.y} Q ${cx + (nx / length) * bend} ${cy + (ny / length) * bend} ${b.x} ${b.y}`;
}
function isRelated(
  id: string,
  selected: string | undefined,
  state: ReturnType<typeof relationshipState>,
) {
  return (
    !selected ||
    id === selected ||
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
