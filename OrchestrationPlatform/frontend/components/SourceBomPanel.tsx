"use client";

import { useEffect, useMemo, useState } from "react";
import { Tree, getTreeLinePrefix, type NodeRendererProps } from "react-arborist";
import { motion } from "motion/react";
import { IconChevronRight, IconCircleDashed, IconCircleCheck } from "@tabler/icons-react";

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
  refreshSignal?: number;
  loadingLabel?: string;
  emptyLabel?: string;
};

function TreeRow({ node, style, dragHandle, isVisible }: NodeRendererProps<TreeNodeData> & { isVisible: boolean }) {
  const hasChildren = !node.isLeaf;

  return (
    <motion.div
      style={style}
      ref={dragHandle}
      initial={{ opacity: 0, y: 6 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
      className="flex items-center"
    >
      <div className="group flex w-full items-center gap-3 rounded-3xl border border-slate-700/70 bg-slate-900/80 px-4 py-3 shadow-xl shadow-slate-950/20 transition hover:border-cyan-500/50">
        <span className="font-mono text-[11px] text-slate-500" style={{ width: 62, display: "inline-block" }}>
          {getTreeLinePrefix(node)}
        </span>
        <button
          type="button"
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
          onClick={() => hasChildren && node.toggle()}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700/80 bg-slate-800 text-slate-300 transition hover:border-cyan-400 hover:text-white"
        >
          {hasChildren ? (
            <motion.span initial={false} animate={{ rotate: node.isOpen ? 90 : 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
              <IconChevronRight className="h-4 w-4" />
            </motion.span>
          ) : (
            <IconCircleDashed className="h-4 w-4 text-slate-500" />
          )}
        </button>
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

function computeVisibleIds(anim: { levels: TreeNodeData[][]; ids: Set<string> } | null, levelLimit: number) {
  if (!anim) return new Set<string>();
  const visible = new Set<string>();
  for (let level = 0; level <= levelLimit; level += 1) {
    for (const node of anim.levels[level] ?? []) {
      visible.add(node.id);
    }
  }
  return visible;
}

export function SourceBomPanel({
  title,
  subtitle,
  endpoint,
  transformPayload,
  active,
  refreshSignal,
  loadingLabel = "Fetching BOM structure...",
  emptyLabel = "No BOM available yet.",
}: SourceBomPanelProps) {
  const [bom, setBom] = useState<TreeNodeData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    const fetchBom = async () => {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`No BOM found yet`);
        }
        const json = await response.json();
        const root = transformPayload(json);
        if (!root) {
          throw new Error("The extraction JSON is unavailable or malformed.");
        }
        setBom(root);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load BOM");
        setStatus("error");
        setBom(null);
      }
    };

    fetchBom();
  }, [active, endpoint, refreshSignal, transformPayload]);

  const treeData = useMemo(() => (bom ? [bom] : []), [bom]);
  const anim = useMemo(() => (bom ? flattenLevels(bom) : null), [bom]);
  const visibleIds = useMemo(() => computeVisibleIds(anim, 2), [anim]);

  return (
    <div className="rounded-[28px] border border-slate-700/80 bg-slate-950/80 p-5 shadow-2xl shadow-slate-950/20">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-400">{title}</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">{subtitle}</h3>
        </div>
        <div className="rounded-2xl bg-slate-900/90 px-3 py-2 text-xs text-slate-300 ring-1 ring-slate-700/90">
          {status === "loading" ? "Loading" : status === "ready" ? "Ready" : status === "error" ? "Error" : "Idle"}
        </div>
      </div>

      <div className="mb-4 rounded-3xl border border-slate-800/70 bg-slate-900/80 p-4 text-sm text-slate-300">
        {status === "loading" ? loadingLabel : status === "error" ? error : emptyLabel}
      </div>

      {status === "ready" && bom ? (
        <div className="h-[56vh] min-h-90 overflow-auto rounded-3xl border border-slate-800/60 bg-slate-950/70 p-3">
          <Tree
            data={treeData}
            width="100%"
            height={Math.max(360, treeData.length * 60)}
            rowHeight={56}
            indent={22}
            overscanCount={3}
            paddingTop={16}
            paddingBottom={16}
            openByDefault={false}
          >
            {(rowProps) => (
              <TreeRow {...rowProps} isVisible={visibleIds.has(rowProps.node.data.id)} />
            )}
          </Tree>
        </div>
      ) : (
        <div className="flex min-h-90 items-center justify-center rounded-3xl border border-dashed border-slate-700/70 bg-slate-900/60 px-6 py-12 text-center text-slate-500">
          <div>
            <p className="text-lg font-semibold text-slate-100">{status === "loading" ? "Preparing BOM preview…" : "Waiting for extraction"}</p>
            <p className="mt-3 text-sm text-slate-400">Once the extraction completes, the JSON will render as a collapsible BOM tree.</p>
          </div>
        </div>
      )}
    </div>
  );
}
