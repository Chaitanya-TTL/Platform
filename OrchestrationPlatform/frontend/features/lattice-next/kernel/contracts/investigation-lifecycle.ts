export type InvestigationLifecycle =
  | "draft"
  | "resolving"
  | "gathering"
  | "assembling"
  | "ready"
  | "partial"
  | "failed"
  | "cancelled"
  | "refreshing";

export const TERMINAL_LIFECYCLES = new Set<InvestigationLifecycle>([
  "ready",
  "partial",
  "failed",
  "cancelled",
]);
