"use client";
import { useSyncExternalStore } from "react";
import { searchPartAcrossBoms } from "@/lib/cross-bom-impact";
import type { SourceType, TreeNodeData } from "@/types/bom-comparison";
import type {
  CrossBomImpactResult,
  ImpactStoreSnapshot,
} from "@/types/bom-impact";
const listeners = new Set<() => void>();
let snapshot: ImpactStoreSnapshot = {
  enabled: false,
  result: null,
  loadedBoms: {},
};
function emit() {
  snapshot = { ...snapshot, loadedBoms: { ...snapshot.loadedBoms } };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function registerImpactBom(
  source: SourceType,
  root: TreeNodeData | null,
) {
  if (root) snapshot.loadedBoms[source] = root;
  else delete snapshot.loadedBoms[source];
  emit();
}
export function setImpactEnabled(enabled: boolean) {
  snapshot.enabled = enabled;
  snapshot.result = null;
  emit();
}
export function runImpactSearch(source: SourceType, node: TreeNodeData) {
  if (!snapshot.enabled) return;
  snapshot.result = searchPartAcrossBoms(source, node, snapshot.loadedBoms);
  emit();
}
export function clearImpactResult() {
  snapshot.result = null;
  emit();
}
export function useCrossBomImpact() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
export function occurrencesForSource(
  result: CrossBomImpactResult | null,
  source: SourceType,
) {
  return result?.occurrences.filter((x) => x.source === source) ?? [];
}
