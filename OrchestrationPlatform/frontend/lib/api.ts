const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";
async function readError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    return body.message || body.error || response.statusText;
  } catch {
    return text || response.statusText;
  }
}
async function postPipeline(body: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/pipeline/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Pipeline error: ${await readError(response)}`);
  return response.json();
}
export function startPipeline(request: { teamcenterItemId: string }) {
  return postPipeline({ kind: "teamcenter", ...request });
}
export function startConfigitExtraction(request: {
  workItemId: string;
  productModelCode: string;
}) {
  return postPipeline({ kind: "configit", ...request });
}
export function startSapExtraction(request: {
  materialId: string;
  plant?: string;
  bomUsage?: string;
  alternative?: string;
}) {
  return postPipeline({ kind: "sap", ...request });
}
export interface BomNode {
  itemId: string;
  sequence?: string;
  variantState?: string;
  revId?: string;
  name?: string;
  qty?: string;
  variantCondition?: string;
  children?: BomNode[];
}
export interface PipelineProgress {
  jobId: string;
  phase: string;
  status: string;
  progressPercent: number;
  message: string;
  timestamp: string;
  bomStructure?: BomNode;
  error?: string;
}
export function subscribeToProgress(
  jobId: string,
  onProgress: (progress: PipelineProgress) => void,
  onError: (error: string) => void,
  onComplete: () => void,
): () => void {
  const eventSource = new EventSource(
    `${API_BASE}/pipeline/progress/${encodeURIComponent(jobId)}`,
  );
  let completed = false;
  const complete = () => {
    if (!completed) {
      completed = true;
      eventSource.close();
      onComplete();
    }
  };
  eventSource.onmessage = (event) => {
    try {
      const progress = JSON.parse(event.data) as PipelineProgress;
      if (progress.status === "error" || progress.error) {
        onError(progress.error || progress.message || "Pipeline error");
        complete();
        return;
      }
      onProgress(progress);
      if (progress.status === "complete" || progress.progressPercent === 100)
        complete();
    } catch {
      onError("Failed to parse progress data");
      complete();
    }
  };
  eventSource.onerror = () => eventSource.close();
  return () => eventSource.close();
}
export async function getLogs() {
  const response = await fetch(`${API_BASE}/pipeline/logs`);
  if (!response.ok) throw new Error("Failed to fetch logs");
  return response.json();
}
export async function getLogByJobId(jobId: string) {
  try {
    const response = await fetch(
      `${API_BASE}/pipeline/logs/${encodeURIComponent(jobId)}`,
    );
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
}
export async function getPipelineBom(jobId: string) {
  const response = await fetch(
    `${API_BASE}/pipeline/bom/${encodeURIComponent(jobId)}`,
  );
  if (!response.ok)
    throw new Error((await readError(response)) || "Failed to fetch BOM");
  return response.json();
}
export async function getBomStructure(jobId: string): Promise<BomNode | null> {
  try {
    const result = await getPipelineBom(jobId);
    return result?.finalBom?.bomRoot ?? result?.finalBom?.bomRootNode ?? null;
  } catch {
    return null;
  }
}
export async function healthCheck() {
  const response = await fetch(`${API_BASE}/pipeline/health`);
  if (!response.ok) throw new Error("Health check failed");
  return response.json();
}
