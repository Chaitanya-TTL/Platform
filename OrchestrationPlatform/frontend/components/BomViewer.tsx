"use client";

import { useEffect, useState } from "react";
import { getBomStructure, BomNode } from "@/lib/api";

interface BomViewerProps {
  jobId: string;
}

function BomTreeNode({ node, level = 0 }: { node: BomNode; level: number }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="select-none animate-fadeIn">
      <div
        className="flex items-center space-x-2 py-2 px-3 hover:bg-emerald-600/30 rounded-lg cursor-pointer transition-all hover:translate-x-1"
        style={{ marginLeft: `${level * 1.5}rem` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          <button className={`w-5 h-5 flex items-center justify-center text-emerald-400 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}>
            ▶
          </button>
        ) : (
          <div className="w-5 h-5 flex items-center justify-center text-slate-500">
            ●
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-emerald-100 truncate">
            {node.name || node.itemId}
            {node.revId && (
              <span className="text-emerald-400/70 ml-1">
                (Rev: {node.revId})
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 truncate">
            ID: {node.itemId}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {node.qty && (
            <span className="text-xs font-bold bg-gradient-to-r from-blue-600 to-blue-500 text-white px-2.5 py-1 rounded-full border border-blue-400/50 shadow-lg">
              ⚙ Qty: {node.qty}
            </span>
          )}
          {node.variantState && (
            <span className="text-xs font-semibold bg-amber-600/50 text-amber-200 px-2 py-1 rounded border border-amber-500/50">
              {node.variantState}
            </span>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="border-l-2 border-emerald-600/30 ml-3">
          {node.children!.map((child, idx) => (
            <BomTreeNode key={`${level}-${idx}`} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function BomStats({ bom }: { bom: BomNode }) {
  const countNodes = (node: BomNode): number => {
    let count = 1;
    if (node.bomRootNode) {
      count += node.bomRootNode.reduce((sum, child) => sum + countNodes(child), 0);
    }
    return count;
  };

  const totalNodes = countNodes(bom);

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg p-3 text-white">
        <div className="text-xs text-emerald-200 font-semibold">Total Items</div>
        <div className="text-2xl font-bold">{totalNodes}</div>
      </div>
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-3 text-white">
        <div className="text-xs text-blue-200 font-semibold">Root Item</div>
        <div className="text-sm font-semibold truncate">{bom.itemId}</div>
      </div>
      <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg p-3 text-white">
        <div className="text-xs text-purple-200 font-semibold">Rev ID</div>
        <div className="text-sm font-semibold">{bom.revId || "N/A"}</div>
      </div>
    </div>
  );
}

export function BomViewer({ jobId }: BomViewerProps) {
  const [bom, setBom] = useState<BomNode | null>(null);
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
        const bomData = await getBomStructure(jobId);
        if (bomData) {
          setBom(bomData);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to fetch BOM:", err);
      } finally {
        setLoading(false);
      }
    };

    const interval = setInterval(fetchBom, 1500);
    fetchBom();

    return () => clearInterval(interval);
  }, [jobId]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const bomData = await getBomStructure(jobId);
      if (bomData) {
        setBom(bomData);
        setError(null);
      } else {
        setError("BOM data not yet available. Check pipeline status.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load BOM");
    } finally {
      setRetrying(false);
    }
  };

  if (loading && !bom) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3"></div>
        <p className="text-emerald-300 font-semibold">Extracting BOM structure...</p>
        <p className="text-slate-400 text-sm mt-1">Waiting for pipeline to complete</p>
      </div>
    );
  }

  if (error || !bom) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
        <div className="w-12 h-12 bg-slate-700/50 rounded-full flex items-center justify-center">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-slate-400">{error || "No BOM structure available yet"}</p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-50"
        >
          {retrying ? "Retrying..." : "Refresh"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BomStats bom={bom} />
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 max-h-96 overflow-y-auto font-mono text-sm custom-scrollbar">
        <div className="space-y-1">
          <BomTreeNode node={bom} />
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.3);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.4);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.6);
        }
      `}</style>
    </div>
  );
}
