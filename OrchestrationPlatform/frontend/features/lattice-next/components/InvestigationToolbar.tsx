"use client";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  IconAdjustmentsHorizontal,
  IconFocus2,
  IconLayoutDistributeHorizontal,
  IconPinnedOff,
  IconSearch,
  IconZoomReset,
  IconMaximize,
} from "@tabler/icons-react";
import type { RelationshipKind } from "../domain/model";
const meaningful = (source: string) =>
  !["platform", "unified"].includes(source.toLowerCase());
export function InvestigationToolbar({
  sources,
  activeSources,
  onSource,
  activeKinds,
  onKind,
  focused,
  onClearFocus,
  pinnedCount,
  onResetLayout,
  onResetSelected,
  canResetSelected,
}: {
  sources: string[];
  activeSources: ReadonlySet<string>;
  onSource: (v: string) => void;
  activeKinds: ReadonlySet<RelationshipKind>;
  onKind: (v: RelationshipKind) => void;
  focused: boolean;
  onClearFocus: () => void;
  pinnedCount: number;
  onResetLayout: () => void;
  onResetSelected: () => void;
  canResetSelected: boolean;
}) {
  const visible = sources.filter(meaningful);
  const focus = () => {
    if (focused) {
      onClearFocus();
      return;
    }
    document
      .querySelector<HTMLButtonElement>('[data-node-action="focus"]')
      ?.click();
  };
  const fit = () => window.dispatchEvent(new CustomEvent("lattice:fit-view"));
  const collapse = () =>
    window.dispatchEvent(new CustomEvent("lattice:collapse-all"));
  return (
    <LayoutGroup id="lattice-toolbar">
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="lattice-command-bar mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/85 p-2 text-xs"
      >
        {/* <div className="inline-flex items-center gap-1.5 px-1 text-slate-400">
          <IconSearch className="h-3.5 w-3.5" />
          <span>Investigate</span>
        </div> */}

        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          whileFocus={{ outline: "2px solid #94a3b8" }}
          onClick={collapse}
          className="lattice-command-control"
        >
          <IconAdjustmentsHorizontal className="h-3.5 w-3.5" />
          Collapse all
        </motion.button>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          whileFocus={{ outline: "2px solid #94a3b8" }}
          onClick={fit}
          className="lattice-command-control"
        >
          <IconZoomReset className="h-3.5 w-3.5" />
          Fit graph
        </motion.button>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          whileFocus={{ outline: "2px solid #94a3b8" }}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("lattice:toggle-workspace-fullscreen"),
            )
          }
          className="lattice-command-control"
        >
          <IconMaximize className="h-3.5 w-3.5" />
          Full screen
        </motion.button>
        <div className="ml-auto flex gap-2">
          {canResetSelected ? (
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              whileFocus={{ outline: "2px solid #94a3b8" }}
              onClick={onResetSelected}
              className="lattice-command-control"
            >
              <IconPinnedOff className="h-3.5 w-3.5" />
              Reset node
            </motion.button>
          ) : null}
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            whileFocus={{ outline: "2px solid #94a3b8" }}
            onClick={onResetLayout}
            disabled={!pinnedCount}
            className="lattice-command-control disabled:opacity-35"
          >
            <IconLayoutDistributeHorizontal className="h-3.5 w-3.5" />
            Reset layout{pinnedCount ? ` (${pinnedCount})` : ""}
          </motion.button>
        </div>
        {/* <details className="relative">
          <summary className="lattice-command-control cursor-pointer list-none">
            <IconAdjustmentsHorizontal className="h-3.5 w-3.5" />
            Relationships
          </summary>
          <div className="absolute right-0 top-9 z-40 grid min-w-48 gap-1 rounded-lg border border-slate-700 bg-slate-950 p-2 shadow-2xl">
            {[...activeKinds].map((kind) => (
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                whileFocus={{ outline: "2px solid #94a3b8" }}
                key={kind}
                onClick={() => onKind(kind)}
                className="rounded-md px-2 py-1.5 text-left capitalize text-slate-300 hover:bg-slate-800"
              >
                {kind.replaceAll("-", " ")}
              </motion.button>
            ))}
          </div>
        </details> */}
      </motion.div>
    </LayoutGroup>
  );
}
