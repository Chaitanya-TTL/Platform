/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Tree, type NodeRendererProps, type TreeApi } from "react-arborist";
import { AnimatePresence, motion } from "motion/react";
import {
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
  IconCircleDashed,
  IconHierarchy,
  IconPackage,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type { PipelineProgress } from "@/lib/api";
import { OutcomeNotice, RetryButton } from "@/components/feedback/OutcomeNotice";
import { SourceStateBadge, SourceStructureSkeleton } from "@/components/source-workflow/SourceState";
import { safeProgressMessage, userFacingError, type UserFacingError } from "@/lib/user-facing-errors";
import { toast } from "sonner";
import { ComparisonReasoningModal } from "@/components/ComparisonReasoningModal";
import { BomFullscreenButton } from "@/components/BomFullscreenButton";
import { useBomNativeFullscreen } from "@/components/useBomNativeFullscreen";
import { BomViewSwitcher } from "@/components/bom-visualization/BomViewSwitcher";
import { BomConstellationView } from "@/components/bom-visualization/BomConstellationView";
import { BomRadialExplorerView } from "@/components/bom-visualization/BomRadialExplorerView";
import { BomThreeUniverseView } from "@/components/bom-visualization/BomThreeUniverseView";
import {
  ImpactAnalysisWorkspace,
  ImpactModeToggle,
} from "@/components/bom-impact/ImpactAnalysisWorkspace";
import { RequirementEvolutionModal } from "@/components/bom-requirements/RequirementEvolutionModal";
import { RequirementFocusSummary } from "@/components/bom-requirements/RequirementFocusSummary";
import { RequirementTraceToggle } from "@/components/bom-requirements/RequirementTraceToggle";
import { RequirementsExplorerButton } from "@/components/bom-requirements/RequirementsExplorerButton";
import { RequirementsExplorerModal } from "@/components/bom-requirements/RequirementsExplorerModal";
import {
  occurrencesForSource,
  registerImpactBom,
  runImpactSearch,
  useCrossBomImpact,
} from "@/lib/cross-bom-impact-store";
import {
  getLoadedRequirementCatalog,
  registerRequirementBom,
  runRequirementTrace,
  useRequirementTrace,
} from "@/lib/requirement-trace-store";
import { sourcePresentation } from "@/lib/bom-comparison";
import type {
  ComparisonFilter,
  NodeComparison,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
import type { BomViewMode } from "@/types/bom-visualization";
import type { WindchillChangeImpactFilter, WindchillChangeImpactResult, WindchillNodeImpact } from "@/types/windchill-change-impact";
type Props = {
  source: SourceType;
  title: string;
  endpoint: string;
  transformPayload: (payload: unknown) => TreeNodeData | null;
  active: boolean;
  payloadOverride?: unknown;
  refreshSignal?: number;
  loadingLabel?: string;
  onLoadComplete?: (status: "ready" | "error") => void;
  onBomReady?: (source: SourceType, root: TreeNodeData | null) => void;
  progress?: PipelineProgress | null;
  comparisonMode?: boolean;
  comparison?: Record<string, NodeComparison>;
  comparisonFilter?: ComparisonFilter;
  counterpartLabel?: string;
  changeImpact?: WindchillChangeImpactResult | null;
  changeImpactFilter?: WindchillChangeImpactFilter;
  onRetryRequest?: () => void;
  onEditRequest?: () => void;
};
type Status = "idle" | "loading" | "ready" | "empty" | "error";
type FocusRelationship = "direct" | "corresponding";
const POLL_INTERVAL = 2000;
const visuals = {
  matched: {
    label: "Matched",
    row: "border-emerald-300 bg-emerald-50 dark:border-emerald-400/25 dark:bg-emerald-400/[.08]",
  },
  changed: {
    label: "Changed",
    row: "border-amber-300 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[.08]",
  },
  missing: {
    label: "Missing",
    row: "border-rose-300 bg-rose-50 dark:border-rose-400/25 dark:bg-rose-400/[.08]",
  },
  "source-only": {
    label: "Source-only",
    row: "border-sky-300 bg-sky-50 dark:border-sky-400/25 dark:bg-sky-400/[.08]",
  },
  probable: {
    label: "Review match",
    row: "border-violet-300 bg-violet-50 dark:border-violet-400/25 dark:bg-violet-400/[.08]",
  },
} as const;
function record(v: unknown) {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function backendStatus(v: unknown) {
  const x = record(v);
  return typeof x?.status === "string" ? x.status.toLowerCase() : "";
}
function backendMessage(v: unknown) {
  if (typeof v === "string" && v.trim()) return v;
  const x = record(v);
  return typeof x?.error === "string"
    ? x.error
    : typeof x?.message === "string"
      ? x.message
      : "Failed to load BOM";
}
function isPending(v: unknown) {
  return [
    "in_progress",
    "in progress",
    "processing",
    "pending",
    "accepted",
    "running",
  ].includes(backendStatus(v));
}
function searchText(n: TreeNodeData, s: SourceType) {
  const p = sourcePresentation(n, s);
  return [
    p.name,
    p.itemId,
    p.quantity,
    n.name,
    ...Object.values(n.attributes ?? {}),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function metrics(root: TreeNodeData) {
  let total = 0,
    assemblies = 0,
    leaves = 0,
    depth = 0;
  const queue: Array<[TreeNodeData, number]> = [[root, 1]];
  while (queue.length) {
    const [n, l] = queue.shift()!;
    total++;
    depth = Math.max(depth, l);
    const children = n.children ?? [];
    if (children.length) {
      assemblies++;
      queue.push(...children.map((x) => [x, l + 1] as [TreeNodeData, number]));
    } else leaves++;
  }
  return { total, assemblies, leaves, depth };
}
function TreeRow({
  node,
  style,
  dragHandle,
  source,
  comparisonMode,
  comparison,
  selected,
  impactMatch,
  changeImpact,
  focusRelationship,
  onSelect,
}: NodeRendererProps<TreeNodeData> & {
  source: SourceType;
  comparisonMode: boolean;
  comparison?: NodeComparison;
  selected: boolean;
  impactMatch: boolean;
  changeImpact?: WindchillNodeImpact;
  focusRelationship?: FocusRelationship;
  onSelect: (node: TreeNodeData) => void;
}) {
  const shown = sourcePresentation(node.data, source),
    hasChildren = !node.isLeaf,
    result = comparisonMode ? comparison : undefined,
    visual = result ? visuals[result.status] : null,
    focused = Boolean(focusRelationship),
    changeDirect = changeImpact?.impact === "direct",
    changeIndirect = changeImpact?.impact === "indirect";
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node.data);
    }
  };
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (hasChildren) node.toggle();
  };
  const focusClass =
    focusRelationship === "direct"
      ? "border-violet-400 bg-[#201538] ring-2 ring-violet-400/50"
      : focusRelationship === "corresponding"
        ? "border-indigo-400 bg-[#151c3b] ring-2 ring-indigo-400/35"
        : "";
  return (
    <div style={style} ref={dragHandle} className="flex items-center pr-2">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={keyDown}
        onClick={() => onSelect(node.data)}
        onDoubleClick={() => hasChildren && node.toggle()}
        className={[
          "relative flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border px-2 py-2 outline-none transition sm:gap-3 sm:px-3",
          focusClass ||
            (changeDirect
              ? "border-slate-700 bg-slate-950 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-orange-400"
              : changeIndirect
                ? "border-slate-800 bg-slate-950/50 before:absolute before:inset-y-3 before:left-0 before:w-px before:bg-slate-500"
                : impactMatch
              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-400/[.12]"
              : selected
                ? "border-cyan-300 bg-cyan-50 dark:bg-cyan-400/[.09]"
                : visual
                  ? visual.row
                  : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60"),
        ].join(" ")}
      >
        {focused ? (
          <motion.span
            className={`absolute bottom-0 left-0 top-0 w-1 ${focusRelationship === "direct" ? "bg-violet-400" : "bg-indigo-400"}`}
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        ) : null}
        <button
          type="button"
          onClick={toggle}
          className={`flex h-8 w-8 shrink-0 items-center justify-center ${focused ? "text-slate-200" : "text-slate-500"}`}
        >
          {hasChildren ? (
            <motion.span animate={{ rotate: node.isOpen ? 90 : 0 }}>
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-3.5 w-3.5" />
          )}
        </button>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${focusRelationship === "direct" ? "border-violet-400/40 bg-violet-400/15 text-violet-200" : focusRelationship === "corresponding" ? "border-indigo-400/40 bg-indigo-400/15 text-indigo-200" : "border-transparent bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[.07] dark:text-cyan-300"}`}
        >
          <IconPackage className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-base font-semibold ${focused ? "text-white" : "text-slate-900 dark:text-slate-100"}`}
          >
            {shown.name}
          </span>
          <span
            className={`text-sm ${focusRelationship === "direct" ? "text-violet-200/80" : focusRelationship === "corresponding" ? "text-indigo-200/80" : "text-slate-500"}`}
          >
            {shown.itemId ? `Item ID: ${shown.itemId}` : node.data.attributes?.["Part ID"] ? `Part ID: ${String(node.data.attributes["Part ID"])}` : node.data.attributes?.["Tree Path"] ? `Path: ${String(node.data.attributes["Tree Path"])}` : "Structural occurrence"}
          </span>
        </span>
        {focusRelationship ? (
          <span
            className={`shrink-0 rounded-full border px-2 py-1 text-xs font-bold uppercase ${focusRelationship === "direct" ? "border-violet-300/35 bg-violet-400/15 text-violet-200" : "border-indigo-300/35 bg-indigo-400/15 text-indigo-200"}`}
          >
            {focusRelationship}
          </span>
        ) : result && visual ? (
          <span className="shrink-0 rounded-full border border-current/20 px-2 py-1 text-xs font-semibold uppercase">
            {visual.label}
          </span>
        ) : changeDirect ? (
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-orange-400">Affected{changeImpact?.notices?.length ? ` -+ ${changeImpact.notices.length}` : ""}</span>
        ) : changeIndirect ? (
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Impacted parent</span>
        ) : null}
      </div>
    </div>
  );
}
export function SourceBomPanel({
  source,
  title,
  endpoint,
  transformPayload,
  active,
  payloadOverride,
  refreshSignal,
  loadingLabel = "Fetching BOM structure...",
  onLoadComplete,
  onBomReady,
  progress,
  comparisonMode = false,
  comparison,
  comparisonFilter = "all",
  counterpartLabel,
  changeImpact = null,
  changeImpactFilter = "all",
  onRetryRequest,
  onEditRequest,
}: Props) {
  const [bom, setBom] = useState<TreeNodeData | null>(null),
    [status, setStatus] = useState<Status>("idle"),
    [error, setError] = useState<UserFacingError | null>(null),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<TreeNodeData | null>(null),
    [comparisonModalOpen, setComparisonModalOpen] = useState(false),
    [retry, setRetry] = useState(0),
    [viewMode, setViewMode] = useState<BomViewMode>("tree"),
    [viewportHeight, setViewportHeight] = useState(900),
    [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const tree = useRef<TreeApi<TreeNodeData> | null>(null),
    panelRef = useRef<HTMLElement | null>(null),
    impact = useCrossBomImpact(),
    trace = useRequirementTrace();
  const { isFullscreen, toggleFullscreen } = useBomNativeFullscreen(panelRef);
  const impactIds = useMemo(
      () =>
        new Set(
          occurrencesForSource(impact.result, source).map((x) => x.nodeId),
        ),
      [impact.result, source],
    ),
    focusById = useMemo(
      () =>
        Object.fromEntries(
          (
            trace.focus?.occurrences.filter((x) => x.source === source) ?? []
          ).map((x) => [x.nodeId, x.relationship]),
        ) as Record<string, FocusRelationship>,
      [trace.focus, source],
    );
  useEffect(() => {
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setViewportHeight(window.innerHeight)); };
    update();
    window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); };
  }, []);
  useEffect(() => {
    if (!active) {
      const id = window.setTimeout(() => {
        setBom(null);
        onBomReady?.(source, null);
        setStatus("idle");
        setSelected(null);
      }, 0);
      return () => window.clearTimeout(id);
    }
    if (payloadOverride != null) {
      const id = window.setTimeout(() => {
        try {
          const root = transformPayload(payloadOverride);
          if (!root) throw new Error("Malformed extraction payload.");
          setBom(root);
          onBomReady?.(source, root);
          setStatus("ready");
          setLoadedAt(new Date());
          onLoadComplete?.("ready");
        } catch (c) {
          setStatus("error");
          const outcome = userFacingError(source, c);
          setError(outcome);
          onLoadComplete?.("error");
        }
      }, 0);
      return () => window.clearTimeout(id);
    }
    if (!endpoint) return;
    let cancelled = false,
      timer: number | undefined;
    const again = () => {
      if (!cancelled)
        timer = window.setTimeout(() => void load(), POLL_INTERVAL);
    };
    const load = async () => {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch(endpoint, { cache: "no-store" }),
          raw = await response.text();
        let payload: unknown = null;
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch {
            payload = raw;
          }
        }
        if (!response.ok && isPending(payload)) {
          again();
          return;
        }
        if (!response.ok) {
          const outcome = userFacingError(source, backendMessage(payload), response.status);
          if (outcome.kind === "not-found") {
            if (cancelled) return;
            setBom(null);
            onBomReady?.(source, null);
            setError(outcome);
            setStatus("empty");
            onLoadComplete?.("error");
            toast.info(outcome.title, { description: outcome.message, id: `${source}-structure` });
            return;
          }
          throw Object.assign(new Error(outcome.message), { outcome });
        }
        const root = transformPayload(payload);
        if (!root) {
          if (source === "configit") {
            const outcome = userFacingError(source, "Configit returned no usable BOM nodes.");
            setBom(null);
            onBomReady?.(source, null);
            setError(outcome);
            setStatus("empty");
            onLoadComplete?.("error");
            return;
          }
          again();
          return;
        }
        if (cancelled) return;
        setBom(root);
        onBomReady?.(source, root);
        setSelected(null);
        setStatus("ready");
        setLoadedAt(new Date());
        toast.success(`${source === "excel" ? "Excel" : source.charAt(0).toUpperCase() + source.slice(1)} structure ready`, { id: `${source}-structure` });
        onLoadComplete?.("ready");
      } catch (c) {
        if (cancelled) return;
        setBom(null);
        onBomReady?.(source, null);
        const supplied = c && typeof c === "object" && "outcome" in c ? (c as { outcome: UserFacingError }).outcome : userFacingError(source, c);
        setStatus("error");
        setError(supplied);
        toast.error(supplied.title, { description: supplied.message, id: `${source}-structure` });
        onLoadComplete?.("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    active,
    endpoint,
    payloadOverride,
    refreshSignal,
    retry,
    source,
    transformPayload,
  ]);
  useEffect(() => {
    registerImpactBom(source, bom);
    registerRequirementBom(source, bom);
    return () => {
      registerImpactBom(source, null);
      registerRequirementBom(source, null);
    };
  }, [source, bom]);
  useEffect(() => {
    if (trace.focus) tree.current?.openAll();
  }, [trace.focus]);
  useEffect(() => {
    if (!comparisonMode) setComparisonModalOpen(false);
  }, [comparisonMode]);
  const select = (node: TreeNodeData) => {
    setSelected(node);
    const nodeComparison = comparisonMode ? comparison?.[node.id] : undefined;
    if (comparisonMode && nodeComparison) setComparisonModalOpen(true);
    if (impact.enabled) runImpactSearch(source, node);
    if (trace.enabled) runRequirementTrace(source, node, viewMode === "tree");
  };
  const data = useMemo(() => (bom ? [bom] : []), [bom]),
    summary = useMemo(() => (bom ? metrics(bom) : null), [bom]),
    shown = selected ? sourcePresentation(selected, source) : null,
    selectedComparison =
      selected && comparisonMode ? comparison?.[selected.id] : undefined,
    term = `${search.toLowerCase()}|${comparisonMode ? comparisonFilter : "all"}|${changeImpactFilter}`,
    catalog = getLoadedRequirementCatalog(),
    overlayOwner = Object.keys(trace.loadedBoms)[0] === source,
    treeHeight = isFullscreen ? Math.max(520, viewportHeight - 285) : 510;
  return (
    <>
      <motion.section
        ref={panelRef}
        layout
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950/95 fullscreen:h-screen fullscreen:w-screen fullscreen:rounded-none fullscreen:border-0 fullscreen:bg-white dark:fullscreen:bg-[#020617]"
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title} structure</p>
            <p className="mt-0.5 text-xs text-slate-500">{loadedAt ? `Updated ${loadedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Source result"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2"><SourceStateBadge status={status} />{isFullscreen ? <span className="hidden text-xs font-semibold text-cyan-600 dark:text-cyan-300 sm:inline">Fullscreen</span> : null}</div>
        </header>
        {status === "ready" && bom && summary ? (
          <>
            <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search this BOM"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Tool
                    disabled={viewMode !== "tree"}
                    onClick={() => tree.current?.openAll()}
                  >
                    <IconChevronsDown className="h-4 w-4" />
                  </Tool>
                  <Tool
                    disabled={viewMode !== "tree"}
                    onClick={() => tree.current?.closeAll()}
                  >
                    <IconChevronsUp className="h-4 w-4" />
                  </Tool>
                  <BomFullscreenButton
                    isFullscreen={isFullscreen}
                    onToggle={toggleFullscreen}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ImpactModeToggle
                    enabled={impact.enabled}
                    result={impact.result}
                    loadedCount={Object.keys(impact.loadedBoms).length}
                  />
                  <RequirementTraceToggle
                    enabled={trace.enabled}
                    count={trace.result?.totalRevisions ?? 0}
                  />
                  <RequirementsExplorerButton count={catalog.length} />
                  <BomViewSwitcher mode={viewMode} onChange={setViewMode} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border dark:divide-slate-800 dark:border-slate-800">
                {[
                  [summary.total, "Items"],
                  [summary.assemblies, "Assemblies"],
                  [summary.leaves, "Leaf"],
                  [summary.depth, "Levels"],
                ].map(([v, l]) => (
                  <div key={String(l)} className="p-2 text-center">
                    <b className="block text-xs">{v}</b>
                    <span className="text-xs uppercase text-slate-500">
                      {l}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
              <AnimatePresence mode="wait">
                {viewMode === "constellation" ? (
                  <BomConstellationView
                    key="constellation"
                    root={bom}
                    source={source}
                    comparison={comparisonMode ? comparison : undefined}
                    search={search}
                    selectedId={selected?.id}
                    onSelect={select}
                    onClearSelection={() => setSelected(null)}
                    onFullScreen={toggleFullscreen}
                    requirementTraceEnabled={trace.enabled}
                    requirementResult={
                      trace.result?.selectedSource === source
                        ? trace.result
                        : null
                    }
                    requirementFocus={trace.focus}
                    changeImpact={source === "windchill" ? changeImpact : null}
                  />
                ) : viewMode === "three-dimensional" ? (
                  <BomThreeUniverseView
                    key="three-dimensional"
                    root={bom}
                    source={source}
                    comparison={comparisonMode ? comparison : undefined}
                    search={search}
                    selectedId={selected?.id}
                    onSelect={select}
                    onFullScreen={toggleFullscreen}
                    requirementTraceEnabled={trace.enabled}
                    requirementResult={
                      trace.result?.selectedSource === source
                        ? trace.result
                        : null
                    }
                    requirementFocus={trace.focus}
                    changeImpact={source === "windchill" ? changeImpact : null}
                    changeImpactFilter={changeImpactFilter}
                  />
                ) : viewMode === "radial" ? (
                  <BomRadialExplorerView
                    key="radial"
                    root={bom}
                    source={source}
                    comparison={comparisonMode ? comparison : undefined}
                    search={search}
                    selectedId={selected?.id}
                    onSelect={select}
                    onFullScreen={toggleFullscreen}
                  />
                ) : (
                  <motion.div
                    key="tree"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full overflow-hidden"
                  >
                    <Tree
                      ref={tree}
                      data={data}
                      openByDefault={Boolean(trace.focus)}
                      width="100%"
                      height={treeHeight}
                      rowHeight={68}
                      indent={22}
                      overscanCount={8}
                      searchTerm={term}
                      searchMatch={(node, value) => {
                        const [q, f, changeFilter] = value.split("|");
                        const nodeImpact = changeImpact?.impactMap[node.data.id];
                        return (
                          (!q || searchText(node.data, source).includes(q)) &&
                          (f === "all" || comparison?.[node.data.id]?.status === f) &&
                          (changeFilter === "all" || nodeImpact?.impact === changeFilter)
                        );
                      }}
                    >
                      {(props) => (
                        <TreeRow
                          {...props}
                          source={source}
                          comparisonMode={comparisonMode}
                          comparison={comparison?.[props.node.data.id]}
                          selected={selected?.id === props.node.data.id}
                          impactMatch={impactIds.has(props.node.data.id)}
                          changeImpact={changeImpact?.impactMap[props.node.data.id]}
                          focusRelationship={focusById[props.node.data.id]}
                          onSelect={select}
                        />
                      )}
                    </Tree>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {selected &&
                viewMode === "tree" &&
                !comparisonMode &&
                !trace.enabled &&
                !trace.focus ? (
                  <Details
                    node={selected}
                    shown={shown}
                    onClose={() => setSelected(null)}
                    fullScreen={isFullscreen}
                    changeImpact={changeImpact?.impactMap[selected.id]}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          </>
        ) : (
          <Empty
            source={source}
            status={status}
            error={error}
            progress={progress}
            label={loadingLabel}
            retry={onRetryRequest ?? (() => setRetry((v) => v + 1))}
            edit={onEditRequest}
          />
        )}
      </motion.section>
      {impact.enabled && impact.result?.selectedSource === source ? (
        <ImpactAnalysisWorkspace result={impact.result} />
      ) : null}
      {trace.modalOpen && trace.result?.selectedSource === source ? (
        <RequirementEvolutionModal result={trace.result} />
      ) : null}
      {trace.explorerOpen && overlayOwner ? (
        <RequirementsExplorerModal catalog={catalog} />
      ) : null}
      {trace.focus && overlayOwner ? (
        <RequirementFocusSummary focus={trace.focus} />
      ) : null}
      <ComparisonReasoningModal
        open={comparisonModalOpen}
        nodeName={shown?.name ?? selected?.name ?? "Selected BOM line"}
        itemId={shown?.itemId}
        source={source}
        counterpartLabel={counterpartLabel}
        comparison={selectedComparison}
        onClose={() => setComparisonModalOpen(false)}
      />
    </>
  );
}
function Details({
  node,
  shown,
  onClose,
  fullScreen,
  changeImpact,
}: {
  node: TreeNodeData;
  shown: ReturnType<typeof sourcePresentation> | null;
  onClose: () => void;
  fullScreen: boolean;
  changeImpact?: WindchillNodeImpact;
}) {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`absolute z-40 rounded-2xl border bg-white/95 p-4 shadow-2xl dark:bg-slate-900/95 ${fullScreen ? "bottom-3 right-3 top-3 w-[390px]" : "bottom-3 left-3 right-3"}`}
    >
      <div className="flex justify-between">
        <div>
          <p className="text-sm uppercase text-cyan-600">
            BOM line details
          </p>
          <h4 className="mt-1 text-sm font-semibold">{shown?.name}</h4>
        </div>
        <button type="button" onClick={onClose}>
          <IconX className="h-4 w-4" />
        </button>
      </div>
      {changeImpact ? (
        <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[.08] p-3">
          <p className="text-xs font-bold uppercase text-amber-500">{changeImpact.impact === "direct" ? "Directly affected" : "Impacted assembly"}</p>
          {changeImpact.notices?.map((notice, index) => <p key={`${notice.number}-${index}`} className="mt-1 text-xs text-slate-600 dark:text-slate-300">CN {notice.number ?? "Unknown"} -+ {notice.name ?? "Unnamed change"}{notice.changeIntent ? ` -+ ${notice.changeIntent}` : ""}{notice.affectedVersion ? ` -+ ${notice.affectedVersion}` : ""}</p>)}
        </div>
      ) : null}
      <p className="mt-4 text-xs text-slate-500">
        <IconHierarchy className="mr-2 inline h-4 w-4" />
        {node.children?.length
          ? `${node.children.length} direct children`
          : "Leaf component"}
      </p>
    </motion.aside>
  );
}
function Tool({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 disabled:opacity-35 dark:border-slate-700"
    >
      {children}
    </button>
  );
}
function Empty({
  source,
  status,
  error,
  progress,
  label,
  retry,
  edit,
}: {
  source: SourceType;
  status: Status;
  error: UserFacingError | null;
  progress?: PipelineProgress | null;
  label: string;
  retry: () => void;
  edit?: () => void;
}) {
  if (status === "loading") {
    const message = progress?.message ? safeProgressMessage(source, progress.message) : progress?.phase ? safeProgressMessage(source, progress.message) : label;
    return <SourceStructureSkeleton label={message || "Preparing source structure"} progress={progress?.progressPercent} />;
  }
  if (status === "empty" && error) {
    return <div className="p-5 sm:p-8"><OutcomeNotice tone="info" title={error.title} message={error.message} technicalDetails={error.technicalDetails} actions={<>{edit ? <button type="button" onClick={edit} className="h-10 rounded-lg border border-slate-300 px-3.5 text-sm font-semibold dark:border-slate-700">Review request</button> : null}<RetryButton onClick={retry} label="Run again" /></>} /></div>;
  }
  if (status === "error" && error) {
    return <div className="p-5 sm:p-8"><OutcomeNotice tone={error.kind === "validation" || error.kind === "configuration" ? "warning" : "error"} title={error.title} message={error.message} technicalDetails={error.technicalDetails} actions={<>{edit ? <button type="button" onClick={edit} className="h-10 rounded-lg border border-slate-300 px-3.5 text-sm font-semibold dark:border-slate-700">Edit request</button> : null}{error.retryable ? <RetryButton onClick={retry} /> : null}</>} /></div>;
  }
  return (
    <div className="flex min-h-[320px] items-center justify-center p-8 text-center">
      <div><IconPackage className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-4 text-sm font-semibold">Waiting for a request</p><p className="mt-2 text-sm text-slate-500">Submit an identifier to load a structure.</p></div>
    </div>
  );
}
