/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  IconArrowsMaximize,
  IconChevronLeft,
  IconClipboard,
  IconDownload,
  IconHome,
  IconX,
} from "@tabler/icons-react";

import {
  buildVisualBomGraph,
  relationshipState,
} from "@/lib/bom-visualization";
import type {
  ComparisonStatus,
  NodeComparison,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
import type { VisualBomGraph, VisualBomNode } from "@/types/bom-visualization";
import {
  layoutRadialBom,
  radialFindings,
  branchChangeCount,
} from "@/lib/bom-radial-layout";
import { RadialAnalysisMode, RadialArcNode } from "@/types/bom-radial";

const SIZE = 760,
  CENTER = SIZE / 2,
  RADIUS = 340;
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
const modes: Array<{ value: RadialAnalysisMode; label: string }> = [
  { value: "structure", label: "Structure" },
  { value: "quantity", label: "Quantity" },
  { value: "comparison", label: "Comparison" },
  { value: "complexity", label: "Complexity" },
  { value: "impact", label: "Impact" },
];

export function BomRadialExplorerView({
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
  const graph = useMemo(
    () => buildVisualBomGraph(root, source, comparison),
    [root, source, comparison],
  );
  const [focusId, setFocusId] = useState(graph.rootId);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mode, setMode] = useState<RadialAnalysisMode>("structure");
  const [zoom, setZoom] = useState(1);
  const [showInsights, setShowInsights] = useState(true);
  const layout = useMemo(
    () => layoutRadialBom(graph, focusId, RADIUS),
    [graph, focusId],
  );
  const findings = useMemo(
    () => radialFindings(graph, comparison),
    [graph, comparison],
  );
  const relationship = useMemo(
    () => relationshipState(graph, selectedId ?? null),
    [graph, selectedId],
  );
  const breadcrumbs = useMemo(() => {
    const result: VisualBomNode[] = [];
    let node: VisualBomNode | undefined = graph.byId[focusId];
    while (node) {
      result.unshift(node);
      node = node.parentId ? graph.byId[node.parentId] : undefined;
    }
    return result;
  }, [graph, focusId]);
  const searchMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return undefined;
    return graph.nodes.find((n) =>
      `${n.name} ${n.itemId ?? ""} ${n.path.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
  }, [graph, search]);
  const activeId = hoveredId ?? selectedId ?? searchMatch?.id;
  const activeNode = activeId ? graph.byId[activeId] : undefined;

  useEffect(() => {
    if (searchMatch) {
      const parent = searchMatch.parentId ?? graph.rootId;
      setFocusId(parent);
      const raw = findNode(root, searchMatch.id);
      if (raw) onSelect(raw);
    }
  }, [graph.rootId, onSelect, root, searchMatch]);

  const select = (id: string) => {
    const raw = findNode(root, id);
    if (raw) onSelect(raw);
  };
  const drill = (node: RadialArcNode) => {
    select(node.id);
    if (node.isAssembly && node.childIds.length) setFocusId(node.id);
  };
  const back = () => {
    const parent = graph.byId[focusId]?.parentId;
    if (parent) setFocusId(parent);
  };
  const summary = () => ({
    source,
    focus: graph.byId[focusId]?.name,
    mode,
    selected: activeNode?.name,
    path: activeNode?.path,
    branchContribution: layout.byId[activeNode?.id ?? ""]?.contribution,
    findings,
  });
  const copy = async () =>
    navigator.clipboard.writeText(JSON.stringify(summary(), null, 2));
  const download = () => {
    const blob = new Blob([JSON.stringify(summary(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${source}-radial-bom-analysis.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      className="relative w-full shrink-0 overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] text-white"
      style={{ height: "clamp(620px,74vh,850px)", minHeight: 620 }}
    >
      <div className="absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-3">
        <div className="max-w-[58%] rounded-xl border border-slate-700 bg-slate-950/92 p-1.5 shadow-xl backdrop-blur">
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setFocusId(graph.rootId)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white"
            >
              <IconHome className="h-4 w-4" />
            </button>
            {breadcrumbs.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setFocusId(node.id)}
                className="whitespace-nowrap rounded-lg px-2 py-1 text-[10px] text-slate-500 hover:bg-cyan-500/10 hover:text-cyan-300"
              >
                / {node.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex rounded-xl border border-slate-700 bg-slate-950/92 p-1 shadow-xl backdrop-blur">
          <Control label="Back one level" onClick={back}>
            <IconChevronLeft />
          </Control>
          <Control
            label="Reset"
            onClick={() => {
              setFocusId(graph.rootId);
              setZoom(1);
            }}
          >
            <IconHome />
          </Control>
          <Control label="Copy analysis" onClick={() => void copy()}>
            <IconClipboard />
          </Control>
          <Control label="Download analysis" onClick={download}>
            <IconDownload />
          </Control>
          <Control label="Full screen" onClick={onFullScreen}>
            <IconArrowsMaximize />
          </Control>
        </div>
      </div>

      <div className="absolute left-3 top-[72px] z-30 flex flex-wrap gap-1 rounded-xl border border-slate-700 bg-slate-950/92 p-1.5 backdrop-blur">
        {modes.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMode(item.value)}
            className={
              mode === item.value
                ? "rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[9px] font-semibold"
                : "rounded-lg px-2.5 py-1.5 text-[9px] text-slate-500 hover:bg-slate-800 hover:text-white"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center pt-10"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) =>
            Math.min(
              1.7,
              Math.max(0.58, value * (event.deltaY > 0 ? 0.92 : 1.08)),
            ),
          );
        }}
      >
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-full w-full max-w-[900px]"
          aria-label="Radial BOM explorer"
        >
          <g transform={`translate(${CENTER} ${CENTER}) scale(${zoom})`}>
            {layout.nodes
              .filter((n) => n.relativeLevel > 0)
              .map((node) => (
                <Arc
                  key={node.id}
                  node={node}
                  mode={mode}
                  comparison={comparison?.[node.id]}
                  selected={selectedId === node.id}
                  related={isRelated(node.id, selectedId, relationship)}
                  hovered={hoveredId === node.id}
                  changeCount={branchChangeCount(graph, node.id, comparison)}
                  onHover={setHoveredId}
                  onSelect={() => select(node.id)}
                  onDrill={() => drill(node)}
                />
              ))}
            <CenterNode
              node={graph.byId[focusId]}
              selected={selectedId === focusId}
              onClick={() => select(focusId)}
              onBack={back}
            />
          </g>
        </svg>
      </div>

      <div className="absolute bottom-3 left-3 z-30 w-[235px] rounded-xl border border-slate-700 bg-slate-950/92 p-3 backdrop-blur">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>Zoom</span>
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <input
          type="range"
          min=".58"
          max="1.7"
          step=".01"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="mt-2 w-full accent-cyan-500"
        />
        <p className="mt-2 text-[9px] text-slate-600">
          Click to select · Double-click to drill · Wheel to zoom
        </p>
      </div>

      {activeNode ? (
        <HoverCard
          node={activeNode}
          graph={graph}
          arc={layout.byId[activeNode.id]}
          comparison={comparison?.[activeNode.id]}
          changeCount={branchChangeCount(graph, activeNode.id, comparison)}
        />
      ) : null}
      {showInsights ? (
        <RadialInsights
          graph={graph}
          focus={graph.byId[focusId]}
          comparison={comparison}
          findings={findings}
          activeNode={activeNode}
          onFinding={(id) => {
            const node = graph.byId[id];
            setFocusId(node.parentId ?? graph.rootId);
            select(id);
          }}
          onClose={() => setShowInsights(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowInsights(true)}
          className="absolute bottom-3 right-3 z-30 rounded-xl border border-slate-700 bg-slate-950/92 px-3 py-2 text-[10px] text-cyan-300"
        >
          Open overview
        </button>
      )}
    </motion.div>
  );
}

function Arc({
  node,
  mode,
  comparison,
  selected,
  related,
  hovered,
  changeCount,
  onHover,
  onSelect,
  onDrill,
}: {
  node: RadialArcNode;
  mode: RadialAnalysisMode;
  comparison?: NodeComparison;
  selected: boolean;
  related: boolean;
  hovered: boolean;
  changeCount: number;
  onHover: (id: string | null) => void;
  onSelect: () => void;
  onDrill: () => void;
}) {
  const gap = Math.min(0.018, (node.endAngle - node.startAngle) * 0.08);
  const start = node.startAngle + gap,
    end = node.endAngle - gap;
  const path = arcPath(start, end, node.innerRadius, node.outerRadius);
  const color = arcColor(node, mode, comparison, selected, changeCount);
  const angle = (start + end) / 2,
    r = (node.innerRadius + node.outerRadius) / 2;
  const x = Math.cos(angle) * r,
    y = Math.sin(angle) * r;
  const showLabel =
    end - start > 0.11 && node.outerRadius - node.innerRadius > 25;
  return (
    <g
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDrill();
      }}
      className="cursor-pointer"
    >
      <motion.path
        d={path}
        fill={color}
        stroke={selected ? "#ffffff" : "#020617"}
        strokeWidth={selected ? 3 : 1.5}
        opacity={related ? 1 : 0.12}
        initial={{ opacity: 0 }}
        animate={{ opacity: related ? 1 : 0.12 }}
        whileHover={{ opacity: 1 }}
      />
      {comparison ? (
        <path
          d={arcPath(start, end, node.outerRadius - 5, node.outerRadius)}
          fill={statusColors[comparison.status]}
          opacity=".95"
          pointerEvents="none"
        />
      ) : null}
      {showLabel ? (
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${(angle * 180) / Math.PI + 90} ${x} ${y})`}
          style={{
            fill: "#f8fafc",
            fontSize: hovered ? 11 : 9,
            fontWeight: 600,
            paintOrder: "stroke fill",
            stroke: "#020617",
            strokeWidth: 3,
          }}
          pointerEvents="none"
        >
          {shortLabel(node.name, 18)}
        </text>
      ) : null}
    </g>
  );
}
function CenterNode({
  node,
  selected,
  onClick,
  onBack,
}: {
  node?: VisualBomNode;
  selected: boolean;
  onClick: () => void;
  onBack: () => void;
}) {
  if (!node) return null;
  return (
    <g className="cursor-pointer" onClick={onClick} onDoubleClick={onBack}>
      <circle
        r="54"
        fill="#083344"
        stroke={selected ? "#ffffff" : "#22d3ee"}
        strokeWidth={selected ? 4 : 2}
      />
      <text
        textAnchor="middle"
        y="-7"
        style={{ fill: "#f8fafc", fontSize: 12, fontWeight: 700 }}
      >
        {shortLabel(node.name, 15)}
      </text>
      <text textAnchor="middle" y="12" style={{ fill: "#67e8f9", fontSize: 8 }}>
        CURRENT FOCUS
      </text>
      <text textAnchor="middle" y="27" style={{ fill: "#64748b", fontSize: 8 }}>
        {node.childIds.length} children
      </text>
    </g>
  );
}
function HoverCard({
  node,
  graph,
  arc,
  comparison,
  changeCount,
}: {
  node: VisualBomNode;
  graph: VisualBomGraph;
  arc?: RadialArcNode;
  comparison?: NodeComparison;
  changeCount: number;
}) {
  const parent = node.parentId ? graph.byId[node.parentId] : undefined;
  return (
    <div className="pointer-events-none absolute bottom-3 left-[255px] z-30 w-[280px] rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
      <p className="text-[9px] font-bold uppercase tracking-[.16em] text-cyan-400">
        {node.isAssembly ? "Assembly" : "Component"} · Level {node.level + 1}
      </p>
      <h3 className="mt-2 text-sm font-semibold">{node.name}</h3>
      <p className="mt-1 text-[10px] text-slate-500">
        {node.itemId ? `Item ID ${node.itemId}` : "No identifier"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric
          value={`${Math.round((arc?.contribution ?? 0) * 100)}%`}
          label="Branch"
        />
        <Metric value={node.descendantCount} label="Below" />
        <Metric value={changeCount} label="Changes" />
      </div>
      <div className="mt-3 text-[10px] leading-5 text-slate-400">
        <p>Parent: {parent?.name ?? "None"}</p>
        <p>Quantity: {node.quantity ?? "Not provided"}</p>
        <p>Path: {node.path.join(" › ")}</p>
        {comparison ? (
          <>
            <p className="mt-2 text-white">
              {comparison.status} · {Math.round(comparison.confidence * 100)}%
            </p>
            <p>{comparison.reasoning.summary}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
function RadialInsights({
  graph,
  focus,
  comparison,
  findings,
  activeNode,
  onFinding,
  onClose,
}: {
  graph: VisualBomGraph;
  focus?: VisualBomNode;
  comparison?: Record<string, NodeComparison>;
  findings: ReturnType<typeof radialFindings>;
  activeNode?: VisualBomNode;
  onFinding: (id: string) => void;
  onClose: () => void;
}) {
  const assemblies = graph.nodes.filter((n) => n.isAssembly).length;
  const leaves = graph.nodes.length - assemblies;
  const largest = [...graph.nodes]
    .filter((n) => n.isAssembly)
    .sort((a, b) => b.descendantCount - a.descendantCount)[0];
  const changes = graph.nodes.reduce(
    (sum, n) => sum + branchChangeCount(graph, n.id, comparison),
    0,
  );
  return (
    <aside className="absolute bottom-3 right-3 top-[72px] z-30 w-[325px] overflow-auto rounded-2xl border border-slate-700 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[.18em] text-cyan-400">
          Manager overview
        </p>
        <button type="button" onClick={onClose}>
          <IconX className="h-4 w-4 text-slate-500" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric value={graph.nodes.length} label="Items" />
        <Metric value={assemblies} label="Assemblies" />
        <Metric value={leaves} label="Leaves" />
      </div>
      <Section title="Product structure">
        <Info label="Current focus" value={focus?.name ?? "None"} />
        <Info label="Largest branch" value={largest?.name ?? "None"} />
        <Info label="Maximum depth" value={String(graph.maxLevel + 1)} />
        <Info label="Change signals" value={String(changes)} />
      </Section>
      {activeNode ? (
        <Section title="Selected branch">
          <p className="text-sm font-semibold">{activeNode.name}</p>
          <p className="mt-1 text-[10px] text-slate-500">
            {activeNode.path.join(" › ")}
          </p>
          <p className="mt-2 text-[10px] text-slate-400">
            {activeNode.descendantCount} descendants · {activeNode.leafCount}{" "}
            leaves · {branchChangeCount(graph, activeNode.id, comparison)}{" "}
            change signals
          </p>
        </Section>
      ) : null}
      <Section title="Priority branches">
        <div className="space-y-2">
          {findings.length ? (
            findings.slice(0, 7).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFinding(f.nodeId)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-left hover:border-cyan-500/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${f.severity === "high" ? "bg-rose-500" : f.severity === "medium" ? "bg-amber-500" : "bg-sky-500"}`}
                  />
                  <b className="text-[10px]">{f.title}</b>
                </div>
                <p className="mt-1 text-[9px] leading-4 text-slate-500">
                  {f.detail}
                </p>
              </button>
            ))
          ) : (
            <p className="text-[10px] text-emerald-400">
              No priority findings detected.
            </p>
          )}
        </div>
      </Section>
    </aside>
  );
}
function arcColor(
  node: RadialArcNode,
  mode: RadialAnalysisMode,
  comparison: NodeComparison | undefined,
  selected: boolean,
  changes: number,
) {
  if (selected) return "#ffffff";
  if (mode === "comparison")
    return comparison ? statusColors[comparison.status] : "#334155";
  if (mode === "quantity") {
    const q = Math.max(1, Number.parseFloat(node.quantity ?? "1") || 1);
    return q > 5 ? "#0891b2" : q > 2 ? "#0e7490" : "#155e75";
  }
  if (mode === "complexity") {
    const score = node.descendantCount + node.leafCount * 1.5;
    return score > 25
      ? "#f43f5e"
      : score > 12
        ? "#f59e0b"
        : score > 5
          ? "#eab308"
          : "#22c55e";
  }
  if (mode === "impact")
    return changes > 2 ? "#f43f5e" : changes > 0 ? "#f59e0b" : "#1e293b";
  return node.isRoot
    ? roleColors.root
    : node.isAssembly
      ? node.level === 1
        ? roleColors.assembly
        : roleColors.subassembly
      : roleColors.component;
}
function arcPath(start: number, end: number, inner: number, outer: number) {
  const large = end - start > Math.PI ? 1 : 0;
  const p1 = polar(start, outer),
    p2 = polar(end, outer),
    p3 = polar(end, inner),
    p4 = polar(start, inner);
  return `M ${p1.x} ${p1.y} A ${outer} ${outer} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${inner} ${inner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}
function polar(angle: number, r: number) {
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
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
      <h4 className="mb-2 text-[9px] font-bold uppercase tracking-[.15em] text-slate-600">
        {title}
      </h4>
      {children}
    </section>
  );
}
function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-center">
      <b className="block text-sm">{value}</b>
      <span className="text-[8px] uppercase text-slate-600">{label}</span>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 border-b border-slate-900 py-1.5 text-[10px]">
      <span className="w-24 text-slate-600">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
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
