"use client";

import React from "react";
import { Button } from "./ui/stateful-button";

interface StatefulButtonDemoProps {
  isLoading?: boolean;
  disabled?: boolean;
}

export function StatefulButtonDemo({ isLoading = false, disabled = false }: StatefulButtonDemoProps) {
  return (
    <Button
      type="submit"
      isLoading={isLoading}
      disabled={disabled}
      className="min-w-[146px] rounded-none border-l border-cyan-400/30 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]"
    >
      {isLoading ? "Running" : "Extract BOM"}
    </Button>
  );
}
