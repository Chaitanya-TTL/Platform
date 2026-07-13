"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  Tree,
  type NodeRendererProps,
  type TreeApi,
} from "react-arborist";
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

function normaliseValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function getAttribute(
  attributes: TreeNodeData["attributes"],
  keys: string[]
): string | undefined {
  if (!attributes) {
    return undefined;
  }

  for (const key of keys) {
    const value = normaliseValue(attributes[key]);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function cleanTeamcenterTitle(name: string): string {
  const match = name
    .trim()
    .match(/^[^;]+;\d+-(.*?)(?:\s+x\s+[\d.]+)?$/i);

  return match?.[1]?.trim() || name.trim();
}

function getConfigitParts(name: string): {
  title: string;
  itemId?: string;
} {
  const match = name.trim().match(/^(.*)_([A-Za-z0-9]+)$/);

  if (!match) {
    return { title: name.trim() };
  }

  return {
    title: match[1].trim(),
    itemId: match[2],
  };
}

function getWindchillItemId(id: string): string | undefined {
  const match = id.trim().match(/-([A-Za-z0-9]+)$/);
  return match?.[1];
}

function getRowPresentation(data: TreeNodeData): RowPresentation {
  const quantity = getAttribute(data.attributes, ["Qty", "Quantity"]);
  const teamcenterItemId = getAttribute(data.attributes, ["Item ID"]);

  if (teamcenterItemId) {
    return {
      title: cleanTeamcenterTitle(data.name),
      itemId: teamcenterItemId,
      quantity,
    };
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
    return {
      title: configit.title,
      itemId: configit.itemId,
      quantity,
    };
  }

  return {
    title: data.name,
    itemId: getWindchillItemId(data.id),
    quantity,
  };
}

function getSearchText(data: TreeNodeData): string {
  const presentation = getRowPresentation(data);

  return [
    presentation.title,
    presentation.itemId,
    presentation.quantity,
    data.name,
    ...Object.entries(data.attributes ?? {}).flatMap(([key, value]) => [
      key,
      String(value),
    ]),
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
  const queue: Array<{ node: TreeNodeData; level: number }> = [
    { node: root, level: 1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    total += 1;
    depth = Math.max(depth, current.level);

    const children = current.node.children ?? [];

    if (children.length > 0) {
      assemblies += 1;
      queue.push(
        ...children.map((child) => ({
          node: child,
          level: current.level + 1,
        }))
      );
    } else {
      leaves += 1;
    }
  }

  return { total, assemblies, leaves, depth };
}

function TreeRow({
  node,
  style,
  dragHandle,
  isVisible,
  isSelected,
  onSelectNode,
}: NodeRendererProps<TreeNodeData> & {
  isVisible: boolean;
  isSelected: boolean;
  onSelectNode: (node: TreeNodeData) => void;
}) {
  const hasChildren = !node.isLeaf;
  const presentation = getRowPresentation(node.data);
  const subtitleParts: string[] = [];

  if (presentation.itemId) {
    subtitleParts.push(`Item ID: ${presentation.itemId}`);
  }

  if (presentation.quantity) {
    subtitleParts.push(`Quantity: ${presentation.quantity}`);
  }

  const handleSelect = () => {
    onSelectNode(node.data);
  };

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (hasChildren) {
      node.toggle();
    }
  };

  return (
    <motion.div
      style={style}
      ref={dragHandle}
      initial={{ opacity: 0, y: 6 }}
      animate={
        isVisible
          ? { opacity: 1, y: 0 }
          : { opacity: 0, y: 6 }
      }
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="group flex items-center pr-2"
    >
      <motion.div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSelect();
          }
        }}
        onDoubleClick={() => {
          if (hasChildren) {
            node.toggle();
          }
        }}
        whileHover={{ x: 3 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className={[
          "relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-cyan-400/50",
          isSelected
            ? "bg-cyan-400/[0.09]"
            : "hover:bg-slate-800/65",
        ].join(" ")}
      >
        <span
          className={[
            "absolute inset-y-2 left-0 w-px rounded-full transition-colors duration-200",
            isSelected
              ? "bg-cyan-300"
              : "bg-transparent group-hover:bg-cyan-400/70",
          ].join(" ")}
        />

        <button
          type="button"
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
          onClick={handleToggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-all duration-200 hover:bg-slate-700/70 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        >
          {hasChildren ? (
            <motion.span
              initial={false}
              animate={{ rotate: node.isOpen ? 90 : 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-3.5 w-3.5 text-slate-600 transition-colors group-hover:text-slate-400" />
          )}
        </button>

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.07] text-cyan-300 ring-1 ring-inset ring-cyan-400/10 transition-all duration-200 group-hover:bg-cyan-400/10 group-hover:ring-cyan-400/20">
          <IconPackage className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-5 text-slate-100 transition-colors duration-200 group-hover:text-white">
            {presentation.title}
          </div>

          {subtitleParts.length > 0 ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-[11px] leading-4 text-slate-500">
              {subtitleParts.map((part, index) => (
                <span key={part} className="flex min-w-0 items-center gap-2">
                  {index > 0 ? (
                    <span className="h-1 w-1 shrink-0 rounded-full bg-slate-700" />
                  ) : null}
                  <span className="truncate">{part}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] leading-4 text-slate-600">
              BOM line
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function flattenLevels(root: TreeNodeData): {
  levels: TreeNodeData[][];
  ids: Set<string>;
} {
  const levels: TreeNodeData[][] = [];
  const ids = new Set<string>();
  let queue: TreeNodeData[] = [root];

  while (queue.length > 0) {
    levels.push(queue);
    const next: TreeNodeData[] = [];

    for (const node of queue) {
      ids.add(node.id);

      if (Array.isArray(node.children) && node.children.length > 0) {
        next.push(...node.children);
      }
    }

    queue = next;
  }

  return { levels, ids };
}

function computeVisibleIds(
  animation: ReturnType<typeof flattenLevels> | null
): Set<string> {
  if (!animation) {
    return new Set<string>();
  }

  return new Set(animation.ids);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return null;
}

function getBackendStatus(payload: unknown): string {
  const record = asRecord(payload);

  return typeof record?.status === "string"
    ? record.status.trim().toLowerCase()
    : "";
}

function getBackendMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = asRecord(payload);

  if (typeof record?.error === "string" && record.error.trim()) {
    return record.error;
  }

  if (typeof record?.message === "string" && record.message.trim()) {
    return record.message;
  }

  return "Failed to load BOM";
}

function isInProgressResponse(payload: unknown): boolean {
  const status = getBackendStatus(payload);

  return (
    status === "in_progress" ||
    status === "in progress" ||
    status === "processing" ||
    status === "pending" ||
    status === "accepted" ||
    status === "running"
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
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNode, setSelectedNode] = useState<TreeNodeData | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const treeRef = useRef<TreeApi<TreeNodeData> | null>(null);

  useEffect(() => {
    if (!active) {
      const resetTimer = window.setTimeout(() => {
        setBom(null);
        setStatus("idle");
        setError(null);
        setSearchTerm("");
        setSelectedNode(null);
        setIsExpanded(false);
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    if (payloadOverride !== undefined && payloadOverride !== null) {
      const payloadTimer = window.setTimeout(() => {
        setStatus("loading");
        setError(null);

        try {
          const root = transformPayload(payloadOverride);

          if (!root) {
            throw new Error(
              "The extraction JSON is unavailable or malformed."
            );
          }

          setBom(root);
          setSelectedNode(null);
          setStatus("ready");
          setError(null);
          onLoadComplete?.("ready");
        } catch (transformError) {
          const message =
            transformError instanceof Error
              ? transformError.message
              : "Failed to transform the BOM payload.";

          console.warn("[SourceBomPanel] payload transformation failed", {
            title,
            errorMessage: message,
          });

          setBom(null);
          setStatus("error");
          setError(message);
          onLoadComplete?.("error");
        }
      }, 0);

      return () => {
        window.clearTimeout(payloadTimer);
      };
    }

    if (!endpoint) {
      const emptyEndpointTimer = window.setTimeout(() => {
        setBom(null);
        setStatus("idle");
        setError(null);
      }, 0);

      return () => {
        window.clearTimeout(emptyEndpointTimer);
      };
    }

    let cancelled = false;
    let pollTimer: number | undefined;

    const scheduleNextPoll = () => {
      if (cancelled) {
        return;
      }

      pollTimer = window.setTimeout(() => {
        void fetchBom();
      }, BOM_POLL_INTERVAL_MS);
    };

    const fetchBom = async (): Promise<void> => {
      if (cancelled) {
        return;
      }

      setStatus("loading");
      setError(null);

      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
        });

        const bodyText = await response.text();
        let payload: unknown = null;

        if (bodyText) {
          try {
            payload = JSON.parse(bodyText);
          } catch {
            payload = bodyText;
          }
        }

        if (!response.ok && isInProgressResponse(payload)) {
          scheduleNextPoll();
          return;
        }

        if (!response.ok) {
          throw new Error(getBackendMessage(payload));
        }

        const backendStatus = getBackendStatus(payload);

        if (
          backendStatus === "error" ||
          backendStatus === "failed" ||
          backendStatus === "failure"
        ) {
          throw new Error(getBackendMessage(payload));
        }

        const root = transformPayload(payload);

        if (!root) {
          scheduleNextPoll();
          return;
        }

        if (cancelled) {
          return;
        }

        setBom(root);
        setSelectedNode(null);
        setStatus("ready");
        setError(null);
        onLoadComplete?.("ready");
      } catch (fetchError) {
        if (cancelled) {
          return;
        }

        const message =
          fetchError instanceof Error
            ? fetchError.message
            : String(fetchError);

        console.warn("[SourceBomPanel] backend BOM request failed", {
          title,
          endpoint,
          errorMessage: message,
        });

        setBom(null);
        setStatus("error");
        setError(message);
        onLoadComplete?.("error");
      }
    };

    void fetchBom();

    return () => {
      cancelled = true;

      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [
    active,
    endpoint,
    onLoadComplete,
    payloadOverride,
    refreshSignal,
    transformPayload,
    title,
  ]);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isExpanded]);

  const treeData = useMemo<TreeNodeData[]>(
    () => (bom ? [bom] : []),
    [bom]
  );

  const animation = useMemo(
    () => (bom ? flattenLevels(bom) : null),
    [bom]
  );

  const visibleIds = useMemo(
    () => computeVisibleIds(animation),
    [animation]
  );

  const metrics = useMemo(
    () => (bom ? calculateMetrics(bom) : null),
    [bom]
  );

  const selectedPresentation = useMemo(
    () => (selectedNode ? getRowPresentation(selectedNode) : null),
    [selectedNode]
  );

  const resolvedStatus = active ? status : "idle";
  const resolvedBom = active ? bom : null;

  const treeHeight = isExpanded
    ? Math.max(520, typeof window !== "undefined" ? window.innerHeight - 255 : 620)
    : 520;

  const panel = (
    <section
      className={[
        "relative flex h-full min-h-0 flex-col overflow-hidden border border-slate-700/70 bg-slate-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        isExpanded
          ? "fixed inset-4 z-[100] rounded-[28px] shadow-2xl shadow-black/60 sm:inset-6"
          : "rounded-[24px]",
      ].join(" ")}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800/70 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Extracted BOM structure
          </p>
        </div>

        <motion.span
          layout
          className={[
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
            resolvedStatus === "ready"
              ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300"
              : resolvedStatus === "error"
                ? "border-rose-400/25 bg-rose-400/[0.08] text-rose-300"
                : resolvedStatus === "loading"
                  ? "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-300"
                  : "border-slate-700 bg-slate-800/50 text-slate-500",
          ].join(" ")}
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              resolvedStatus === "ready"
                ? "bg-emerald-300"
                : resolvedStatus === "error"
                  ? "bg-rose-300"
                  : resolvedStatus === "loading"
                    ? "animate-pulse bg-cyan-300"
                    : "bg-slate-600",
            ].join(" ")}
          />
          {resolvedStatus === "loading"
            ? "Processing"
            : resolvedStatus === "ready"
              ? "Ready"
              : resolvedStatus === "error"
                ? "Error"
                : "Idle"}
        </motion.span>
      </div>

      {resolvedStatus === "ready" && resolvedBom && metrics ? (
        <>
          <div className="shrink-0 border-b border-slate-800/70 bg-slate-950/60 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative min-w-0 flex-1 xl:max-w-md">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search name, item ID, or quantity"
                  className="h-10 w-full rounded-xl border border-slate-700/75 bg-slate-900/75 pl-9 pr-9 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/55 focus:ring-2 focus:ring-cyan-400/10"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear BOM search"
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
                  >
                    <IconX className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => treeRef.current?.openAll()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
                >
                  <IconChevronsDown className="h-4 w-4" />
                  Expand all
                </button>

                <button
                  type="button"
                  onClick={() => treeRef.current?.closeAll()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
                >
                  <IconChevronsUp className="h-4 w-4" />
                  Collapse all
                </button>

                <button
                  type="button"
                  onClick={() => setIsExpanded((current) => !current)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-3 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-400/10"
                >
                  {isExpanded ? (
                    <IconX className="h-4 w-4" />
                  ) : (
                    <IconArrowsMaximize className="h-4 w-4" />
                  )}
                  {isExpanded ? "Close workspace" : "Full screen"}
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
              <span>
                <strong className="font-semibold text-slate-300">{metrics.total}</strong>{" "}
                items
              </span>
              <span>
                <strong className="font-semibold text-slate-300">{metrics.assemblies}</strong>{" "}
                assemblies
              </span>
              <span>
                <strong className="font-semibold text-slate-300">{metrics.leaves}</strong>{" "}
                leaf parts
              </span>
              <span>
                <strong className="font-semibold text-slate-300">{metrics.depth}</strong>{" "}
                levels
              </span>
              {searchTerm ? (
                <span className="text-cyan-300">Filtered results</span>
              ) : null}
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 overflow-hidden bg-slate-950/20">
            <div
              className={[
                "min-w-0 flex-1 px-3 py-3 transition-[padding] duration-300",
                selectedNode && isExpanded ? "pr-[340px]" : "",
              ].join(" ")}
            >
              <Tree<TreeNodeData>
                ref={treeRef}
                data={treeData}
                openByDefault={false}
                width="100%"
                height={treeHeight}
                rowHeight={TREE_ROW_HEIGHT}
                indent={26}
                overscanCount={8}
                paddingTop={6}
                paddingBottom={18}
                searchTerm={searchTerm}
                searchMatch={(node, term) =>
                  getSearchText(node.data).includes(term.trim().toLowerCase())
                }
              >
                {(rowProps) => (
                  <TreeRow
                    {...rowProps}
                    isVisible={
                      visibleIds.has(rowProps.node.data.id) ||
                      rowProps.node.isRoot
                    }
                    isSelected={selectedNode?.id === rowProps.node.data.id}
                    onSelectNode={setSelectedNode}
                  />
                )}
              </Tree>
            </div>

            <AnimatePresence>
              {selectedNode ? (
                <motion.aside
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className={[
                    "absolute bottom-3 right-3 top-3 z-10 w-[min(320px,calc(100%-24px))] overflow-auto rounded-2xl border border-slate-700/75 bg-slate-900/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl",
                    isExpanded ? "" : "sm:w-[300px]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-300 ring-1 ring-inset ring-cyan-400/15">
                        <IconListDetails className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                          BOM line details
                        </p>
                        <h4 className="mt-1 truncate text-sm font-semibold text-white">
                          {selectedPresentation?.title}
                        </h4>
                      </div>
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

                  <div className="mt-5 space-y-4">
                    {selectedPresentation?.itemId ? (
                      <DetailItem
                        label="Item ID"
                        value={selectedPresentation.itemId}
                      />
                    ) : null}
                    {selectedPresentation?.quantity ? (
                      <DetailItem
                        label="Quantity"
                        value={selectedPresentation.quantity}
                      />
                    ) : null}
                    {Object.entries(selectedNode.attributes ?? {})
                      .filter(
                        ([key]) =>
                          key !== "Item ID" &&
                          key !== "Product ID" &&
                          key !== "Qty" &&
                          key !== "Quantity"
                      )
                      .map(([key, value]) => (
                        <DetailItem
                          key={key}
                          label={key}
                          value={String(value)}
                        />
                      ))}
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      <IconHierarchy className="h-3.5 w-3.5" />
                      Structure
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {selectedNode.children?.length
                        ? `${selectedNode.children.length} direct child${
                            selectedNode.children.length === 1 ? "" : "ren"
                          }`
                        : "Leaf component"}
                    </p>
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <LoadingOrEmptyState
          status={resolvedStatus}
          error={error}
          loadingLabel={loadingLabel}
        />
      )}
    </section>
  );

  return (
    <>
      {isExpanded ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setIsExpanded(false)}
        />
      ) : null}
      {panel}
    </>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-slate-200">{value}</p>
    </div>
  );
}

function LoadingOrEmptyState({
  status,
  error,
  loadingLabel,
}: {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  loadingLabel: string;
}) {
  return (
    <div className="flex h-[58vh] min-h-[430px] items-center justify-center bg-slate-950/20 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="max-w-sm text-center"
      >
        <motion.div
          animate={status === "loading" ? { y: [0, -4, 0] } : { y: 0 }}
          transition={
            status === "loading"
              ? {
                  duration: 1.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              : undefined
          }
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-500 ring-1 ring-inset ring-slate-700/60"
        >
          <IconPackage className="h-5 w-5" />
        </motion.div>

        <div className="mt-4 text-sm font-medium text-slate-200">
          {status === "loading"
            ? "Preparing BOM preview"
            : status === "error"
              ? "BOM preview unavailable"
              : "Waiting for extraction"}
        </div>

        <div className="mt-1.5 text-xs leading-5 text-slate-500">
          {status === "loading"
            ? loadingLabel
            : status === "error"
              ? error
              : "The extracted structure will appear here as soon as it is available."}
        </div>

        {status === "loading" ? (
          <div className="mx-auto mt-5 h-1 w-32 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full w-1/3 rounded-full bg-cyan-400"
              animate={{ x: ["-100%", "300%"] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
