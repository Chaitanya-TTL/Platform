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
  IconAlertTriangle,
  IconArrowsMaximize,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
  IconCircleCheck,
  IconCircleDashed,
  IconHelpCircle,
  IconHierarchy,
  IconPackage,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

import type { PipelineProgress } from "@/lib/api";

import { BomViewSwitcher } from "@/components/bom-visualization/BomViewSwitcher";
import { BomConstellationView } from "@/components/bom-visualization/BomConstellationView";
import { BomThreeUniverseView } from "@/components/bom-visualization/BomThreeUniverseView";
import { SourceType, TreeNodeData, NodeComparison, ComparisonFilter } from "@/types/bom-comparison";
import { BomViewMode } from "@/types/bom-visualization";
import { sourcePresentation } from "@/lib/bom-comparison";

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
};

type Status = "idle" | "loading" | "ready" | "error";
const POLL_INTERVAL = 2000;
const visuals = {
  matched: {
    label: "Matched",
    row: "border-emerald-300 bg-emerald-50 dark:border-emerald-400/25 dark:bg-emerald-400/[.08]",
    dot: "bg-emerald-500",
  },
  changed: {
    label: "Changed",
    row: "border-amber-300 bg-amber-50 dark:border-amber-400/25 dark:bg-amber-400/[.08]",
    dot: "bg-amber-500",
  },
  missing: {
    label: "Missing",
    row: "border-rose-300 bg-rose-50 dark:border-rose-400/25 dark:bg-rose-400/[.08]",
    dot: "bg-rose-500",
  },
  "source-only": {
    label: "Source-only",
    row: "border-sky-300 bg-sky-50 dark:border-sky-400/25 dark:bg-sky-400/[.08]",
    dot: "bg-sky-500",
  },
  probable: {
    label: "Review match",
    row: "border-violet-300 bg-violet-50 dark:border-violet-400/25 dark:bg-violet-400/[.08]",
    dot: "bg-violet-500",
  },
} as const;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function backendStatus(value: unknown) {
  const item = record(value);
  return typeof item?.status === "string" ? item.status.toLowerCase() : "";
}
function backendMessage(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  const item = record(value);
  return typeof item?.error === "string"
    ? item.error
    : typeof item?.message === "string"
      ? item.message
      : "Failed to load BOM";
}
function isPending(value: unknown) {
  return [
    "in_progress",
    "in progress",
    "processing",
    "pending",
    "accepted",
    "running",
  ].includes(backendStatus(value));
}
function searchText(node: TreeNodeData, source: SourceType) {
  const presented = sourcePresentation(node, source);
  return [
    presented.name,
    presented.itemId,
    presented.quantity,
    node.name,
    ...Object.values(node.attributes ?? {}),
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
  const queue: Array<{ node: TreeNodeData; level: number }> = [
    { node: root, level: 1 },
  ];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    total += 1;
    depth = Math.max(depth, current.level);
    const children = Array.isArray(current.node.children)
      ? current.node.children
      : [];
    if (children.length) {
      assemblies += 1;
      queue.push(
        ...children.map((node) => ({ node, level: current.level + 1 })),
      );
    } else leaves += 1;
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
  onSelect,
}: NodeRendererProps<TreeNodeData> & {
  source: SourceType;
  comparisonMode: boolean;
  comparison?: NodeComparison;
  selected: boolean;
  onSelect: (node: TreeNodeData) => void;
}) {
  const presented = sourcePresentation(node.data, source);
  const hasChildren = !node.isLeaf;
  const result = comparisonMode ? comparison : undefined;
  const visual = result ? visuals[result.status] : null;
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
  return (
    <motion.div
      style={style}
      ref={dragHandle}
      className="flex items-center pr-2"
    >
      <div
        role="button"
        tabIndex={0}
        onKeyDown={keyDown}
        onClick={() => onSelect(node.data)}
        onDoubleClick={() => hasChildren && node.toggle()}
        className={[
          "flex w-full min-w-0 items-center gap-2 rounded-xl border px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:gap-3 sm:px-3",
          selected
            ? "border-cyan-300 bg-cyan-50 dark:border-cyan-400/30 dark:bg-cyan-400/[.09]"
            : visual
              ? visual.row
              : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500"
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
        >
          {hasChildren ? (
            <motion.span animate={{ rotate: node.isOpen ? 90 : 0 }}>
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[.07] dark:text-cyan-300">
          <IconPackage className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {presented.name}
          </span>
          <span className="text-[11px] text-slate-500">
            {presented.itemId ? `Item ID: ${presented.itemId}` : ""}
          </span>
        </span>
        {result && visual ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-current/20 bg-white/60 px-2 py-1 text-[9px] font-semibold uppercase dark:bg-slate-950/30">
            <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
            {visual.label}
          </span>
        ) : null}
      </div>
    </motion.div>
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
}: Props) {
  const [bom, setBom] = useState<TreeNodeData | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TreeNodeData | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [viewMode, setViewMode] = useState<BomViewMode>("tree");
  const tree = useRef<TreeApi<TreeNodeData> | null>(null);

  useEffect(() => {
    if (!active) {
      const timer = window.setTimeout(() => {
        setBom(null);
        onBomReady?.(source, null);
        setStatus("idle");
        setSelected(null);
        setViewMode("tree");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (payloadOverride != null) {
      const timer = window.setTimeout(() => {
        try {
          const root = transformPayload(payloadOverride);
          if (!root) throw new Error("Malformed extraction payload.");
          setFallback(record(payloadOverride)?.source === "sample-fallback");
          setBom(root);
          onBomReady?.(source, root);
          setStatus("ready");
          onLoadComplete?.("ready");
        } catch (cause) {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : String(cause));
          onLoadComplete?.("error");
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!endpoint) return;
    let cancelled = false;
    let timer: number | undefined;
    const again = () => {
      if (!cancelled)
        timer = window.setTimeout(() => void load(), POLL_INTERVAL);
    };
    const load = async () => {
      if (cancelled) return;
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const raw = await response.text();
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
        if (!response.ok) throw new Error(backendMessage(payload));
        const root = transformPayload(payload);
        if (!root) {
          again();
          return;
        }
        if (cancelled) return;
        setFallback(record(payload)?.source === "sample-fallback");
        setBom(root);
        onBomReady?.(source, root);
        setSelected(null);
        setStatus("ready");
        onLoadComplete?.("ready");
      } catch (cause) {
        if (cancelled) return;
        setBom(null);
        onBomReady?.(source, null);
        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
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

  const data = useMemo(() => (bom ? [bom] : []), [bom]);
  const summary = useMemo(() => (bom ? metrics(bom) : null), [bom]);
  const shown = selected ? sourcePresentation(selected, source) : null;
  const selectedComparison =
    selected && comparisonMode ? comparison?.[selected.id] : undefined;
  const term = `${search.toLowerCase()}|${comparisonMode ? comparisonFilter : "all"}`;

  const panel = (
    <section
      className={[
        "relative flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950/95",
        fullScreen ? "fixed inset-2 z-[100] shadow-2xl sm:inset-6" : "h-full",
      ].join(" ")}
    >
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {comparisonMode
              ? `Compared with ${counterpartLabel}`
              : "Extracted BOM structure"}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase dark:border-slate-700">
          {status}
        </span>
      </header>
      {fallback ? (
        <div className="flex gap-2 border-b border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/[.07] dark:text-amber-200">
          <IconAlertTriangle className="h-4 w-4" />
          Sample Windchill fallback data is displayed.
        </div>
      ) : null}
      {status === "ready" && bom && summary ? (
        <>
          <div className="border-b border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
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
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="grid flex-1 grid-cols-3 gap-2">
                <Tool
                  disabled={viewMode !== "tree"}
                  onClick={() => tree.current?.openAll()}
                >
                  <IconChevronsDown className="h-4 w-4" />
                  Expand
                </Tool>
                <Tool
                  disabled={viewMode !== "tree"}
                  onClick={() => tree.current?.closeAll()}
                >
                  <IconChevronsUp className="h-4 w-4" />
                  Collapse
                </Tool>
                <Tool onClick={() => setFullScreen((value) => !value)}>
                  <IconArrowsMaximize className="h-4 w-4" />
                  {fullScreen ? "Close" : "Full screen"}
                </Tool>
              </div>
              <BomViewSwitcher mode={viewMode} onChange={setViewMode} />
            </div>
            <div className="mt-3 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {[
                [summary.total, "Items"],
                [summary.assemblies, "Assemblies"],
                [summary.leaves, "Leaf"],
                [summary.depth, "Levels"],
              ].map(([value, label]) => (
                <div key={String(label)} className="p-2 text-center">
                  <b className="block text-xs">{value}</b>
                  <span className="text-[9px] uppercase text-slate-500">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex-1 p-2 sm:p-3">
            <AnimatePresence mode="wait">
              {viewMode === "constellation" ? (
                <BomConstellationView
                  key="constellation"
                  root={bom}
                  source={source}
                  comparison={comparisonMode ? comparison : undefined}
                  search={search}
                  selectedId={selected?.id}
                  onSelect={setSelected}
                  onFullScreen={() => setFullScreen(true)}
                />
              ) : viewMode === "three-dimensional" ? (
                <BomThreeUniverseView
                  key="three-dimensional"
                  root={bom}
                  source={source}
                  comparison={comparisonMode ? comparison : undefined}
                  search={search}
                  selectedId={selected?.id}
                  onSelect={setSelected}
                  onFullScreen={() => setFullScreen(true)}
                />
              ) : (
                <motion.div
                  key="tree"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                >
                  <Tree
                    ref={tree}
                    data={data}
                    openByDefault={false}
                    width="100%"
                    height={fullScreen ? 650 : 510}
                    rowHeight={68}
                    indent={22}
                    overscanCount={8}
                    searchTerm={term}
                    searchMatch={(node, value) => {
                      const [query, filter] = value.split("|");
                      return (
                        (!query ||
                          searchText(node.data, source).includes(query)) &&
                        (filter === "all" ||
                          comparison?.[node.data.id]?.status === filter)
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
                        onSelect={setSelected}
                      />
                    )}
                  </Tree>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {selected && viewMode === "tree" ? (
                <Details
                  node={selected}
                  shown={shown}
                  comparison={selectedComparison}
                  onClose={() => setSelected(null)}
                  fullScreen={fullScreen}
                />
              ) : null}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <Empty
          status={status}
          error={error}
          progress={progress}
          label={loadingLabel}
          retry={() => setRetry((value) => value + 1)}
        />
      )}
    </section>
  );
  return (
    <>
      {fullScreen ? (
        <button
          type="button"
          className="fixed inset-0 z-[90] bg-slate-950/70"
          onClick={() => setFullScreen(false)}
          aria-label="Close full screen"
        />
      ) : null}
      {panel}
    </>
  );
}

function Details({
  node,
  shown,
  comparison,
  onClose,
  fullScreen,
}: {
  node: TreeNodeData;
  shown: ReturnType<typeof sourcePresentation> | null;
  comparison?: NodeComparison;
  onClose: () => void;
  fullScreen: boolean;
}) {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      className={[
        "absolute z-40 overflow-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95",
        fullScreen
          ? "bottom-3 right-3 top-3 w-[390px]"
          : "bottom-3 left-3 right-3 max-h-[75%]",
      ].join(" ")}
    >
      <div className="flex justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase text-cyan-600">
            BOM line details
          </p>
          <h4 className="mt-1 text-sm font-semibold">{shown?.name}</h4>
        </div>
        <button type="button" onClick={onClose}>
          <IconX className="h-4 w-4" />
        </button>
      </div>
      {comparison ? (
        <div className="mt-5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="flex items-center gap-2 text-xs font-semibold">
            {comparison.status === "matched" ? (
              <IconCircleCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <IconHelpCircle className="h-4 w-4 text-amber-500" />
            )}
            {visuals[comparison.status].label} ·{" "}
            {Math.round(comparison.confidence * 100)}%
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {comparison.reasoning.summary}
          </p>
        </div>
      ) : null}
      <div className="mt-5 rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
        <IconHierarchy className="mr-2 inline h-4 w-4" />
        {node.children?.length
          ? `${node.children.length} direct children`
          : "Leaf component"}
      </div>
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
      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 text-[11px] disabled:opacity-35 dark:border-slate-700"
    >
      {children}
    </button>
  );
}
function Empty({
  status,
  error,
  progress,
  label,
  retry,
}: {
  status: Status;
  error: string | null;
  progress?: PipelineProgress | null;
  label: string;
  retry: () => void;
}) {
  return (
    <div className="flex min-h-[380px] items-center justify-center p-8 text-center">
      <div>
        <IconPackage className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-4 text-sm font-semibold">
          {status === "loading"
            ? progress?.phase || "Preparing BOM preview"
            : status === "error"
              ? "BOM preview unavailable"
              : "Waiting for extraction"}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {status === "loading"
            ? progress?.message || label
            : status === "error"
              ? error
              : "Submit an identifier to begin."}
        </p>
        {status === "error" ? (
          <button
            type="button"
            onClick={retry}
            className="mt-5 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white"
          >
            <IconRefresh className="mr-2 inline h-4 w-4" />
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
