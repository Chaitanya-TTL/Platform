import type { InvestigationGraph } from "../domain/model";

function freeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return value;
}

export function immutableInvestigationGraph(graph: InvestigationGraph): InvestigationGraph {
  return freeze(graph);
}
