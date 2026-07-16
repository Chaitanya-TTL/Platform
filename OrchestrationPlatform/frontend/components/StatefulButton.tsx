"use client";
import { Button } from "./ui/stateful-button";
export function StatefulButtonDemo({
  isLoading = false,
  disabled = false,
}: {
  isLoading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      loading={isLoading}
      disabled={disabled}
      className="min-w-[112px] rounded-none border-l border-cyan-300 bg-cyan-50 px-3 py-3 text-xs font-semibold text-cyan-900 dark:border-cyan-400/30 dark:bg-cyan-500/15 dark:text-cyan-50 sm:min-w-[146px] sm:px-4"
    >
      {isLoading ? "Running" : "Extract BOM"}
    </Button>
  );
}
