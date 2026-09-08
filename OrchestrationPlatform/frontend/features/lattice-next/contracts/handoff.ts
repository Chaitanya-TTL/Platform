import type { SourceType, TreeNodeData } from "@/types/bom-comparison";

export const LATTICE_HANDOFF_VERSION = 2 as const;
export const LATTICE_HANDOFF_PREFIX = "lattice-next:handoff:";
export const LATTICE_HANDOFF_TTL_MS = 6 * 60 * 60 * 1000;

export type LatticeSourceEnvelope = {
  source: SourceType;
  label: string;
  root: TreeNodeData;
  nativeId?: string;
  jobId?: string;
  capturedAt?: string;
  completeness: "complete" | "partial";
};

export type LatticeHandoff = {
  version: typeof LATTICE_HANDOFF_VERSION;
  handoffId: string;
  createdAt: string;
  expiresAt: string;
  subjectLabel: string;
  sources: LatticeSourceEnvelope[];
};

export type HandoffFailureCode = "storage-unavailable" | "serialization-failed" | "not-found" | "invalid" | "expired" | "version-mismatch";
export type HandoffReadResult = { ok: true; value: LatticeHandoff } | { ok: false; code: HandoffFailureCode; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTreeNode(value: unknown): value is TreeNodeData {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return false;
  return value.children === undefined || (Array.isArray(value.children) && value.children.every(isTreeNode));
}

export function validateHandoff(value: unknown): HandoffReadResult {
  if (!isRecord(value)) return { ok: false, code: "invalid", message: "The investigation handoff is not an object." };
  if (value.version !== LATTICE_HANDOFF_VERSION) return { ok: false, code: "version-mismatch", message: "This handoff was created by an unsupported Lattice version." };
  if (typeof value.handoffId !== "string" || !value.handoffId || typeof value.subjectLabel !== "string") return { ok: false, code: "invalid", message: "The handoff identity is incomplete." };
  if (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) return { ok: false, code: "invalid", message: "The handoff expiry is invalid." };
  if (Date.parse(value.expiresAt) <= Date.now()) return { ok: false, code: "expired", message: "This handoff has expired. Open Lattice again from the source workspace." };
  if (!Array.isArray(value.sources) || !value.sources.length) return { ok: false, code: "invalid", message: "The handoff contains no engineering structures." };
  const valid = value.sources.every((entry) => isRecord(entry) && typeof entry.source === "string" && typeof entry.label === "string" && isTreeNode(entry.root));
  if (!valid) return { ok: false, code: "invalid", message: "One or more engineering structures are malformed." };
  return { ok: true, value: value as unknown as LatticeHandoff };
}

export function createHandoff(input: Omit<LatticeHandoff, "version" | "handoffId" | "createdAt" | "expiresAt">): LatticeHandoff {
  const now = new Date();
  return { ...input, version: LATTICE_HANDOFF_VERSION, handoffId: `lnx-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + LATTICE_HANDOFF_TTL_MS).toISOString() };
}
