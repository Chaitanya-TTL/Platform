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
  IconArrowsMaximize,
  IconChevronRight,
  IconChevronsDown,
  IconChevronsUp,
  IconCircleDashed,
  IconHierarchy,
  IconListDetails,
  IconPackage,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

type TreeNodeData = {
  id: string;
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNodeData[];
};

type SourceBomPanelProps = {
  title: string;
  endpoint: string;
  transformPayload: (payload: unknown) => TreeNodeData | null;
  active: boolean;
  payloadOverride?: unknown;
  refreshSignal?: number;
  loadingLabel?: string;
  onLoadComplete?: (status: "ready" | "error") => void;
};

type RowPresentation = {
  title: string;
  itemId?: string;
  quantity?: string;
};

type BomMetrics = {
  total: number;
  assemblies: number;
  leaves: number;
  depth: number;
};

const BOM_POLL_INTERVAL_MS = 2000;
const TREE_ROW_HEIGHT = 68;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normaliseValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function getAttribute(
  attributes: TreeNodeData["attributes"],
  keys: string[],
): string | undefined {
  if (!attributes) return undefined;
  for (const key of keys) {
    const value = normaliseValue(attributes[key]);
    if (value) return value;
  }
  return undefined;
}

function cleanTeamcenterTitle(name: string): string {
  const match = name.trim().match(/^[^;]+;\d+-(.*?)(?:\s+x\s+[\d.]+)?$/i);
  return match?.[1]?.trim() || name.trim();
}

function getConfigitParts(name: string): { title: string; itemId?: string } {
  const match = name.trim().match(/^(.*)_([A-Za-z0-9]+)$/);
  return match ? { title: match[1].trim(), itemId: match[2] } : { title: name.trim() };
}

function getWindchillItemId(id: string): string | undefined {
  return id.trim().match(/-([A-Za-z0-9]+)$/)?.[1];
}

function getRowPresentation(data: TreeNodeData): RowPresentation {
  const quantity = getAttribute(data.attributes, ["Qty", "Quantity"]);
  const teamcenterItemId = getAttribute(data.attributes, ["Item ID"]);

  if (teamcenterItemId) {
    return { title: cleanTeamcenterTitle(data.name), itemId: teamcenterItemId, quantity };
  }

  const productId = getAttribute(data.attributes, ["Product ID"]);
  if (productId) {
    return {
      title: data.name.replace(/^Product\s+/i, "").trim(),
      itemId: productId,
      quantity,
    };
  }

  const configit = getConfigitParts(data.name);
  if (configit.itemId) {
    return { title: configit.title, itemId: configit.itemId, quantity };
  }

  return { title: data.name, itemId: getWindchillItemId(data.id), quantity };
}

function getSearchText(data: TreeNodeData): string {
  const row = getRowPresentation(data);
  return [
    row.title,
    row.itemId,
    row.quantity,
    data.name,
    ...Object.entries(data.attributes ?? {}).flatMap(([key, value]) => [key, String(value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function calculateMetrics(root: TreeNodeData): BomMetrics {
  let total = 0;
  let assemblies = 0;
  let leaves = 0;
  let depth = 0;
  const queue: Array<{ node: TreeNodeData; level: number }> = [{ node: root, level: 1 }];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    total += 1;
    depth = Math.max(depth, current.level);
    const children = current.node.children ?? [];
    if (children.length) {
      assemblies += 1;
      queue.push(...children.map((node) => ({ node, level: current.level + 1 })));
    } else {
      leaves += 1;
    }
  }

  return { total, assemblies, leaves, depth };
}

function getBackendStatus(payload: unknown): string {
  const record = asRecord(payload);
  return typeof record?.status === "string" ? record.status.trim().toLowerCase() : "";
}

function getBackendMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = asRecord(payload);
  if (typeof record?.error === "string" && record.error.trim()) return record.error;
  if (typeof record?.message === "string" && record.message.trim()) return record.message;
  return "Failed to load BOM";
}

function isInProgressResponse(payload: unknown): boolean {
  return ["in_progress", "in progress", "processing", "pending", "accepted", "running"].includes(
    getBackendStatus(payload),
  );
}

function TreeRow({
  node,
  style,
  dragHandle,
  isSelected,
  onSelectNode,
}: NodeRendererProps<TreeNodeData> & {
  isSelected: boolean;
  onSelectNode: (node: TreeNodeData) => void;
}) {
  const row = getRowPresentation(node.data);
  const hasChildren = !node.isLeaf;

  const select = () => onSelectNode(node.data);
  const onKeyboardSelect = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
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
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group flex items-center pr-2"
    >
      <motion.div
        role="button"
        tabIndex={0}
        onClick={select}
        onKeyDown={onKeyboardSelect}
        onDoubleClick={() => hasChildren && node.toggle()}
        whileHover={{ x: 2 }}
        className={[
          "relative flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/55 sm:gap-3 sm:px-3",
          isSelected ? "bg-cyan-400/[0.09]" : "hover:bg-slate-800/60",
        ].join(" ")}
      >
        <span
          className={[
            "absolute inset-y-2 left-0 w-px rounded-full",
            isSelected ? "bg-cyan-300" : "bg-transparent group-hover:bg-cyan-400/60",
          ].join(" ")}
        />

        <button
          type="button"
          onClick={toggle}
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-700/70 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          {hasChildren ? (
            <motion.span animate={{ rotate: node.isOpen ? 90 : 0 }} transition={{ duration: 0.16 }}>
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-3.5 w-3.5 text-slate-600" />
          )}
        </button>

        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.07] text-cyan-300 ring-1 ring-inset ring-cyan-400/10">
          <IconPackage className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-5 text-slate-100">
            {row.title}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-[11px] leading-4 text-slate-500">
            {row.itemId ? <span className="truncate">Item ID: {row.itemId}</span> : null}
            {row.itemId && row.quantity ? (
              <span className="h-1 w-1 shrink-0 rounded-full bg-slate-700" />
            ) : null}
            {row.quantity ? <span className="truncate">Quantity: {row.quantity}</span> : null}
            {!row.itemId && !row.quantity ? <span>BOM line</span> : null}
          </span>
        </span>
      </motion.div>
    </motion.div>
  );
}

export function SourceBomPanel({
  title,
  endpoint,
  transformPayload,
  active,
  payloadOverride,
  refreshSignal,
  loadingLabel = "Fetching BOM structure...",
  onLoadComplete,
}: SourceBomPanelProps) {
  const [bom, setBom] = useState<TreeNodeData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNode, setSelectedNode] = useState<TreeNodeData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const treeRef = useRef<TreeApi<TreeNodeData> | null>(null);

  useEffect(() => {
    if (!active) {
      const timer = window.setTimeout(() => {
        setBom(null);
        setStatus("idle");
        setError(null);
        setSearchTerm("");
        setSelectedNode(null);
        setIsExpanded(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (payloadOverride !== undefined && payloadOverride !== null) {
      const timer = window.setTimeout(() => {
        setStatus("loading");
        setError(null);
        try {
          const root = transformPayload(payloadOverride);
          if (!root) throw new Error("The extraction JSON is unavailable or malformed.");
          setBom(root);
          setSelectedNode(null);
          setStatus("ready");
          onLoadComplete?.("ready");
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Failed to transform the BOM payload.";
          setBom(null);
          setStatus("error");
          setError(message);
          onLoadComplete?.("error");
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (!endpoint) return;

    let cancelled = false;
    let pollTimer: number | undefined;

    const schedulePoll = () => {
      if (!cancelled) pollTimer = window.setTimeout(() => void fetchBom(), BOM_POLL_INTERVAL_MS);
    };

    const fetchBom = async (): Promise<void> => {
      if (cancelled) return;
      setStatus("loading");
      setError(null);

      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const text = await response.text();
        let payload: unknown = null;
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            payload = text;
          }
        }

        if (!response.ok && isInProgressResponse(payload)) {
          schedulePoll();
          return;
        }
        if (!response.ok) throw new Error(getBackendMessage(payload));

        const backendStatus = getBackendStatus(payload);
        if (["error", "failed", "failure"].includes(backendStatus)) {
          throw new Error(getBackendMessage(payload));
        }

        const root = transformPayload(payload);
        if (!root) {
          schedulePoll();
          return;
        }
        if (cancelled) return;

        setBom(root);
        setSelectedNode(null);
        setStatus("ready");
        onLoadComplete?.("ready");
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setBom(null);
        setStatus("error");
        setError(message);
        onLoadComplete?.("error");
      }
    };

    void fetchBom();
    return () => {
      cancelled = true;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    };
  }, [active, endpoint, onLoadComplete, payloadOverride, refreshSignal, transformPayload, title]);

  useEffect(() => {
    if (!isExpanded) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isExpanded]);

  const treeData = useMemo(() => (bom ? [bom] : []), [bom]);
  const metrics = useMemo(() => (bom ? calculateMetrics(bom) : null), [bom]);
  const selectedPresentation = useMemo(
    () => (selectedNode ? getRowPresentation(selectedNode) : null),
    [selectedNode],
  );
  const resolvedStatus = active ? status : "idle";
  const treeHeight = isExpanded ? 650 : 510;

  const content = (
    <section
      className={[
        "relative flex min-h-0 flex-col overflow-hidden border border-slate-700/70 bg-slate-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        isExpanded
          ? "fixed inset-2 z-[100] rounded-2xl shadow-2xl shadow-black/60 sm:inset-6 sm:rounded-[28px]"
          : "h-full rounded-[22px]",
      ].join(" ")}
    >
      <PanelHeader title={title} status={resolvedStatus} />

      {resolvedStatus === "ready" && bom && metrics ? (
        <>
          <div className="shrink-0 border-b border-slate-800/70 bg-slate-950/60 p-3 sm:p-4">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, item ID, or quantity"
                aria-label="Search BOM"
                className="h-10 w-full rounded-xl border border-slate-700/75 bg-slate-900/75 pl-9 pr-9 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/55 focus:ring-2 focus:ring-cyan-400/10"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white"
                >
                  <IconX className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <ToolbarButton title="Expand all" onClick={() => treeRef.current?.openAll()}>
                <IconChevronsDown className="h-4 w-4" />
                <span className="hidden min-[390px]:inline">Expand all</span>
                <span className="min-[390px]:hidden">Expand</span>
              </ToolbarButton>
              <ToolbarButton title="Collapse all" onClick={() => treeRef.current?.closeAll()}>
                <IconChevronsUp className="h-4 w-4" />
                <span className="hidden min-[390px]:inline">Collapse all</span>
                <span className="min-[390px]:hidden">Collapse</span>
              </ToolbarButton>
              <ToolbarButton
                title={isExpanded ? "Close workspace" : "Open full screen"}
                onClick={() => setIsExpanded((value) => !value)}
                accent
              >
                {isExpanded ? <IconX className="h-4 w-4" /> : <IconArrowsMaximize className="h-4 w-4" />}
                <span>{isExpanded ? "Close" : "Full screen"}</span>
              </ToolbarButton>
            </div>

            <div className="mt-3 grid grid-cols-4 divide-x divide-slate-800 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/35">
              <Metric value={metrics.total} label="Items" />
              <Metric value={metrics.assemblies} label="Assemblies" />
              <Metric value={metrics.leaves} label="Leaf parts" />
              <Metric value={metrics.depth} label="Levels" />
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950/20 p-2 sm:p-3">
            <Tree<TreeNodeData>
              ref={treeRef}
              data={treeData}
              openByDefault={false}
              width="100%"
              height={treeHeight}
              rowHeight={TREE_ROW_HEIGHT}
              indent={22}
              overscanCount={8}
              paddingTop={6}
              paddingBottom={18}
              searchTerm={searchTerm}
              searchMatch={(node, term) =>
                getSearchText(node.data).includes(term.trim().toLowerCase())
              }
            >
              {(props) => (
                <TreeRow
                  {...props}
                  isSelected={selectedNode?.id === props.node.data.id}
                  onSelectNode={setSelectedNode}
                />
              )}
            </Tree>

            <AnimatePresence>
              {selectedNode ? (
                <motion.aside
                  initial={{ opacity: 0, y: 20, x: isExpanded ? 20 : 0 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  exit={{ opacity: 0, y: 20, x: isExpanded ? 20 : 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={[
                    "absolute z-10 overflow-auto border border-slate-700/75 bg-slate-900/95 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl",
                    isExpanded
                      ? "bottom-3 right-3 top-3 w-[min(340px,calc(100%-24px))] rounded-2xl"
                      : "bottom-3 left-3 right-3 max-h-[62%] rounded-2xl",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-300 ring-1 ring-inset ring-cyan-400/15">
                        <IconListDetails className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                          BOM line details
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-white">
                          {selectedPresentation?.title}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedNode(null)}
                      aria-label="Close node details"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-white"
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {selectedPresentation?.itemId ? (
                      <DetailItem label="Item ID" value={selectedPresentation.itemId} />
                    ) : null}
                    {selectedPresentation?.quantity ? (
                      <DetailItem label="Quantity" value={selectedPresentation.quantity} />
                    ) : null}
                    {Object.entries(selectedNode.attributes ?? {})
                      .filter(([key]) => !["Item ID", "Product ID", "Qty", "Quantity"].includes(key))
                      .map(([key, value]) => (
                        <DetailItem key={key} label={key} value={String(value)} />
                      ))}
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <IconHierarchy className="h-3.5 w-3.5" /> Structure
                    </span>
                    <p className="mt-2 text-xs text-slate-400">
                      {selectedNode.children?.length
                        ? `${selectedNode.children.length} direct ${selectedNode.children.length === 1 ? "child" : "children"}`
                        : "Leaf component"}
                    </p>
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <LoadingState status={resolvedStatus} error={error} loadingLabel={loadingLabel} />
      )}
    </section>
  );

  return (
    <>
      {isExpanded ? (
        <motion.button
          type="button"
          aria-label="Close full screen workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[90] cursor-default bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setIsExpanded(false)}
        />
      ) : null}
      {content}
    </>
  );
}

function PanelHeader({
  title,
  status,
}: {
  title: string;
  status: "idle" | "loading" | "ready" | "error";
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/70 px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-100">{title}</h3>
        <p className="mt-1 truncate text-xs text-slate-500">Extracted BOM structure</p>
      </div>
      <span
        className={[
          "inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
          status === "ready"
            ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300"
            : status === "error"
              ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-300"
              : status === "loading"
                ? "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300"
                : "border-slate-700 bg-slate-800/50 text-slate-500",
        ].join(" ")}
      >
        <span
          className={[
            "h-1.5 w-1.5 rounded-full",
            status === "ready"
              ? "bg-emerald-300"
              : status === "error"
                ? "bg-rose-300"
                : status === "loading"
                  ? "animate-pulse bg-cyan-300"
                  : "bg-slate-600",
          ].join(" ")}
        />
        {status === "loading" ? "Processing" : status === "ready" ? "Ready" : status === "error" ? "Error" : "Idle"}
      </span>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
  accent = false,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 sm:gap-2 sm:px-3 sm:text-xs",
        accent
          ? "border-cyan-400/30 bg-cyan-400/[0.07] text-cyan-200 hover:border-cyan-400/50 hover:bg-cyan-400/10"
          : "border-slate-700/70 bg-slate-900/60 text-slate-300 hover:border-cyan-400/35 hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 px-1.5 py-2 text-center sm:px-2">
      <strong className="block text-xs font-semibold text-slate-200">{value}</strong>
      <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.08em] text-slate-600 sm:text-[10px]">
        {label}
      </span>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-200">{value}</p>
    </div>
  );
}

function LoadingState({
  status,
  error,
  loadingLabel,
}: {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  loadingLabel: string;
}) {
  return (
    <div className="flex min-h-[360px] flex-1 items-center justify-center bg-slate-950/20 px-6 py-12 sm:min-h-[420px]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-sm text-center">
        <motion.div
          animate={status === "loading" ? { y: [0, -4, 0] } : { y: 0 }}
          transition={status === "loading" ? { duration: 1.8, repeat: Infinity } : undefined}
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-500 ring-1 ring-inset ring-slate-700/60"
        >
          <IconPackage className="h-5 w-5" />
        </motion.div>
        <p className="mt-4 text-sm font-medium text-slate-200">
          {status === "loading" ? "Preparing BOM preview" : status === "error" ? "BOM preview unavailable" : "Waiting for extraction"}
        </p>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          {status === "loading" ? loadingLabel : status === "error" ? error : "The extracted structure will appear here when available."}
        </p>
        {status === "loading" ? (
          <div className="mx-auto mt-5 h-1 w-32 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full w-1/3 rounded-full bg-cyan-400"
              animate={{ x: ["-100%", "300%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
