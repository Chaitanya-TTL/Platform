"use client";

import { useEffect, useMemo, useState } from "react";
import { Tree, type NodeRendererProps } from "react-arborist";
import { motion } from "motion/react";
import {
  IconChevronRight,
  IconCircleDashed,
  IconPackage,
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

const BOM_POLL_INTERVAL_MS = 2000;

function TreeRow({
  node,
  style,
  dragHandle,
  isVisible,
}: NodeRendererProps<TreeNodeData> & {
  isVisible: boolean;
}) {
  const hasChildren = !node.isLeaf;

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
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex items-center"
    >
      <div className="group flex w-full items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2 shadow-sm shadow-slate-950/10">
        <button
          type="button"
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
          onClick={() => {
            if (hasChildren) {
              node.toggle();
            }
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700/70 bg-slate-900/40 text-slate-300 transition hover:border-cyan-400 hover:text-white"
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
            <IconCircleDashed className="h-4 w-4 text-slate-500" />
          )}
        </button>

        <IconPackage className="h-4 w-4 shrink-0 text-cyan-300" />

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-slate-100 group-hover:text-white">
            {node.data.name}
          </div>

          {node.data.attributes &&
            Object.keys(node.data.attributes).length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                {Object.entries(node.data.attributes)
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span key={key} className="whitespace-nowrap">
                      <span className="text-slate-500">{key}:</span>{" "}
                      {String(value)}
                    </span>
                  ))}
              </div>
            )}
        </div>
      </div>
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

  useEffect(() => {
    if (!active) {
      const resetTimer = window.setTimeout(() => {
        setBom(null);
        setStatus("idle");
        setError(null);
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
        console.info("[SourceBomPanel] fetching BOM from endpoint", {
          title,
          endpoint,
        });

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

        console.info("[SourceBomPanel] BOM endpoint response", {
          title,
          endpoint,
          status: response.status,
          ok: response.ok,
          payload,
        });

        if (!response.ok && isInProgressResponse(payload)) {
          scheduleNextPoll();
          return;
        }

        if (!response.ok) {
          throw new Error(getBackendMessage(payload));
        }

        const payloadRecord = asRecord(payload);
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
          const hasFinalBom = Boolean(payloadRecord?.finalBom);

          console.info(
            "[SourceBomPanel] final BOM is not available yet; polling will continue",
            {
              title,
              endpoint,
              backendStatus,
              hasFinalBom,
            }
          );

          scheduleNextPoll();
          return;
        }

        if (cancelled) {
          return;
        }

        console.info("[SourceBomPanel] BOM transformed successfully", {
          title,
          endpoint,
          root,
        });

        setBom(root);
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
          errorName:
            fetchError instanceof Error
              ? fetchError.name
              : "UnknownError",
          errorMessage: message,
          errorStack:
            fetchError instanceof Error
              ? fetchError.stack
              : undefined,
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

  const resolvedStatus = active ? status : "idle";
  const resolvedBom = active ? bom : null;

  return (
    <section className="rounded-[24px] border border-slate-700/70 bg-slate-950/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            {title}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Extracted BOM structure
          </p>
        </div>

        <span
          className={[
            "rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]",
            resolvedStatus === "ready"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : resolvedStatus === "error"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                : resolvedStatus === "loading"
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                  : "border-slate-600/60 bg-slate-800/70 text-slate-400",
          ].join(" ")}
        >
          {resolvedStatus === "loading"
            ? "Processing"
            : resolvedStatus === "ready"
              ? "Ready"
              : resolvedStatus === "error"
                ? "Error"
                : "Idle"}
        </span>
      </div>

      {resolvedStatus === "error" && error && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {resolvedStatus === "ready" && resolvedBom ? (
        <div className="h-[54vh] min-h-[380px] overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/60 p-2">
          <Tree<TreeNodeData>
            data={treeData}
            openByDefault={false}
            width="100%"
            height={420}
            rowHeight={54}
            indent={20}
            overscanCount={3}
            paddingTop={10}
            paddingBottom={10}
          >
            {(rowProps) => (
              <TreeRow
                {...rowProps}
                isVisible={
                  visibleIds.has(rowProps.node.data.id) ||
                  rowProps.node.isRoot
                }
              />
            )}
          </Tree>
        </div>
      ) : (
        <div className="flex h-[54vh] min-h-[380px] items-center justify-center rounded-xl border border-dashed border-slate-700/70 bg-slate-900/30">
          <div className="max-w-sm px-6 text-center">
            <IconPackage className="mx-auto h-9 w-9 text-slate-500" />

            <div className="mt-3 text-sm font-medium text-slate-200">
              {resolvedStatus === "loading"
                ? "Preparing BOM preview..."
                : resolvedStatus === "error"
                  ? "BOM preview unavailable"
                  : "Waiting for extraction"}
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-400">
              {resolvedStatus === "loading"
                ? loadingLabel
                : resolvedStatus === "error"
                  ? error
                  : "Once the extraction completes, the JSON will render as a collapsible BOM tree."}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
