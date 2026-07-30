"use client";

import type { ReverseRequirementTraceResult } from "@/types/requirement-trace";

/**
 * The requirement drawer owns the visible focus summary and clear controls.
 * This compatibility component intentionally renders nothing while accepting
 * the existing SourceBomPanel contract.
 */
export function RequirementFocusSummary({
  focus: _focus,
}: {
  focus?: ReverseRequirementTraceResult | null;
}) {
  return null;
}
