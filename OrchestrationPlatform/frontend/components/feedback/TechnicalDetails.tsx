"use client";
import { useState } from "react";
import { IconChevronDown, IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";

export function TechnicalDetails({ details }: { details?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!details?.trim()) return null;
  return (
    <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300">
        Technical details
        <IconChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-start justify-between gap-3">
            <pre className="max-h-40 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-500">{details}</pre>
            <button type="button" aria-label="Copy technical details" onClick={() => void navigator.clipboard.writeText(details).then(() => toast.success("Technical details copied"))} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800">
              <IconCopy className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
