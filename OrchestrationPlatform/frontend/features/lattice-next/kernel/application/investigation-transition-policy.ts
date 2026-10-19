import type { InvestigationLifecycle } from "../contracts/investigation-lifecycle";

const allowed: Readonly<Record<InvestigationLifecycle, readonly InvestigationLifecycle[]>> = {
  draft: ["resolving", "cancelled", "failed"],
  resolving: ["gathering", "assembling", "partial", "failed", "cancelled"],
  gathering: ["assembling", "partial", "failed", "cancelled"],
  assembling: ["ready", "partial", "failed", "cancelled"],
  ready: ["refreshing", "cancelled"],
  partial: ["refreshing", "cancelled"],
  failed: ["refreshing"],
  cancelled: ["refreshing"],
  refreshing: ["resolving", "gathering", "assembling", "partial", "failed", "cancelled"],
};

export const canTransition = (from: InvestigationLifecycle, to: InvestigationLifecycle): boolean =>
  from === to || allowed[from].includes(to);

export const assertTransition = (from: InvestigationLifecycle, to: InvestigationLifecycle): void => {
  if (!canTransition(from, to)) throw new Error(`Invalid investigation transition: ${from} -> ${to}`);
};
