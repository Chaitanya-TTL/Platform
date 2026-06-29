/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Tree, getTreeLinePrefix, type NodeRendererProps } from "react-arborist";

interface BomViewerProps {
  jobId?: string;
  title?: string;
  description?: string;
  endpoint?: string;
  transformPayload?: (payload: any) => TreeNodeData | null;
  emptyMessage?: string;
  polling?: boolean;
}

type TreeNodeData = {
  id: string;
  name: string;
  attributes?: Record<string, string | number | boolean>;
  children?: TreeNodeData[];
};

function getTeamcenterRoot(payload: any): TreeNodeData | null {
  if (!payload) return null;

  const payloadRoot = payload.bomRoot ?? payload.bomStructure?.bomRoot ?? payload.root ?? null;
  if (payloadRoot) {
    return transformTeamcenterNode(payloadRoot, "teamcenter-root");
  }

  if (payload.itemId || payload.name || payload.children) {
    return transformTeamcenterNode(payload, "teamcenter-root");
  }

  return null;
}

function transformTeamcenterNode(node: any, fallbackId: string): TreeNodeData {
  const attributes: Record<string, string | number | boolean> = {};

  if (node.itemId) attributes["Item ID"] = node.itemId;
  if (node.sequence) attributes["Sequence"] = node.sequence;
  if (node.variantState) attributes["Variant State"] = node.variantState;
  if (node.revId) attributes["Rev ID"] = node.revId;
  if (node.qty) attributes["Qty"] = node.qty;
  if (node.variantCondition) attributes["Variant Condition"] = node.variantCondition;

  return {
    id: node.id ?? node.itemId ?? fallbackId,
    name: node.name || node.itemId || "Unnamed node",
    attributes,
    children: Array.isArray(node.children)
      ? node.children.map((child: any, index: number) => transformTeamcenterNode(child, `${fallbackId}-${index}`))
      : [],
  };
}

function getConfigitRoot(payload: any): TreeNodeData | null {
  if (!payload || !Array.isArray(payload.content)) {
    return null;
  }

  const families = payload.content;
  if (!families.length) return null;

  return {
    id: "configit-root",
    name: payload.productModel ? `Product Model ${payload.productModel}` : "Configit BOM",
    attributes: payload.workItem ? { "Work Item": payload.workItem } : {},
    children: families.map((family: any, index: number) => ({
      id: family.code ? `family-${family.code}` : `family-${index}`,
      name: family.description || family.code || `Family ${index + 1}`,
      attributes: {
        Code: family.code || "",
        "Family Type": family.familyType || "",
        Labels: Array.isArray(family.labels) ? family.labels.join(", ") : "",
      },
      children: Array.isArray(family.features)
        ? family.features.map((feature: any, featureIndex: number) => ({
            id: feature.code ? `feature-${feature.code}` : `feature-${index}-${featureIndex}`,
            name: feature.description || feature.code || `Feature ${featureIndex + 1}`,
            attributes: feature.code ? { Code: feature.code } : {},
          }))
        : [],
    })),
  };
}

function TreeNode({ node, style, dragHandle }: NodeRendererProps<TreeNodeData>) {
  const hasChildren = !node.isLeaf;

  return (
    <div style={style} ref={dragHandle} className="flex items-center">
      {/* Dedicated gutter for tree connectors (Teamcenter-like alignment) */}
      <div className="flex w-full items-center">
        <div
          className="flex items-center font-mono text-[11px] leading-none text-slate-500"
          style={{ width: 70 }}
        >
          {getTreeLinePrefix(node)}
        </div>

        {/* Icon-only toggle (no rounded container padding that shifts gutter) */}
        <button
          type="button"
          aria-label={hasChildren ? "Toggle children" : "Leaf node"}
          onClick={() => hasChildren && node.toggle()}
          className="ml-1 flex h-6 w-6 items-center justify-center text-slate-300 hover:text-white"
        >
          {hasChildren ? (node.isOpen ? "▾" : "▸") : "•"}
        </button>

        <div className="min-w-0 pl-3">
          <div className="truncate text-[13px] font-medium text-slate-100">{node.data.name}</div>
          {node.data.attributes && Object.keys(node.data.attributes).length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
              {Object.entries(node.data.attributes)
                .slice(0, 3)
                .map(([key, value]) => (
                  <span key={key} className="truncate">
                    <span className="text-slate-500">{key}:</span> {String(value)}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BomViewer({
  jobId,
  title = "BOM Structure",
  description = "Rendered from the extraction JSON",
  endpoint = "/api/bom",
  transformPayload = getTeamcenterRoot,
  emptyMessage = "No BOM structure available yet",
  polling = Boolean(jobId),
}: BomViewerProps) {
  const [payload, setPayload] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchBom = async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Extraction file not available yet");
        }

        const data = await response.json();
        if (!isMounted) return;

        const root = transformPayload(data);
        if (root) {
          setPayload(root);
          setError(null);
        } else {
          setPayload(null);
          setError("The extraction JSON is empty or unreadable.");
        }
      } catch (err) {
        console.error("Failed to fetch BOM:", err);
        if (!isMounted) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Failed to load BOM");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (jobId) {
      setLoading(true);
    }

    fetchBom();

    if (polling) {
      const interval = window.setInterval(fetchBom, 1500);
      return () => {
        isMounted = false;
        window.clearInterval(interval);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [endpoint, jobId, polling, transformPayload]);

  const treeData = useMemo(() => {
    if (!payload) return [];
    return [payload];
  }, [payload]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("Extraction file not available yet");
      const data = await response.json();
      const root = transformPayload(data);
      if (root) {
        setPayload(root);
        setError(null);
      } else {
        setPayload(null);
        setError("The extraction JSON is empty or unreadable.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load BOM");
    } finally {
      setRetrying(false);
    }
  };

  if (loading && !payload) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 h-12 w-12 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500" />
        <p className="font-semibold text-emerald-300">Preparing BOM view...</p>
        <p className="mt-1 text-sm text-slate-400">Waiting for the extraction JSON to become available.</p>
      </div>
    );
  }

  if (error || !treeData.length) {
    return (
      <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700/50">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-slate-400">{error || emptyMessage}</p>
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white">{title}</div>
            <div className="text-xs text-slate-400">{description}</div>
          </div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            Expandable hierarchy
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/50 p-3">
          <div className="mb-2 text-xs text-slate-400">
            Click the + or − icon beside a parent to expand and collapse levels, mirroring TeamCenter Structure Manager behaviour.
          </div>
          <div className="h-[60vh] min-h-105 overflow-auto rounded-lg border border-slate-800/70 bg-slate-900/70 p-2">
            <Tree
              data={treeData}
              openByDefault={false}
              width="100%"
              height={Math.max(420, treeData.length * 44 + treeData[0].children?.length ? treeData[0].children.length * 44 : 0)}
              rowHeight={44}
              indent={20}
              overscanCount={3}
              paddingTop={12}
              paddingBottom={12}
            >
              {TreeNode}
            </Tree>
          </div>
        </div>
      </div>
    </div>
  );
}
