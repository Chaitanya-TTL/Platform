import type { TreeNodeData } from "@/types/bom-comparison";
import type { NormalizedSearchResult } from "./contracts";
import type { ResolutionUpdate } from "./structure-resolver";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";
const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 120_000;

type JobState = "accepted" | "queued" | "checking-readiness" | "discovering" | "awaiting-selection" | "resolving" | "extracting" | "enriching" | "success" | "partial-success" | "empty" | "failed" | "unavailable" | "cancellation-requested" | "cancelled" | "timed-out";
type JobRecord = { jobId: string; state: JobState; currentStage?: string; progressPercent?: number; resultAvailable?: boolean; errors?: Array<{ userMessage?: string; message?: string }>; diagnostic?: { lastEvent?: string } };
type ExtractionResult = {
  sourceExecutionId: string;
  status: string;
  evidence?: {
    requirement?: Record<string, unknown>;
    sourceContext?: Record<string, unknown>;
    hierarchy?: { parentName?: string | null; childNames?: string[] };
    catalog?: Record<string, unknown>;
  };
  provenance?: Record<string, unknown>;
};

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const id = window.setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { window.clearTimeout(id); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
});
const text = (value: unknown) => value === null || value === undefined ? undefined : String(value);
const attributes = (values: Record<string, unknown>): Record<string, string | number | boolean> => Object.entries(values).reduce<Record<string, string | number | boolean>>((output, [key, value]) => { if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") output[key] = value; return output; }, {});
const notify = (result: NormalizedSearchResult, state: ResolutionUpdate["state"], message: string, extra: Partial<ResolutionUpdate>, onUpdate?: (value: ResolutionUpdate) => void) => onUpdate?.({ resultId: result.resultId, source: result.source, nativeId: result.nativeId, state, message, updatedAt: new Date().toISOString(), ...extra });

function candidate(result: NormalizedSearchResult) {
  return {
    candidateId: result.resultId,
    source: "Codebeamer",
    nativeId: result.nativeId,
    displayName: result.displayName,
    entityType: result.entityType,
    revision: result.revision ?? null,
    version: result.version ?? null,
    description: result.description ?? null,
    lifecycleState: result.lifecycleState ?? null,
    matchCategory: result.matchCategory,
    matchReason: result.matchReason,
    confidenceClass: result.matchCategory === "verified-identifier-match" ? "Verified" : "Probable",
    availableCapabilities: result.capabilityHints,
    sourceMetadata: Object.fromEntries(Object.entries(result.sourceMetadata).map(([key, value]) => [key, value === null ? null : String(value)])),
    provenance: {
      kind: "CachedSourceResult",
      provider: "codebeamer_extractor",
      observedAt: result.provenance.retrievedAt,
      reference: result.resultId,
    },
    canExtract: result.canStartInvestigation,
  };
}

function requirementTree(result: NormalizedSearchResult, extraction: ExtractionResult): TreeNodeData {
  const evidence = extraction.evidence ?? {};
  const requirement = evidence.requirement ?? {};
  const source = evidence.sourceContext ?? {};
  const hierarchy = evidence.hierarchy ?? {};
  const catalog = evidence.catalog ?? {};
  const parent = hierarchy.parentName ? [{ id: `${result.resultId}:parent`, name: hierarchy.parentName, attributes: { "Entity Type": "Parent Requirement", "Relationship": "parent" }, children: [] }] : [];
  const children = (hierarchy.childNames ?? []).map((name, index) => ({ id: `${result.resultId}:child:${index}`, name, attributes: { "Entity Type": "Child Requirement", "Relationship": "child" }, children: [] }));
  return {
    id: result.resultId,
    name: text(requirement.name) ?? result.displayName,
    attributes: attributes({
      "Entity Type": "Requirement",
      "Item ID": text(requirement.itemId) ?? result.nativeId,
      "External Key": text(requirement.externalKey) ?? text(result.sourceMetadata.externalKey),
      "Description": text(requirement.description) ?? result.description,
      "Status": text(requirement.status),
      "Priority": text(requirement.priority),
      "Version": text(requirement.version) ?? result.version,
      "Categories": Array.isArray(requirement.categories) ? requirement.categories.join(", ") : undefined,
      "Severities": Array.isArray(requirement.severities) ? requirement.severities.join(", ") : undefined,
      "Project": text(source.projectName),
      "Tracker": text(source.trackerName),
      "Catalog Revision": text(catalog.revision),
      "Catalog Status": text(catalog.status),
      "Catalog Synchronized At": text(catalog.synchronizedAt),
      "Source Execution ID": extraction.sourceExecutionId,
    }),
    children: [...parent, ...children],
  };
}

export async function extractCodebeamerRequirement(result: NormalizedSearchResult, signal: AbortSignal, onUpdate?: (value: ResolutionUpdate) => void) {
  notify(result, "starting", "Starting Codebeamer requirement extraction.", {}, onUpdate);
  const requestId = `lcb2-${crypto.randomUUID()}`;
  const response = await fetch(`${API_BASE}/engineering/extractions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: "1.0", requestId, correlationId: requestId, source: "Codebeamer", candidate: candidate(result), requestedEvidence: ["requirement", "sourceContext", "hierarchy", "catalog"], organizationContext: null, timeoutPolicy: { timeoutMs: TIMEOUT_MS }, initiatedAt: new Date().toISOString() }),
    signal,
  });
  if (!response.ok) throw new Error(`Codebeamer extraction could not start (${response.status}).`);
  const accepted = await response.json() as { jobId?: string };
  if (!accepted.jobId) throw new Error("Codebeamer extraction did not return a job ID.");
  const jobId = accepted.jobId;
  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const statusResponse = await fetch(`${API_BASE}/engineering/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store", signal });
    if (!statusResponse.ok) throw new Error(`Codebeamer extraction status failed (${statusResponse.status}).`);
    const job = await statusResponse.json() as JobRecord;
    notify(result, "extracting", job.diagnostic?.lastEvent ?? "Extracting Codebeamer requirement evidence.", { jobId, progressPercent: job.progressPercent ?? 0 }, onUpdate);
    if (job.state === "success" || job.state === "partial-success") {
      if (!job.resultAvailable) { await sleep(POLL_INTERVAL_MS, signal); continue; }
      const resultResponse = await fetch(`${API_BASE}/engineering/jobs/${encodeURIComponent(jobId)}/result`, { cache: "no-store", signal });
      if (!resultResponse.ok) throw new Error(`Codebeamer extraction result failed (${resultResponse.status}).`);
      const extraction = await resultResponse.json() as ExtractionResult;
      const state = job.state === "partial-success" ? "partial" as const : "ready" as const;
      notify(result, state, "Codebeamer requirement evidence is ready.", { jobId, progressPercent: 100 }, onUpdate);
      return { root: requirementTree(result, extraction), intelligencePayload: extraction as unknown as Record<string, unknown>, jobId, state };
    }
    if (["failed", "unavailable", "empty", "cancelled", "timed-out"].includes(job.state)) throw new Error(job.errors?.[0]?.userMessage ?? job.errors?.[0]?.message ?? `Codebeamer extraction ended with ${job.state}.`);
    await sleep(POLL_INTERVAL_MS, signal);
  }
  throw new DOMException("Codebeamer extraction exceeded 120 seconds.", "TimeoutError");
}
