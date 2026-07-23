"use client";
import { useSyncExternalStore } from "react";
import { traceRequirements } from "@/lib/requirement-trace-data";
import type { SourceType, TreeNodeData } from "@/types/bom-comparison";
import type { RequirementTraceSnapshot } from "@/types/requirement-trace";

const listeners = new Set<() => void>();
let snapshot: RequirementTraceSnapshot = { enabled: false, result: null, modalOpen: false, loadedBoms: {} };
function emit() { snapshot = { ...snapshot, loadedBoms: { ...snapshot.loadedBoms } }; listeners.forEach((listener) => listener()); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export function registerRequirementBom(source: SourceType, root: TreeNodeData | null) { if (root) snapshot.loadedBoms[source] = root; else delete snapshot.loadedBoms[source]; emit(); }
export function setRequirementTraceEnabled(enabled: boolean) { snapshot.enabled = enabled; snapshot.result = null; snapshot.modalOpen = false; emit(); }
export function runRequirementTrace(source: SourceType, node: TreeNodeData, openModal = false) { if (!snapshot.enabled) return; snapshot.result = traceRequirements(source, node, snapshot.loadedBoms); snapshot.modalOpen = openModal; emit(); }
export function openRequirementModal() { if (snapshot.result) snapshot.modalOpen = true; emit(); }
export function closeRequirementModal() { snapshot.modalOpen = false; emit(); }
export function clearRequirementTrace() { snapshot.result = null; snapshot.modalOpen = false; emit(); }
export function useRequirementTrace() { return useSyncExternalStore(subscribe, () => snapshot, () => snapshot); }
