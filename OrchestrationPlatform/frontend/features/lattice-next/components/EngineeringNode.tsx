"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { IconChevronDown, IconChevronRight, IconCube, IconStack2 } from "@tabler/icons-react";
import type { LatticeFlowNode } from "../canvas/lattice-flow-types";

function EngineeringNodeComponent({ data }: NodeProps<LatticeFlowNode>) {
  const Icon = data.entityKind === "assembly" ? IconStack2 : IconCube;
  return (
    <article
      aria-label={`${data.entityKind ?? data.category} ${data.label}, source ${data.source}, ${data.hasChildren ? (data.expanded ? "expanded" : "collapsed") : "leaf"}`}
      className={`group relative w-64 rounded-xl border bg-slate-950/95 p-3 text-slate-100 shadow-xl transition ${data.selected ? "border-cyan-400 ring-2 ring-cyan-400/20" : "border-slate-700 focus-within:border-slate-500"}`}
    >
      <Handle id="in" type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-slate-950 !bg-slate-400" />
      <Handle id="out" type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-slate-950 !bg-cyan-400" />
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg border border-slate-700 bg-slate-900 p-2 text-cyan-300"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{data.label}</p>
          <p className="mt-1 truncate text-[10px] uppercase tracking-wide text-slate-500">{data.subtitle}</p>
        </div>
        {data.hasChildren ? (
          <button
            type="button"
            data-expand-node={data.id}
            aria-label={`${data.expanded ? "Collapse" : "Expand"} ${data.label}`}
            aria-expanded={data.expanded}
            className="nodrag nopan rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"
          >
            {data.expanded ? <IconChevronDown className="h-4 w-4" /> : <IconChevronRight className="h-4 w-4" />}
            <span className="sr-only">{data.hiddenChildren} hidden children</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}

export const EngineeringNode = memo(EngineeringNodeComponent);


