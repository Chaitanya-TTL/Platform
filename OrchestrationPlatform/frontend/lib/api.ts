import type { SapOperationalImpact } from "@/types/sap-operational-impact";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";

export class ApiError extends Error {
  status: number;
  technicalDetails: string;
  constructor(message: string, status: number, technicalDetails = message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.technicalDetails = technicalDetails;
  }
}

async function errorDetails(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    return body.message || body.error || response.statusText;
  } catch {
    return text || response.statusText;
  }
}

async function expectJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await errorDetails(response);
    throw new ApiError(details, response.status, details);
  }
  return response.json() as Promise<T>;
}

type StartResponse = { success: boolean; jobId: string; kind: string; message: string; payload?: unknown };
async function postPipeline(body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/pipeline/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return expectJson<StartResponse>(response);
}

export function startPipeline(request: { teamcenterItemId: string }) {
  return postPipeline({ kind: "teamcenter", ...request });
}
export function startConfigitExtraction(request: { workItemId: string; productModelCode: string }) {
  return postPipeline({ kind: "configit", ...request });
}
export function startSapExtraction(request: { materialId: string; plant?: string; bomUsage?: string; alternative?: string; includeSapBusinessImpact?: boolean }) {
  return postPipeline({ kind: "sap", ...request });
}

export interface BomNode { itemId: string; sequence?: string; variantState?: string; revId?: string; name?: string; qty?: string; variantCondition?: string; children?: BomNode[] }
export interface PipelineProgress { jobId: string; phase: string; status: string; progressPercent: number; message: string; timestamp: string; bomStructure?: BomNode; error?: string }
export interface SapOrganization { plant: string; valuationArea: string; companyCode: string; currency: string }
export interface SapValuationChecks { calculatedInventoryValue: number | null; reportedInventoryValue: number | null; valuationReconciled: boolean | null }
export interface SapStorageLocation { storageLocation: string; unrestricted: number | null; qualityInspection: number | null; restrictedUse: number | null; blocked: number | null; inTransfer: number | null; returns: number | null }
export interface SapMaterialImpact {
  materialId: string; internalMaterialId: string; requestedMaterialId: string; description: string; materialType: string; baseUnit: string; batchManaged: boolean | null; crossPlantStatus: string; status: string; organization: SapOrganization;
  stock: { unrestricted: number | null; qualityInspection: number | null; restrictedUse: number | null; blocked: number | null; inTransfer: number | null; returns: number | null; totalPhysical: number | null; atpAvailable: number | null };
  inventory: { valuatedQuantity: number | null; totalStockValue: number | null; valuationType: string };
  cost: { priceControl: string; standardPrice: number | null; movingAveragePrice: number | null; priceUnit: number | null; effectiveUnitCost: number | null; valuationClass: string };
  checks: SapValuationChecks; storageLocations: SapStorageLocation[]; warnings: string[]; extractedAt: string;
}
export interface SapBusinessImpact { sourceMaterialId: string; plant: string; status: string; materials: SapMaterialImpact[]; warnings: string[]; extractedAt: string }

export function subscribeToProgress(jobId: string, onProgress: (progress: PipelineProgress) => void, onError: (message: string) => void, onComplete: () => void) {
  const events = new EventSource(`${API_BASE}/pipeline/progress/${encodeURIComponent(jobId)}`);
  let done = false;
  const complete = () => { if (!done) { done = true; events.close(); onComplete(); } };
  events.onmessage = (event) => {
    try {
      const progress = JSON.parse(event.data) as PipelineProgress;
      if (progress.status === "error" || progress.error) { onError(progress.error || progress.message || "Pipeline error"); complete(); return; }
      onProgress(progress);
      if (progress.status === "complete" || progress.progressPercent === 100) complete();
    } catch { onError("Progress updates could not be read"); complete(); }
  };
  events.onerror = () => events.close();
  return () => events.close();
}

export async function getPipelineBom(jobId: string) {
  return expectJson(await fetch(`${API_BASE}/pipeline/bom/${encodeURIComponent(jobId)}`, { cache: "no-store" }));
}
export async function getSapOperationalImpact(jobId: string): Promise<SapOperationalImpact> {
  const body = await expectJson<{ sapOperationalImpact: SapOperationalImpact }>(await fetch(`${API_BASE}/pipeline/sap-operational-impact/${encodeURIComponent(jobId)}`, { cache: "no-store" }));
  return body.sapOperationalImpact;
}
export async function getSapBusinessImpact(jobId: string): Promise<SapBusinessImpact> {
  const body = await expectJson<{ sapImpact: SapBusinessImpact }>(await fetch(`${API_BASE}/pipeline/sap-impact/${encodeURIComponent(jobId)}`, { cache: "no-store" }));
  return body.sapImpact;
}
export async function getLogs() { return expectJson(await fetch(`${API_BASE}/pipeline/logs`)); }
export async function getLogByJobId(jobId: string) { try { return await expectJson(await fetch(`${API_BASE}/pipeline/logs/${encodeURIComponent(jobId)}`)); } catch { return null; } }
export async function getBomStructure(jobId: string): Promise<BomNode | null> { try { const result = await getPipelineBom(jobId) as { finalBom?: { bomRoot?: BomNode; bomRootNode?: BomNode } }; return result?.finalBom?.bomRoot ?? result?.finalBom?.bomRootNode ?? null; } catch { return null; } }
export async function healthCheck() { return expectJson(await fetch(`${API_BASE}/pipeline/health`)); }
