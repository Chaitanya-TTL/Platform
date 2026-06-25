"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Tree from "react-d3-tree";
import type { RawNodeDatum } from "react-d3-tree";

interface BomViewerProps {
  jobId: string;
}

type TreeNodeDatum = RawNodeDatum & {
  animationDelay?: number;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNodeDatum[];
};

function getBomRoot(payload: any) {
  if (!payload) return null;

  if (payload.bomRoot) {
    return payload.bomRoot;
  }

  if (payload.itemId || payload.name || payload.children) {
    return payload;
  }

  return null;
}

function transformBomToTreeData(node: any): TreeNodeDatum {
  const attributes: Record<string, string | number | boolean> = {};

  if (node.itemId) attributes["Item ID"] = node.itemId;
  if (node.sequence) attributes["Sequence"] = node.sequence;
  if (node.variantState) attributes["Variant State"] = node.variantState;
  if (node.revId) attributes["Rev ID"] = node.revId;
  if (node.qty) attributes["Qty"] = node.qty;
  if (node.variantCondition) attributes["Variant Condition"] = node.variantCondition;

  return {
    name: node.name || node.itemId || "Unnamed node",
    attributes,
    children: Array.isArray(node.children)
      ? node.children.map((child: any) => transformBomToTreeData(child))
      : [],
  };
}

function annotateAnimationDelays(root: TreeNodeDatum) {
  const queue: TreeNodeDatum[] = [root];
  let index = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    current.animationDelay = index * 0.08;
    index += 1;

    if (current.children?.length) {
      queue.push(...current.children);
    }
  }

  return root;
}

function renderCustomNodeElement({ nodeDatum, toggleNode }: any) {
  const datum = nodeDatum as TreeNodeDatum;
  const hasChildren = Boolean(datum.children?.length);

  return (
    <g>
      <circle
        r={hasChildren ? 12 : 8}
        fill={hasChildren ? "#34d399" : "#60a5fa"}
        stroke="#020617"
        strokeWidth="2"
      />
      <foreignObject x="-140" y="16" width="280" height="92">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, delay: (datum.animationDelay ?? 0) * 0.1 }}
          className="rounded-xl border border-emerald-400/20 bg-slate-800/95 px-3 py-2 shadow-xl backdrop-blur"
          onClick={() => hasChildren && toggleNode?.()}
          style={{ cursor: hasChildren ? "pointer" : "default" }}
        >
          <div className="text-sm font-semibold text-white">{datum.name}</div>
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
            {Object.entries(datum.attributes ?? {}).slice(0, 3).map(([key, value]) => (
              <div key={key}>
                <span className="text-slate-500">{key}:</span> {String(value)}
              </div>
            ))}
          </div>
        </motion.div>
      </foreignObject>
    </g>
  );
}

export function BomViewer({ jobId }: BomViewerProps) {
  const [bom, setBom] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      setError("Waiting for pipeline to start...");
      return;
    }

    const fetchBom = async () => {
      try {
        const response = await fetch("/api/bom", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Extraction file not available yet");
        }

        const payload = await response.json();
        const root = getBomRoot(payload);

        if (root) {
          setBom(root);
          setError(null);
        } else {
          setError("The extraction JSON is empty or unreadable.");
        }
      } catch (err) {
        console.error("Failed to fetch BOM:", err);
        setError(err instanceof Error ? err.message : "Failed to load BOM");
      } finally {
        setLoading(false);
      }
    };

    const interval = window.setInterval(fetchBom, 1500);
    fetchBom();

    return () => window.clearInterval(interval);
  }, [jobId]);

  const treeData = useMemo(() => {
    if (!bom) return null;
    const root = transformBomToTreeData(bom);
    return annotateAnimationDelays(root);
  }, [bom]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const response = await fetch("/api/bom", { cache: "no-store" });
      if (!response.ok) throw new Error("Extraction file not available yet");
      const payload = await response.json();
      const root = getBomRoot(payload);
      if (root) {
        setBom(root);
        setError(null);
      } else {
        setError("The extraction JSON is empty or unreadable.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load BOM");
    } finally {
      setRetrying(false);
    }
  };

  if (loading && !bom) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 h-12 w-12 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500" />
        <p className="font-semibold text-emerald-300">Preparing BOM view...</p>
        <p className="mt-1 text-sm text-slate-400">Waiting for the extraction JSON to become available.</p>
      </div>
    );
  }

  if (error || !treeData) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700/50">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-slate-400">{error || "No BOM structure available yet"}</p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {retrying ? "Retrying..." : "Refresh"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            Live BOM stream
          </span>
          <span className="text-xs text-slate-400">Rendered from the TeamCenter extraction JSON</span>
        </div>

        <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/50 p-3">
          <Tree
            data={treeData}
            renderCustomNodeElement={renderCustomNodeElement}
            pathFunc="step"
            orientation="vertical"
            separation={{ siblings: 1.75, nonSiblings: 2.2 }}
            translate={{ x: 320, y: 60 }}
            initialDepth={0}
            collapsible={false}
            zoom={0.9}
          />
        </div>
      </div>
    </div>
  );
}
