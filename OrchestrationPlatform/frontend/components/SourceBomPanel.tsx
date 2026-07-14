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
import { sourcePresentation } from "@/lib/bom-comparison";
import type { PipelineProgress } from "@/lib/api";
import type {
  ComparisonFilter,
  NodeComparison,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";
type Props = {
  source: SourceType;
  title: string;
  endpoint: string;
  transformPayload: (p: unknown) => TreeNodeData | null;
  active: boolean;
  payloadOverride?: unknown;
  refreshSignal?: number;
  loadingLabel?: string;
  onLoadComplete?: (s: "ready" | "error") => void;
  onBomReady?: (s: SourceType, r: TreeNodeData | null) => void;
  progress?: PipelineProgress | null;
  comparisonMode?: boolean;
  comparison?: Record<string, NodeComparison>;
  comparisonFilter?: ComparisonFilter;
  counterpartLabel?: string;
};
type Status = "idle" | "loading" | "ready" | "error";
const POLL = 2000;
const V = {
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
function rec(v: unknown) {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function state(v: unknown) {
  const r = rec(v);
  return typeof r?.status === "string" ? r.status.toLowerCase() : "";
}
function msg(v: unknown) {
  if (typeof v === "string" && v.trim()) return v;
  const r = rec(v);
  return typeof r?.error === "string"
    ? r.error
    : typeof r?.message === "string"
      ? r.message
      : "Failed to load BOM";
}
function pending(v: unknown) {
  return [
    "in_progress",
    "in progress",
    "processing",
    "pending",
    "accepted",
    "running",
  ].includes(state(v));
}
function text(n: TreeNodeData, s: SourceType) {
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
  const q = [{ node: root, level: 1 }];
  while (q.length) {
    const x = q.shift();
    if (!x) continue;
    total++;
    depth = Math.max(depth, x.level);
    const c = Array.isArray(x.node.children) ? x.node.children : [];
    if (c.length) {
      assemblies++;
      q.push(...c.map((node) => ({ node, level: x.level + 1 })));
    } else leaves++;
  }
  return { total, assemblies, leaves, depth };
}
function Tip({ c }: { c: NodeComparison }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-[calc(100%+9px)] right-0 z-50 hidden w-[300px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xl group-hover/tip:block group-focus-within/tip:block dark:border-slate-700 dark:bg-slate-900"
    >
      <p className="text-xs font-semibold">
        {V[c.status].label} · {Math.round(c.confidence * 100)}%
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        {c.reasoning.summary}
      </p>
      <ul className="mt-2 space-y-1 text-[10px] text-slate-500">
        {c.reasoning.details.slice(0, 4).map((x) => (
          <li key={x}>• {x}</li>
        ))}
      </ul>
    </div>
  );
}
function Row({
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
  onSelect: (n: TreeNodeData) => void;
}) {
  const p = sourcePresentation(node.data, source),
    has = !node.isLeaf,
    c = comparisonMode ? comparison : undefined,
    v = c ? V[c.status] : null;
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(node.data);
    }
  };
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (has) node.toggle();
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
        onKeyDown={key}
        onClick={() => onSelect(node.data)}
        onDoubleClick={() => has && node.toggle()}
        className={[
          "flex w-full min-w-0 items-center gap-2 rounded-xl border px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 sm:gap-3 sm:px-3",
          selected
            ? "border-cyan-300 bg-cyan-50 dark:border-cyan-400/30 dark:bg-cyan-400/[.09]"
            : v
              ? v.row
              : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500"
          aria-label={has ? "Toggle children" : "Leaf node"}
        >
          {has ? (
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
          <span className="block truncate text-sm font-medium">{p.name}</span>
          <span className="mt-.5 flex gap-2 overflow-hidden text-[11px] text-slate-500">
            {p.itemId ? (
              <span className="truncate">Item ID: {p.itemId}</span>
            ) : null}
            {p.quantity ? (
              <span className="truncate">Quantity: {p.quantity}</span>
            ) : null}
          </span>
        </span>
        {c && v ? (
          <span className="group/tip relative hidden sm:block">
            <span
              tabIndex={0}
              className="inline-flex items-center gap-1.5 rounded-full border border-current/20 bg-white/60 px-2 py-1 text-[9px] font-semibold uppercase dark:bg-slate-950/30"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
              {v.label}
            </span>
            <Tip c={c} />
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
  const [bom, setBom] = useState<TreeNodeData | null>(null),
    [status, setStatus] = useState<Status>("idle"),
    [error, setError] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<TreeNodeData | null>(null),
    [full, setFull] = useState(false),
    [retry, setRetry] = useState(0),
    [fallback, setFallback] = useState(false);
  const tree = useRef<TreeApi<TreeNodeData> | null>(null);
  useEffect(() => {
    if (!active) {
      const t = setTimeout(() => {
        setBom(null);
        onBomReady?.(source, null);
        setStatus("idle");
        setError(null);
        setSelected(null);
      }, 0);
      return () => clearTimeout(t);
    }
    if (payloadOverride != null) {
      const t = setTimeout(() => {
        try {
          const root = transformPayload(payloadOverride);
          if (!root) throw new Error("Malformed extraction payload.");
          setFallback(rec(payloadOverride)?.source === "sample-fallback");
          setBom(root);
          onBomReady?.(source, root);
          setStatus("ready");
          onLoadComplete?.("ready");
        } catch (e) {
          setStatus("error");
          setError(e instanceof Error ? e.message : String(e));
          onLoadComplete?.("error");
        }
      }, 0);
      return () => clearTimeout(t);
    }
    if (!endpoint) return;
    let cancelled = false,
      timer: number | undefined;
    const again = () => {
      if (!cancelled) timer = window.setTimeout(() => void load(), POLL);
    };
    const load = async () => {
      if (cancelled) return;
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
        if (!response.ok && pending(payload)) {
          again();
          return;
        }
        if (!response.ok) throw new Error(msg(payload));
        if (["error", "failed", "failure"].includes(state(payload)))
          throw new Error(msg(payload));
        const root = transformPayload(payload);
        if (!root) {
          again();
          return;
        }
        if (cancelled) return;
        setFallback(rec(payload)?.source === "sample-fallback");
        setBom(root);
        onBomReady?.(source, root);
        setSelected(null);
        setStatus("ready");
        onLoadComplete?.("ready");
      } catch (e) {
        if (cancelled) return;
        setBom(null);
        onBomReady?.(source, null);
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
        onLoadComplete?.("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
    if (!full) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = old;
      removeEventListener("keydown", close);
    };
  }, [full]);
  const data = useMemo(() => (bom ? [bom] : []), [bom]),
    m = useMemo(() => (bom ? metrics(bom) : null), [bom]),
    shown = selected ? sourcePresentation(selected, source) : null,
    c = selected && comparisonMode ? comparison?.[selected.id] : undefined,
    term = `${search.toLowerCase()}|${comparisonMode ? comparisonFilter : "all"}`;
  const panel = (
    <section
      className={[
        "relative flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950/95",
        full ? "fixed inset-2 z-[100] shadow-2xl sm:inset-6" : "h-full",
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
      {status === "ready" && bom && m ? (
        <>
          <div className="border-b border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
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
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <IconX className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Tool onClick={() => tree.current?.openAll()}>
                <IconChevronsDown className="h-4 w-4" />
                Expand
              </Tool>
              <Tool onClick={() => tree.current?.closeAll()}>
                <IconChevronsUp className="h-4 w-4" />
                Collapse
              </Tool>
              <Tool onClick={() => setFull((v) => !v)}>
                <IconArrowsMaximize className="h-4 w-4" />
                {full ? "Close" : "Full screen"}
              </Tool>
            </div>
            <div className="mt-3 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {[
                [m.total, "Items"],
                [m.assemblies, "Assemblies"],
                [m.leaves, "Leaf"],
                [m.depth, "Levels"],
              ].map(([v, l]) => (
                <div key={String(l)} className="p-2 text-center">
                  <b className="block text-xs">{v}</b>
                  <span className="text-[9px] uppercase text-slate-500">
                    {l}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex-1 p-2 sm:p-3">
            <Tree
              ref={tree}
              data={data}
              openByDefault={false}
              width="100%"
              height={full ? 650 : 510}
              rowHeight={68}
              indent={22}
              overscanCount={8}
              searchTerm={term}
              searchMatch={(node, t) => {
                const [q, f] = t.split("|");
                return (
                  (!q || text(node.data, source).includes(q)) &&
                  (f === "all" || comparison?.[node.data.id]?.status === f)
                );
              }}
            >
              {(props) => (
                <Row
                  {...props}
                  source={source}
                  comparisonMode={comparisonMode}
                  comparison={comparison?.[props.node.data.id]}
                  selected={selected?.id === props.node.data.id}
                  onSelect={setSelected}
                />
              )}
            </Tree>
            <AnimatePresence>
              {selected ? (
                <motion.aside
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  className={[
                    "absolute z-10 overflow-auto rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95",
                    full
                      ? "bottom-3 right-3 top-3 w-[390px]"
                      : "bottom-3 left-3 right-3 max-h-[75%]",
                  ].join(" ")}
                >
                  <div className="flex justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-cyan-600">
                        BOM line details
                      </p>
                      <h4 className="mt-1 text-sm font-semibold">
                        {shown?.name}
                      </h4>
                    </div>
                    <button onClick={() => setSelected(null)}>
                      <IconX className="h-4 w-4" />
                    </button>
                  </div>
                  {c ? (
                    <div className="mt-5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <p className="flex items-center gap-2 text-xs font-semibold">
                        {c.status === "matched" ? (
                          <IconCircleCheck className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <IconHelpCircle className="h-4 w-4 text-amber-500" />
                        )}
                        {V[c.status].label} · {Math.round(c.confidence * 100)}%
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        {c.reasoning.summary}
                      </p>
                      <div className="mt-3 space-y-2">
                        {c.reasoning.details.map((x) => (
                          <div
                            key={x}
                            className="rounded-lg bg-slate-50 p-2 text-[11px] dark:bg-slate-800/60"
                          >
                            {x}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-5 rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
                    <IconHierarchy className="mr-2 inline h-4 w-4" />
                    {selected.children?.length
                      ? `${selected.children.length} direct children`
                      : "Leaf component"}
                  </div>
                </motion.aside>
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
          retry={() => setRetry((v) => v + 1)}
        />
      )}
    </section>
  );
  return (
    <>
      {full ? (
        <button
          className="fixed inset-0 z-[90] bg-slate-950/70"
          onClick={() => setFull(false)}
        />
      ) : null}
      {panel}
    </>
  );
}
function Tool({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 text-[11px] dark:border-slate-700"
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
