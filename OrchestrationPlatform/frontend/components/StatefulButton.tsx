"use client";
import { Button } from "./ui/stateful-button";
export function StatefulButtonDemo({ isLoading = false, disabled = false, idleLabel = "Retrieve", loadingLabel = "Running" }: { isLoading?: boolean; disabled?: boolean; idleLabel?: string; loadingLabel?: string }) {
  return <Button type="submit" loading={isLoading} disabled={disabled} className="min-w-[132px] shrink-0 rounded-lg bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800">{isLoading ? loadingLabel : idleLabel}</Button>;
}
