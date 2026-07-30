/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconFocus2,
  IconPin,
  IconPinnedOff,
  IconSearch,
  IconTopologyStar3,
  IconX,
} from "@tabler/icons-react";
import { RequirementSnapshotCard } from "@/components/bom-requirements/RequirementSnapshotCard";
import { BomConstellationLensSelector } from "@/components/bom-visualization/BomConstellationLensSelector";
import { BomConstellationMinimap } from "@/components/bom-visualization/BomConstellationMinimap";
import { BomConstellationNodeDetails } from "@/components/bom-visualization/BomConstellationNodeDetails";
import { BomConstellationToolbar } from "@/components/bom-visualization/BomConstellationToolbar";
import { useCrossBomImpact } from "@/lib/cross-bom-impact-store";
import {
  constellationFindings,
  constellationSummary,
} from "@/lib/bom-constellation-analysis";
import {
  exportConstellationPng,
  exportConstellationSvg,
} from "@/lib/bom-constellation-export";
import {
  expandedToDepth,
  lowestCommonAncestor,
  safeFileName,
} from "@/lib/bom-constellation-interaction";
import { layoutConstellationGraph } from "@/lib/bom-constellation-layout";
import { searchConstellation } from "@/lib/bom-constellation-search";
import { scanBomDataQuality } from "@/lib/bom-data-quality";
import {
  ancestors,
  buildVisualBomGraph,
  deriveVisibleGraph,
  relationshipState,
} from "@/lib/bom-visualization";
import type {
  NodeComparison,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
import type {
  ConstellationColorMode,
  ConstellationFocusMode,
  ConstellationLabelMode,
  ConstellationLayoutMode,
  ConstellationLens,
  ConstellationNode,
  ConstellationSizeMode,
  ConstellationSpacing,
  ConstellationTransform,
  VisibilityMode,
} from "@/types/bom-constellation";
import type {
  ConstellationBox,
  ConstellationDepth,
  ConstellationEdgeMode,
  ConstellationHistoryEntry,
  ConstellationInteractionMode,
  ConstellationSavedView,
} from "@/types/bom-constellation-interaction";
import type {
  RequirementTraceResult,
  ReverseRequirementTraceResult,
} from "@/types/requirement-trace";
const W = 1400,
  H = 900,
  DEFAULT: ConstellationTransform = { x: 0, y: 0, scale: 0.78, rotation: 0 },
  STORAGE = "bom-constellation-saved-views-v1";
const STATUS = {
    matched: "#10b981",
    changed: "#f59e0b",
    missing: "#f43f5e",
    "source-only": "#0ea5e9",
    probable: "#8b5cf6",
  },
  LEVEL = ["#06b6d4", "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];
type Props = {
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
  requirementFocus?: ReverseRequirementTraceResult | null;
};
type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};
type Menu = { id: string; x: number; y: number };
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
  requirementFocus,
}: Props) {
  const impact = useCrossBomImpact(),
    graph = useMemo(
      () => buildVisualBomGraph(root, source, comparison, true),
      [root, source, comparison],
    );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set()),
    [selected, setSelected] = useState<string | null>(null),
    [multi, setMulti] = useState<Set<string>>(() => new Set()),
    [pinned, setPinned] = useState<Set<string>>(() => new Set()),
    [hovered, setHovered] = useState<string | null>(null),
    [transform, setTransform] = useState(DEFAULT),
    [layoutMode, setLayoutMode] =
      useState<ConstellationLayoutMode>("radial-clusters"),
    [spacing, setSpacing] = useState<ConstellationSpacing>("expanded"),
    [labels, setLabels] = useState<ConstellationLabelMode>("smart"),
    [focusMode, setFocusMode] = useState<ConstellationFocusMode>("full"),
    [lens, setLens] = useState<ConstellationLens>("structure"),
    [colorBy, setColorBy] = useState<ConstellationColorMode>("role"),
    [sizeBy, setSizeBy] = useState<ConstellationSizeMode>("role"),
    [unrelated, setUnrelated] = useState<VisibilityMode>("ghost"),
    [matched, setMatched] = useState<VisibilityMode>("show"),
    [mode, setMode] = useState<ConstellationInteractionMode>("pointer"),
    [spaceHand, setSpaceHand] = useState(false),
    [panning, setPanning] = useState(false),
    [box, setBox] = useState<ConstellationBox | null>(null),
    [edgeMode, setEdgeMode] = useState<ConstellationEdgeMode>("curved"),
    [depth, setDepth] = useState<ConstellationDepth>(1),
    [labelDensity, setLabelDensity] = useState(60),
    [layoutLocked, setLayoutLocked] = useState(false),
    [isolatedRoot, setIsolatedRoot] = useState<string | null>(null),
    [menu, setMenu] = useState<Menu | null>(null),
    [findingsOpen, setFindingsOpen] = useState(false),
    [basketOpen, setBasketOpen] = useState(false),
    [viewsOpen, setViewsOpen] = useState(false),
    [savedViews, setSavedViews] = useState<ConstellationSavedView[]>([]),
    [history, setHistory] = useState<ConstellationHistoryEntry[]>([]),
    [historyIndex, setHistoryIndex] = useState(-1),
    [tourActive, setTourActive] = useState(false),
    [tourIndex, setTourIndex] = useState(0),
    [searchIndex, setSearchIndex] = useState(0),
    [differenceIndex, setDifferenceIndex] = useState(0);
  const drag = useRef<Drag | null>(null),
    frame = useRef<number | null>(null),
    pending = useRef<{ x: number; y: number } | null>(null),
    svg = useRef<SVGSVGElement | null>(null),
    canvas = useRef<HTMLDivElement | null>(null);
  const hand = mode === "hand" || spaceHand;
  useEffect(() => {
    setExpanded(new Set([graph.rootId]));
    setSelected(null);
    setMulti(new Set());
    setPinned(new Set());
    setTransform(DEFAULT);
    setIsolatedRoot(null);
  }, [graph.rootId]);
  useEffect(() => {
    if (!selectedId) return;
    const id = graph.bySourceNodeId[selectedId]?.[0];
    if (id) setSelected(id);
  }, [selectedId, graph]);
  useEffect(() => {
    try {
      setSavedViews(JSON.parse(localStorage.getItem(STORAGE) || "[]"));
    } catch {
      setSavedViews([]);
    }
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches("input,textarea,select")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHand(true);
      } else if (e.key.toLowerCase() === "h") setMode("hand");
      else if (e.key.toLowerCase() === "v") setMode("pointer");
      else if (e.key.toLowerCase() === "b") setMode("box-select");
      else if (e.key === "Escape") {
        setMode("pointer");
        setSpaceHand(false);
        setBox(null);
        setMenu(null);
        drag.current = null;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHand(false);
    };
    const blur = () => {
      setSpaceHand(false);
      setPanning(false);
      drag.current = null;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const reqIds = useMemo(
      () =>
        new Set(
          (
            requirementFocus?.occurrences.filter((x) => x.source === source) ??
            []
          ).flatMap((x) => graph.bySourceNodeId[x.nodeId] ?? []),
        ),
      [requirementFocus, source, graph],
    ),
    impactIds = useMemo(
      () =>
        new Set(
          (
            impact.result?.occurrences.filter((x) => x.source === source) ?? []
          ).flatMap((x) => graph.bySourceNodeId[x.nodeId] ?? []),
        ),
      [impact.result, source, graph],
    ),
    results = useMemo(
      () => searchConstellation(graph, search),
      [graph, search],
    ),
    searchIds = useMemo(() => new Set(results.map((x) => x.nodeId)), [results]),
    forced = useMemo(
      () => new Set([...reqIds, ...impactIds, ...searchIds, ...pinned]),
      [reqIds, impactIds, searchIds, pinned],
    );
  useEffect(() => setSearchIndex(0), [search]);
  useEffect(() => {
    if (!forced.size) return;
    setExpanded((cur) => {
      const n = new Set(cur);
      forced.forEach((id) => ancestors(graph, id).forEach((x) => n.add(x.id)));
      return n;
    });
  }, [forced, graph]);
  const rel = useMemo(
      () => relationshipState(graph, selected),
      [graph, selected],
    ),
    base = useMemo(
      () =>
        deriveVisibleGraph(
          graph,
          new Set(expanded),
          isolatedRoot ?? selected,
          isolatedRoot ? "branch" : focusMode,
          search,
          forced,
        ),
      [graph, expanded, selected, isolatedRoot, focusMode, search, forced],
    ),
    visible = useMemo(() => {
      const contextual = (id: string) =>
        !selected ||
        id === selected ||
        rel.ancestorIds.has(id) ||
        rel.descendantIds.has(id) ||
        rel.siblingIds.has(id) ||
        forced.has(id) ||
        multi.has(id);
      const nodes = base.nodes.filter(
        (n) =>
          !(unrelated === "hide" && !contextual(n.id)) &&
          !(
            matched === "hide" &&
            comparison?.[n.sourceNodeId]?.status === "matched" &&
            !rel.ancestorIds.has(n.id)
          ),
      );
      const ids = new Set(nodes.map((n) => n.id));
      return {
        ...base,
        nodes,
        edges: base.edges.filter(
          (e) => ids.has(e.sourceId) && ids.has(e.targetId),
        ),
        byId: Object.fromEntries(nodes.map((n) => [n.id, n])),
      };
    }, [base, unrelated, matched, comparison, selected, rel, forced, multi]),
    layout = useMemo(
      () => layoutConstellationGraph(visible, layoutMode, spacing, W, H),
      [visible, layoutMode, spacing],
    ),
    quality = useMemo(() => scanBomDataQuality(graph), [graph]),
    findings = useMemo(
      () => constellationFindings(graph, comparison, quality),
      [graph, comparison, quality],
    ),
    summary = useMemo(
      () =>
        selected
          ? constellationSummary(graph, selected, comparison, quality, reqIds)
          : null,
      [graph, selected, comparison, quality, reqIds],
    ),
    diffs = useMemo(
      () =>
        graph.nodes
          .filter((n) => {
            const s = comparison?.[n.sourceNodeId]?.status;
            return s && s !== "matched";
          })
          .map((n) => n.id),
      [graph, comparison],
    ),
    common = useMemo(
      () => lowestCommonAncestor(graph, [...multi]),
      [graph, multi],
    );
  useEffect(() => {
    if (!tourActive || !diffs.length) return;
    const timer = window.setInterval(() => {
      setTourIndex((i) => {
        const next = (i + 1) % diffs.length;
        selectOccurrence(diffs[next], true, false);
        return next;
      });
    }, 2600);
    return () => window.clearInterval(timer);
  }, [tourActive, diffs]);
  function snapshot(): ConstellationHistoryEntry {
    return {
      expanded: [...expanded],
      pinned: [...pinned],
      selected,
      isolatedRoot,
      transform,
    };
  }
  function pushHistory() {
    const entry = snapshot();
    setHistory((cur) => [...cur.slice(0, historyIndex + 1), entry].slice(-30));
    setHistoryIndex((i) => Math.min(i + 1, 29));
  }
  function restore(h: ConstellationHistoryEntry) {
    setExpanded(new Set(h.expanded));
    setPinned(new Set(h.pinned));
    setSelected(h.selected);
    setIsolatedRoot(h.isolatedRoot);
    setTransform(h.transform);
  }
  function goHistory(d: number) {
    const next = historyIndex + d;
    if (next < 0 || next >= history.length) return;
    setHistoryIndex(next);
    restore(history[next]);
  }
  function reveal(id: string) {
    setExpanded((cur) => {
      const n = new Set(cur);
      ancestors(graph, id).forEach((x) => n.add(x.id));
      return n;
    });
  }
  function selectOccurrence(id: string, fit = false, record = true) {
    if (record) pushHistory();
    reveal(id);
    setSelected(id);
    const n = graph.byId[id],
      raw = n ? findPath(root, n.occurrencePath) : null;
    if (raw) onSelect(raw);
    if (fit) setTimeout(() => fitNode(id), 20);
  }
  function fitNode(id: string) {
    const n = layout.byId[id];
    if (!n) return;
    const scale = 1.22;
    setTransform((v) => ({
      ...v,
      x: W / 2 - n.x * scale,
      y: H / 2 - n.y * scale,
      scale,
    }));
  }
  function nav(
    ids: string[],
    index: number,
    set: (n: number) => void,
    d: number,
  ) {
    if (!ids.length) return;
    const next = (index + d + ids.length) % ids.length;
    set(next);
    selectOccurrence(ids[next], true);
  }
  function ui(t: EventTarget | null) {
    return (
      t instanceof Element &&
      !!t.closest("[data-constellation-ui],button,select,input,textarea,a")
    );
  }
  function point(e: { clientX: number; clientY: number }) {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  }
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || ui(e.target)) return;
    setMenu(null);
    const p = point(e);
    if (mode === "box-select" && !spaceHand) {
      setBox({ startX: p.x, startY: p.y, endX: p.x, endY: p.y });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (!hand) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    setPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (box) {
      const p = point(e);
      setBox((x) => (x ? { ...x, endX: p.x, endY: p.y } : null));
      return;
    }
    const a = drag.current;
    if (!a || a.pointerId !== e.pointerId) return;
    pending.current = {
      x: a.originX + e.clientX - a.startX,
      y: a.originY + e.clientY - a.startY,
    };
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        const next = pending.current;
        if (next) setTransform((v) => ({ ...v, ...next }));
        frame.current = null;
      });
  }
  function end(e: ReactPointerEvent<HTMLDivElement>) {
    if (box) {
      const minX = Math.min(box.startX, box.endX),
        maxX = Math.max(box.startX, box.endX),
        minY = Math.min(box.startY, box.endY),
        maxY = Math.max(box.startY, box.endY);
      setMulti(
        new Set(
          layout.nodes
            .filter((n) => {
              const x = n.x * transform.scale + transform.x,
                y = n.y * transform.scale + transform.y;
              return x >= minX && x <= maxX && y >= minY && y <= maxY;
            })
            .map((n) => n.id),
        ),
      );
      setBox(null);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setPanning(false);
  }
  function nodeClick(id: string, ctrl: boolean) {
    if (hand) return;
    if (ctrl) {
      setMulti((cur) => {
        const n = new Set(cur);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
    } else selectOccurrence(id);
  }
  function context(id: string, e: React.MouseEvent) {
    if (hand) return;
    e.preventDefault();
    const r = canvas.current!.getBoundingClientRect();
    setMenu({ id, x: e.clientX - r.left, y: e.clientY - r.top });
  }
  function isolate(id: string) {
    pushHistory();
    setIsolatedRoot(id);
    setSelected(id);
    setFocusMode("branch");
    reveal(id);
    fitNode(id);
    setMenu(null);
  }
  function rootView() {
    pushHistory();
    setIsolatedRoot(null);
    setSelected(null);
    setFocusMode("full");
    setExpanded(new Set([graph.rootId]));
    setTransform(DEFAULT);
  }
  function saveView() {
    const name = window.prompt(
      "Name this engineering view",
      selected
        ? `${graph.byId[selected]?.name ?? "Selection"} review`
        : "BOM overview",
    );
    if (!name) return;
    const item: ConstellationSavedView = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      layout: layoutMode,
      spacing,
      labels,
      focus: focusMode,
      colorBy,
      sizeBy,
      unrelated,
      matched,
      edgeMode,
      labelDensity,
      layoutLocked,
      expanded: [...expanded],
      pinned: [...pinned],
      selected,
      isolatedRoot,
      transform,
    };
    const next = [item, ...savedViews].slice(0, 20);
    setSavedViews(next);
    localStorage.setItem(STORAGE, JSON.stringify(next));
  }
  function loadView(v: ConstellationSavedView) {
    setLayoutMode(v.layout as ConstellationLayoutMode);
    setSpacing(v.spacing as ConstellationSpacing);
    setLabels(v.labels as ConstellationLabelMode);
    setFocusMode(v.focus as ConstellationFocusMode);
    setColorBy(v.colorBy as ConstellationColorMode);
    setSizeBy(v.sizeBy as ConstellationSizeMode);
    setUnrelated(v.unrelated as VisibilityMode);
    setMatched(v.matched as VisibilityMode);
    setEdgeMode(v.edgeMode);
    setLabelDensity(v.labelDensity);
    setLayoutLocked(v.layoutLocked);
    setExpanded(new Set(v.expanded));
    setPinned(new Set(v.pinned));
    setSelected(v.selected);
    setIsolatedRoot(v.isolatedRoot);
    setTransform(v.transform);
    setViewsOpen(false);
  }
  function applyLens(x: ConstellationLens) {
    setLens(x);
    if (x === "structure") {
      setColorBy("role");
      setSizeBy("role");
    } else if (x === "comparison") {
      setColorBy("comparison");
      setMatched("ghost");
    } else if (x === "requirements") setColorBy("requirements");
    else if (x === "impact") setColorBy("impact");
    else if (x === "complexity") {
      setColorBy("complexity");
      setSizeBy("complexity");
    } else {
      setColorBy("data-quality");
      setFindingsOpen(true);
    }
  }
  const cursor = hand
    ? panning
      ? "grabbing"
      : "grab"
    : mode === "box-select"
      ? "crosshair"
      : "default";
  return (
    <motion.div
      ref={canvas}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`relative h-[clamp(620px,74vh,850px)] min-h-[620px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] text-white ${panning ? "select-none" : ""}`}
      style={{
        cursor,
        touchAction: "none",
        userSelect: panning ? "none" : "auto",
      }}
      onWheel={(e: ReactWheelEvent<HTMLDivElement>) => {
        if (ui(e.target)) return;
        e.preventDefault();
        setTransform((v) => ({
          ...v,
          scale: Math.min(2.8, Math.max(0.2, v.scale - e.deltaY * 0.0012)),
        }));
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[.18]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px,#334155 1px,transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full"
      >
        <motion.g
          animate={{
            x: transform.x,
            y: transform.y,
            scale: transform.scale,
            rotate: transform.rotation,
          }}
          transition={
            panning || layoutLocked
              ? { duration: 0 }
              : { type: "spring", stiffness: 110, damping: 20 }
          }
          style={{ transformOrigin: `${W / 2}px ${H / 2}px` }}
        >
          {visible.edges.map((e) => {
            const a = layout.byId[e.sourceId],
              b = layout.byId[e.targetId];
            if (!a || !b) return null;
            const related =
                !selected ||
                e.sourceId === selected ||
                rel.ancestorIds.has(e.sourceId) ||
                rel.descendantIds.has(e.targetId) ||
                multi.has(e.sourceId) ||
                multi.has(e.targetId),
              req = reqIds.has(e.sourceId) || reqIds.has(e.targetId),
              imp = impactIds.has(e.sourceId) || impactIds.has(e.targetId);
            return (
              <path
                key={e.id}
                d={edgePath(a, b, edgeMode, layout)}
                fill="none"
                stroke={
                  req
                    ? "#a78bfa"
                    : imp
                      ? "#f59e0b"
                      : related
                        ? "#0ea5e9"
                        : "#334155"
                }
                strokeOpacity={req || imp ? 1 : related ? 0.72 : 0.08}
                strokeWidth={req || imp ? 3 : related ? 1.8 : 0.8}
              />
            );
          })}
          {layout.nodes.map((n, i) => (
            <GraphNode
              key={n.id}
              n={n}
              index={i}
              selected={n.id === selected}
              multi={multi.has(n.id)}
              pinned={pinned.has(n.id)}
              common={n.id === common}
              hovered={n.id === hovered}
              related={
                !selected ||
                n.id === selected ||
                rel.ancestorIds.has(n.id) ||
                rel.descendantIds.has(n.id) ||
                rel.siblingIds.has(n.id)
              }
              req={reqIds.has(n.id)}
              impact={impactIds.has(n.id)}
              comparison={comparison?.[n.sourceNodeId]}
              quality={quality.findingIdsByNode[n.id]?.length ?? 0}
              labels={labels}
              density={labelDensity}
              colorBy={colorBy}
              sizeBy={sizeBy}
              dimmed={
                unrelated === "ghost" &&
                !!selected &&
                !(
                  n.id === selected ||
                  rel.ancestorIds.has(n.id) ||
                  rel.descendantIds.has(n.id) ||
                  rel.siblingIds.has(n.id)
                )
              }
              expanded={expanded.has(n.id)}
              disabled={hand}
              onHover={setHovered}
              onSelect={(ctrl) => nodeClick(n.id, ctrl)}
              onToggle={() =>
                setExpanded((cur) => {
                  const x = new Set(cur);
                  x.has(n.id) ? x.delete(n.id) : x.add(n.id);
                  return x;
                })
              }
              onContext={(e) => context(n.id, e)}
            />
          ))}
        </motion.g>
        {box ? (
          <rect
            x={Math.min(box.startX, box.endX)}
            y={Math.min(box.startY, box.endY)}
            width={Math.abs(box.endX - box.startX)}
            height={Math.abs(box.endY - box.startY)}
            fill="#06b6d4"
            fillOpacity=".12"
            stroke="#22d3ee"
            strokeDasharray="8 5"
          />
        ) : null}
      </svg>
      <div data-constellation-ui>
        <BomConstellationLensSelector value={lens} onChange={applyLens} />
        <BomConstellationToolbar
          layout={layoutMode}
          spacing={spacing}
          labels={labels}
          focus={focusMode}
          colorBy={colorBy}
          sizeBy={sizeBy}
          unrelated={unrelated}
          matched={matched}
          comparison={!!comparison}
          findings={findings.length}
          interactionMode={mode}
          temporaryHand={spaceHand}
          layoutLocked={layoutLocked}
          edgeMode={edgeMode}
          depth={depth}
          labelDensity={labelDensity}
          selectionCount={multi.size}
          pinnedCount={pinned.size}
          canBack={historyIndex > 0}
          canForward={historyIndex < history.length - 1}
          tourActive={tourActive}
          setLayout={setLayoutMode}
          setSpacing={setSpacing}
          setLabels={setLabels}
          setFocus={setFocusMode}
          setColorBy={setColorBy}
          setSizeBy={setSizeBy}
          setUnrelated={setUnrelated}
          setMatched={setMatched}
          setInteractionMode={setMode}
          setLayoutLocked={setLayoutLocked}
          setEdgeMode={setEdgeMode}
          setDepth={(x) => {
            setDepth(x);
            setExpanded(expandedToDepth(graph, x));
          }}
          setLabelDensity={setLabelDensity}
          onZoom={(n) =>
            setTransform((v) => ({
              ...v,
              scale: Math.min(2.8, Math.max(0.2, v.scale + n)),
            }))
          }
          onReset={() => setTransform(DEFAULT)}
          onExpandAll={() => setExpanded(expandedToDepth(graph, "all"))}
          onCollapseAll={() => setExpanded(new Set([graph.rootId]))}
          onFitBranch={() => selected && fitNode(selected)}
          onFindings={() => setFindingsOpen((x) => !x)}
          onFullScreen={onFullScreen}
          onBack={() => goHistory(-1)}
          onForward={() => goHistory(1)}
          onRoot={rootView}
          onClearSelection={() => setMulti(new Set())}
          onAnalyzeSelection={() => setBasketOpen(true)}
          onSaveView={saveView}
          onManageViews={() => setViewsOpen(true)}
          onToggleTour={() => setTourActive((x) => !x)}
          onExport={(type) => {
            if (!svg.current) return;
            const name = safeFileName(root.name);
            type === "svg"
              ? exportConstellationSvg(svg.current, name)
              : void exportConstellationPng(svg.current, name);
          }}
          canFocus={!!selected}
        />
        <Navigator
          query={search}
          index={searchIndex}
          count={results.length}
          top={92}
          onPrev={() =>
            nav(
              results.map((x) => x.nodeId),
              searchIndex,
              setSearchIndex,
              -1,
            )
          }
          onNext={() =>
            nav(
              results.map((x) => x.nodeId),
              searchIndex,
              setSearchIndex,
              1,
            )
          }
        />
        {comparison && diffs.length ? (
          <Navigator
            label="Difference"
            index={differenceIndex}
            count={diffs.length}
            top={140}
            onPrev={() => nav(diffs, differenceIndex, setDifferenceIndex, -1)}
            onNext={() => nav(diffs, differenceIndex, setDifferenceIndex, 1)}
          />
        ) : null}
        {summary ? (
          <BomConstellationNodeDetails
            data={summary}
            expanded={expanded.has(summary.node.id)}
            onToggle={() =>
              setExpanded((cur) => {
                const x = new Set(cur);
                x.has(summary.node.id)
                  ? x.delete(summary.node.id)
                  : x.add(summary.node.id);
                return x;
              })
            }
            onFit={() => fitNode(summary.node.id)}
            onClear={() => {
              setSelected(null);
              onClearSelection();
            }}
          />
        ) : null}
        <Breadcrumbs
          nodes={ancestors(graph, isolatedRoot ?? selected)}
          onSelect={(id) => selectOccurrence(id, true)}
        />
        <BomConstellationMinimap
          layout={layout}
          transform={transform}
          onReset={() => setTransform(DEFAULT)}
        />
        <Findings
          open={findingsOpen}
          findings={findings}
          onClose={() => setFindingsOpen(false)}
          onSelect={(id) => {
            setFindingsOpen(false);
            selectOccurrence(id, true);
          }}
        />
        {requirementTraceEnabled && requirementResult ? (
          <RequirementSnapshotCard
            result={requirementResult}
            className="absolute right-5 top-24 z-40"
          />
        ) : null}
        {hovered && layout.byId[hovered] ? (
          <Hover
            n={layout.byId[hovered]}
            comparison={comparison?.[layout.byId[hovered].sourceNodeId]}
            quality={quality.findingIdsByNode[hovered]?.length ?? 0}
          />
        ) : null}
        <ContextMenu
          menu={menu}
          graph={graph}
          pinned={pinned}
          onClose={() => setMenu(null)}
          onFocus={(id) => selectOccurrence(id, true)}
          onIsolate={isolate}
          onPin={(id) =>
            setPinned((cur) => {
              const n = new Set(cur);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            })
          }
          onAdd={(id) => setMulti((cur) => new Set(cur).add(id))}
        />
        <Basket
          open={basketOpen}
          ids={[...multi]}
          graph={graph}
          common={common}
          onClose={() => setBasketOpen(false)}
          onFocus={(id) => selectOccurrence(id, true)}
          onClear={() => setMulti(new Set())}
        />
        <SavedViews
          open={viewsOpen}
          views={savedViews}
          onClose={() => setViewsOpen(false)}
          onLoad={loadView}
          onDelete={(id) => {
            const next = savedViews.filter((x) => x.id !== id);
            setSavedViews(next);
            localStorage.setItem(STORAGE, JSON.stringify(next));
          }}
        />
      </div>
    </motion.div>
  );
}
function GraphNode({
  n,
  index,
  selected,
  multi,
  pinned,
  common,
  hovered,
  related,
  req,
  impact,
  comparison,
  quality,
  labels,
  density,
  colorBy,
  sizeBy,
  dimmed,
  expanded,
  disabled,
  onHover,
  onSelect,
  onToggle,
  onContext,
}: {
  n: ConstellationNode;
  index: number;
  selected: boolean;
  multi: boolean;
  pinned: boolean;
  common: boolean;
  hovered: boolean;
  related: boolean;
  req: boolean;
  impact: boolean;
  comparison?: NodeComparison;
  quality: number;
  labels: ConstellationLabelMode;
  density: number;
  colorBy: ConstellationColorMode;
  sizeBy: ConstellationSizeMode;
  dimmed: boolean;
  expanded: boolean;
  disabled: boolean;
  onHover: (id: string | null) => void;
  onSelect: (ctrl: boolean) => void;
  onToggle: () => void;
  onContext: (e: React.MouseEvent) => void;
}) {
  const factor =
      sizeBy === "uniform"
        ? 1
        : sizeBy === "children"
          ? 1 + Math.min(0.7, n.childIds.length / 18)
          : sizeBy === "descendants"
            ? 1 + Math.min(0.8, Math.sqrt(n.descendantCount) / 8)
            : sizeBy === "complexity"
              ? 0.8 + n.complexity / 120
              : 1,
    r = n.nodeRadius * factor,
    color = nodeColor(n, selected, req, impact, comparison, quality, colorBy),
    priority = n.isRoot
      ? 100
      : n.isAssembly
        ? 80
        : selected || multi || pinned || hovered
          ? 100
          : 20,
    show =
      labels === "all" ||
      (labels === "assemblies" && (n.isAssembly || n.isRoot)) ||
      (labels === "branch" && related) ||
      (labels === "smart" && priority >= 100 - density),
    hidden = n.isAssembly && !expanded ? n.descendantCount : 0;
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0, x: n.x, y: n.y }}
      animate={{
        x: n.x,
        y: n.y,
        opacity: dimmed ? 0.1 : 1,
        scale: selected || multi || req || impact ? 1.15 : hovered ? 1.07 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 24,
        delay: Math.min(0.12, index * 0.002),
      }}
      pointerEvents={disabled ? "none" : "all"}
      onPointerEnter={() => onHover(n.id)}
      onPointerLeave={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.ctrlKey || e.metaKey);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onContextMenu={onContext}
      className="cursor-pointer"
    >
      {selected || multi || req || impact || common ? (
        <circle
          r={r + 10}
          fill="none"
          stroke={
            common
              ? "#facc15"
              : multi
                ? "#34d399"
                : req
                  ? "#a78bfa"
                  : impact
                    ? "#f59e0b"
                    : "#22d3ee"
          }
          strokeWidth="3"
        />
      ) : null}
      <circle
        r={r}
        fill={color}
        stroke={
          pinned
            ? "#facc15"
            : selected
              ? "#fff"
              : comparison
                ? STATUS[comparison.status]
                : "#94a3b8"
        }
        strokeWidth={pinned || selected ? 4 : comparison ? 2.5 : 1.2}
      />
      <text
        textAnchor="middle"
        y="4"
        fill="#fff"
        fontSize="10"
        fontWeight="700"
        pointerEvents="none"
      >
        {n.isRoot ? "P" : n.isAssembly ? "A" : "C"}
      </text>
      {pinned ? (
        <text x={r * 0.75} y={-r * 0.75} fontSize="12">
          ◆
        </text>
      ) : null}
      {hidden ? (
        <g transform={`translate(${r * 0.72},${-r * 0.72})`}>
          <circle r="10" fill="#0f172a" stroke="#22d3ee" />
          <text textAnchor="middle" y="3" fontSize="7" fill="#67e8f9">
            +{hidden}
          </text>
        </g>
      ) : null}
      {show ? (
        <text
          textAnchor="middle"
          y={r + 18}
          fill="#f8fafc"
          fontSize={n.isAssembly ? 11 : 9}
          stroke="#020617"
          strokeWidth="3"
          paintOrder="stroke"
          pointerEvents="none"
        >
          {short(n.name, n.isAssembly ? 28 : 20)}
        </text>
      ) : null}
    </motion.g>
  );
}
function nodeColor(
  n: ConstellationNode,
  selected: boolean,
  req: boolean,
  impact: boolean,
  c: NodeComparison | undefined,
  q: number,
  mode: ConstellationColorMode,
) {
  if (selected) return "#22d3ee";
  if (mode === "comparison") return c ? STATUS[c.status] : "#475569";
  if (mode === "level") return LEVEL[n.level % LEVEL.length];
  if (mode === "requirements") return req ? "#a78bfa" : "#334155";
  if (mode === "impact") return impact ? "#f59e0b" : "#334155";
  if (mode === "complexity") return heat(n.complexity);
  if (mode === "data-quality")
    return q > 2 ? "#f43f5e" : q ? "#f59e0b" : "#10b981";
  return n.isRoot
    ? "#06b6d4"
    : n.isAssembly
      ? n.level === 1
        ? "#6366f1"
        : "#8b5cf6"
      : "#64748b";
}
function edgePath(
  a: ConstellationNode,
  b: ConstellationNode,
  mode: ConstellationEdgeMode,
  layout: ReturnType<typeof layoutConstellationGraph>,
) {
  if (mode === "direct") return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  if (mode === "bundled") {
    const root = layout.byId[layout.graph.rootId],
      mx = (a.x + root.x + b.x) / 3,
      my = (a.y + root.y + b.y) / 3;
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - 18} ${b.x} ${b.y}`;
}
function Navigator({
  query,
  label = "Search",
  index,
  count,
  top,
  onPrev,
  onNext,
}: {
  query?: string;
  label?: string;
  index: number;
  count: number;
  top: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!count && (!query || !query.trim())) return null;
  return (
    <div
      className="absolute left-4 z-40 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/90 p-2"
      style={{ top }}
    >
      <IconSearch className="h-4 w-4 text-cyan-300" />
      <span className="min-w-20 text-[9px]">
        {count
          ? `${label} ${index + 1} of ${count}`
          : `No ${label.toLowerCase()} results`}
      </span>
      <button onClick={onPrev} disabled={!count}>
        <IconChevronLeft className="h-4 w-4" />
      </button>
      <button onClick={onNext} disabled={!count}>
        <IconChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
function Breadcrumbs({
  nodes,
  onSelect,
}: {
  nodes: ReturnType<typeof ancestors>;
  onSelect: (id: string) => void;
}) {
  if (!nodes.length) return null;
  return (
    <nav className="absolute bottom-4 left-1/2 z-40 flex max-w-[50%] -translate-x-1/2 gap-1 overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/90 p-1.5">
      {nodes.map((n, i) => (
        <button
          key={n.id}
          onClick={() => onSelect(n.id)}
          className={`shrink-0 rounded-xl px-2 py-1.5 text-[8px] ${i === nodes.length - 1 ? "bg-cyan-500/15 text-cyan-200" : "text-slate-500"}`}
        >
          {short(n.name, 20)}
          {i < nodes.length - 1 ? " ›" : ""}
        </button>
      ))}
    </nav>
  );
}
function Findings({
  open,
  findings,
  onClose,
  onSelect,
}: {
  open: boolean;
  findings: ReturnType<typeof constellationFindings>;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          className="absolute bottom-4 right-4 top-24 z-[70] flex w-[390px] flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/95"
        >
          <header className="flex justify-between border-b border-slate-800 p-4">
            <div>
              <p className="text-[9px] uppercase tracking-[.18em] text-cyan-300">
                Engineering findings
              </p>
              <b>{findings.length} observations</b>
            </div>
            <button onClick={onClose}>
              <IconX className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {findings.slice(0, 120).map((f) => (
              <button
                key={f.id}
                onClick={() => onSelect(f.nodeId)}
                className="flex w-full gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-left"
              >
                <IconAlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  <b className="block text-[10px]">{f.title}</b>
                  <span className="line-clamp-2 text-[9px] text-slate-500">
                    {f.detail}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
function ContextMenu({
  menu,
  graph,
  pinned,
  onClose,
  onFocus,
  onIsolate,
  onPin,
  onAdd,
}: {
  menu: Menu | null;
  graph: ReturnType<typeof buildVisualBomGraph>;
  pinned: Set<string>;
  onClose: () => void;
  onFocus: (id: string) => void;
  onIsolate: (id: string) => void;
  onPin: (id: string) => void;
  onAdd: (id: string) => void;
}) {
  if (!menu) return null;
  const n = graph.byId[menu.id];
  return (
    <div
      className="absolute z-[90] w-56 rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
    >
      <p className="truncate border-b border-slate-800 px-2 pb-2 text-[9px] font-semibold">
        {n.name}
      </p>
      <MenuBtn
        icon={<IconFocus2 />}
        label="Focus node"
        onClick={() => onFocus(menu.id)}
      />
      {n.isAssembly ? (
        <MenuBtn
          icon={<IconTopologyStar3 />}
          label="Isolate branch"
          onClick={() => onIsolate(menu.id)}
        />
      ) : null}
      <MenuBtn
        icon={pinned.has(menu.id) ? <IconPinnedOff /> : <IconPin />}
        label={pinned.has(menu.id) ? "Unpin node" : "Pin node"}
        onClick={() => {
          onPin(menu.id);
          onClose();
        }}
      />
      <MenuBtn
        icon={<IconCopy />}
        label="Add to selection"
        onClick={() => {
          onAdd(menu.id);
          onClose();
        }}
      />
      <MenuBtn
        icon={<IconCopy />}
        label="Copy Item ID"
        onClick={() => {
          void navigator.clipboard.writeText(n.itemId ?? n.sourceNodeId);
          onClose();
        }}
      />
    </div>
  );
}
function MenuBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[9px] text-slate-400 hover:bg-slate-800 hover:text-white"
    >
      <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}
function Basket({
  open,
  ids,
  graph,
  common,
  onClose,
  onFocus,
  onClear,
}: {
  open: boolean;
  ids: string[];
  graph: ReturnType<typeof buildVisualBomGraph>;
  common: string | null;
  onClose: () => void;
  onFocus: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          className="absolute bottom-4 left-4 top-24 z-[80] flex w-[390px] flex-col overflow-hidden rounded-3xl border border-emerald-500/30 bg-slate-950/95"
        >
          <header className="flex justify-between border-b border-slate-800 p-4">
            <div>
              <p className="text-[9px] uppercase tracking-[.18em] text-emerald-300">
                Engineering selection basket
              </p>
              <b>{ids.length} nodes selected</b>
            </div>
            <button onClick={onClose}>
              <IconX className="h-4 w-4" />
            </button>
          </header>
          {common ? (
            <button
              onClick={() => onFocus(common)}
              className="m-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left"
            >
              <span className="text-[8px] uppercase text-amber-300">
                Lowest common ancestor
              </span>
              <b className="block text-[10px]">{graph.byId[common]?.name}</b>
            </button>
          ) : null}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {ids.map((id) => (
              <button
                key={id}
                onClick={() => onFocus(id)}
                className="w-full rounded-xl border border-slate-800 p-3 text-left"
              >
                <b className="block truncate text-[10px]">
                  {graph.byId[id]?.name}
                </b>
                <span className="text-[8px] text-slate-500">
                  {graph.byId[id]?.itemId ?? "No Item ID"}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={onClear}
            className="m-3 rounded-xl bg-rose-500/10 p-2 text-[9px] text-rose-300"
          >
            Clear selection
          </button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
function SavedViews({
  open,
  views,
  onClose,
  onLoad,
  onDelete,
}: {
  open: boolean;
  views: ConstellationSavedView[];
  onClose: () => void;
  onLoad: (v: ConstellationSavedView) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          className="absolute bottom-4 right-4 top-24 z-[80] flex w-[390px] flex-col rounded-3xl border border-slate-700 bg-slate-950/95"
        >
          <header className="flex justify-between border-b border-slate-800 p-4">
            <div>
              <p className="text-[9px] uppercase text-cyan-300">
                Saved engineering views
              </p>
              <b>{views.length} saved views</b>
            </div>
            <button onClick={onClose}>
              <IconX className="h-4 w-4" />
            </button>
          </header>
          <div className="space-y-2 overflow-y-auto p-3">
            {views.length ? (
              views.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-800 p-3"
                >
                  <button
                    onClick={() => onLoad(v)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <b className="block truncate text-[10px]">{v.name}</b>
                    <span className="text-[7px] text-slate-600">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </button>
                  <button onClick={() => onDelete(v.id)}>
                    <IconX className="h-4 w-4 text-slate-600" />
                  </button>
                </div>
              ))
            ) : (
              <p className="p-8 text-center text-[9px] text-slate-600">
                No saved views yet.
              </p>
            )}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
function Hover({
  n,
  comparison,
  quality,
}: {
  n: ConstellationNode;
  comparison?: NodeComparison;
  quality: number;
}) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-30 rounded-2xl border border-slate-700 bg-slate-950/90 p-3">
      <b className="block max-w-64 truncate text-[10px]">{n.name}</b>
      <p className="mt-1 text-[8px] text-slate-500">
        {n.itemId ? `Item ID ${n.itemId}` : "No Item ID"} ·{" "}
        {n.isAssembly ? "Assembly" : "Component"} · {n.childIds.length} children
        · {n.descendantCount} descendants
      </p>
      <p className="mt-1 text-[8px] text-slate-500">
        Complexity {n.complexity}
        {comparison ? ` · ${comparison.status}` : ""}
        {quality ? ` · ${quality} quality findings` : ""}
      </p>
    </div>
  );
}
function findPath(root: TreeNodeData, path: number[]) {
  let node: TreeNodeData | undefined = root;

  for (const index of path) {
    if (!node) return null;
    node = node.children?.[index];
  }

  return node ?? null;
}
function short(v: string, n: number) {
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
}
function heat(n: number) {
  return n >= 75
    ? "#ef4444"
    : n >= 50
      ? "#f97316"
      : n >= 25
        ? "#facc15"
        : "#10b981";
}
