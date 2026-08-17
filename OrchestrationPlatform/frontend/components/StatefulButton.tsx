"use client";
import { Button } from "./ui/stateful-button";
export function StatefulButtonDemo({ isLoading = false, disabled = false, idleLabel = "Extract BOM", loadingLabel = "Running" }: { isLoading?: boolean; disabled?: boolean; idleLabel?: string; loadingLabel?: string }) {
  return <Button type="submit" loading={isLoading} disabled={disabled} className="extract-bom-button min-w-[118px] shrink-0 rounded-none border-l border-cyan-300 bg-cyan-50 px-4 py-3 text-xs font-semibold text-cyan-900 dark:border-cyan-400/30 dark:bg-cyan-500/15 dark:text-cyan-50">{isLoading ? loadingLabel : idleLabel}</Button>;
}
