"use client";

import { useEffect, useMemo, useState } from "react";
import { Tree, getTreeLinePrefix, type NodeRendererProps } from "react-arborist";
import { motion } from "motion/react";
import { IconChevronRight, IconCircleDashed, IconPackage, IconCircleDot } from "@tabler/icons-react";

type TreeNodeData = {
  id: string;
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNodeData[];
};

type SourceBomPanelProps = {
  title: string;
  subtitle: string;
  endpoint: string;
  transformPayload: (payload: unknown) => TreeNodeData | null;
  active: boolean;
  payloadOverride?: unknown;
  refreshSignal?: number;
  loadingLabel?: string;
  emptyLabel?: string;
  onLoadComplete?: (status: "ready" | "error") => void;
};

function TreeRow({ node, style, dragHandle, isVisible }: NodeRendererProps<TreeNodeData> & { isVisible: boolean }) {
  const hasChildren = !node.isLeaf;
  const icon = hasChildren ? <IconPackage className="h-4 w-4 text-cyan-300" /> : <IconCircleDot className="h-4 w-4 text-slate-400" />;

  return (
    <motion.div
      style={style}
      ref={dragHandle}
      initial={{ opacity: 0, y: 8 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="flex items-center"
    >
      <div className="group flex w-full items-center gap-3 rounded-3xl border border-slate-700/70 bg-slate-900/80 px-4 py-4 shadow-xl shadow-slate-950/20 transition hover:border-cyan-500/50">
        <span className="font-mono text-[11px] text-slate-500" style={{ width: 58, display: "inline-block" }}>
          {getTreeLinePrefix(node)}
        </span>
        <button
          type="button"
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
          onClick={() => hasChildren && node.toggle()}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/80 bg-slate-900 text-slate-300 transition hover:border-cyan-400 hover:text-white"
        >
          {hasChildren ? (
            <motion.span initial={false} animate={{ rotate: node.isOpen ? 90 : 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-4 w-4 text-slate-500" />
          )}
        </button>
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-slate-300">{icon}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100 group-hover:text-white">{node.data.name}</div>
            {node.data.attributes && Object.keys(node.data.attributes).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                {Object.entries(node.data.attributes)
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span key={key} className="whitespace-nowrap">
                      <span className="text-slate-500">{key}:</span> {String(value)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function flattenLevels(root: TreeNodeData): { levels: TreeNodeData[][]; ids: Set<string> } {
  const levels: TreeNodeData[][] = [];
  const ids = new Set<string>();
  let queue: TreeNodeData[] = [root];

  while (queue.length) {
    levels.push(queue);
    const next: TreeNodeData[] = [];
    for (const node of queue) {
      ids.add(node.id);
      if (Array.isArray(node.children) && node.children.length) {
        next.push(...node.children);
      }
    }
    queue = next;
  }

  return { levels, ids };
}

function computeVisibleIds(anim: { levels: TreeNodeData[][]; ids: Set<string> } | null) {
  if (!anim) return new Set<string>();
  return new Set(anim.ids);
}

export function SourceBomPanel({
  title,
  subtitle,
  endpoint,
  transformPayload,
  active,
  payloadOverride,
  refreshSignal,
  loadingLabel = "Fetching BOM structure...",
  emptyLabel = "No BOM available yet.",
  onLoadComplete,
}: SourceBomPanelProps) {
  const [bom, setBom] = useState<TreeNodeData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      const resetTimeout = window.setTimeout(() => {
        setBom(null);
        setStatus("idle");
        setError(null);
      }, 0);
      return () => window.clearTimeout(resetTimeout);
    }

    if (payloadOverride !== undefined && payloadOverride !== null) {
      const payloadTimeout = window.setTimeout(() => {
        console.info("[SourceBomPanel] using payload override", { title, payloadOverride });
        const root = transformPayload(payloadOverride);
        if (!root) {
          setBom(null);
          setStatus("error");
          setError("The extraction JSON is unavailable or malformed.");
          return;
        }
        setBom(root);
        setStatus("ready");
        setError(null);
      }, 0);
      return () => window.clearTimeout(payloadTimeout);
    }

    const fetchBom = async () => {
      setStatus("loading");
      setError(null);
      try {
        console.info("[SourceBomPanel] fetching BOM from endpoint", { title, endpoint });
        const response = await fetch(endpoint, { cache: "no-store" });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error((json as { error?: string } | null)?.error ?? `No BOM found yet`);
        }
        const root = transformPayload(json);
        if (!root) {
          throw new Error("The extraction JSON is unavailable or malformed.");
        }
        setBom(root);
        setStatus("ready");
        onLoadComplete?.("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load BOM");
        setStatus("error");
        setBom(null);
        onLoadComplete?.("error");
      }
    };

    void fetchBom();
  }, [active, endpoint, onLoadComplete, payloadOverride, refreshSignal, transformPayload, title]);

  const treeData = useMemo(() => (bom ? [bom] : []), [bom]);
  const anim = useMemo(() => (bom ? flattenLevels(bom) : null), [bom]);
  const visibleIds = useMemo(() => computeVisibleIds(anim), [anim]);
  const resolvedStatus = !active ? "idle" : status;
  const resolvedError = !active ? null : error;
  const resolvedBom = !active ? null : bom;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="rounded-[28px] border border-slate-700/70 bg-slate-950/80 p-5 shadow-[0_24px_80px_-32px_rgba(2,6,23,0.95)]"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-400">{title}</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">{subtitle}</h3>
        </div>
        <div className={`rounded-2xl px-3 py-2 text-xs font-semibold ${status === "ready" ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30" : status === "loading" ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-400/30" : status === "error" ? "bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/30" : "bg-slate-900/90 text-slate-300 ring-1 ring-slate-700/90"}`}>
          {resolvedStatus === "loading" ? "Loading" : resolvedStatus === "ready" ? "Ready" : resolvedStatus === "error" ? "Error" : "Idle"}
        </div>
      </div>

      <div className="mb-4 rounded-[22px] border border-slate-800/70 bg-slate-900/85 p-4 text-sm leading-7 text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        {resolvedStatus === "loading" ? loadingLabel : resolvedStatus === "error" ? resolvedError : emptyLabel}
      </div>

      {resolvedStatus === "ready" && resolvedBom ? (
        <div className="h-[60vh] min-h-90 overflow-auto rounded-[24px] border border-slate-800/60 bg-slate-950/70 p-4">
          <Tree
            data={treeData}
            width="100%"
            height={Math.max(420, treeData.length * 72)}
            rowHeight={72}
            indent={26}
            overscanCount={3}
            paddingTop={14}
            paddingBottom={14}
            openByDefault={false}
          >
            {(rowProps) => (
              <TreeRow {...rowProps} isVisible={visibleIds.has(rowProps.node.data.id)} />
            )}
          </Tree>
        </div>
      ) : (
        <div className="flex min-h-90 items-center justify-center rounded-[24px] border border-dashed border-slate-700/70 bg-slate-900/70 px-6 py-12 text-center text-slate-500">
          <div>
            <p className="text-lg font-semibold text-slate-100">{resolvedStatus === "loading" ? "Preparing BOM preview…" : "Waiting for extraction"}</p>
            <p className="mt-3 text-sm leading-7 text-slate-400">Once the extraction completes, the JSON will render as a collapsible BOM tree.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
