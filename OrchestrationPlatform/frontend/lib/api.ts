const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";

export async function startPipeline(request: { teamcenterItemId: string }) {
  const response = await fetch(`${API_BASE}/pipeline/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "teamcenter", ...request }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pipeline error: ${errorText || response.statusText}`);
  }
  return response.json();
}

export async function startConfigitExtraction(request: { workItemId: string; productModelCode: string }) {
  const response = await fetch(`${API_BASE}/pipeline/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "configit", ...request }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pipeline error: ${errorText || response.statusText}`);
  }
  return response.json();
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
  onComplete: () => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/pipeline/progress/${jobId}`);
  let completed = false;

  const handleComplete = () => {
    if (!completed) {
      completed = true;
      eventSource.close();
      onComplete();
    }
  };

  eventSource.onmessage = (event) => {
    try {
      const progress = JSON.parse(event.data) as PipelineProgress;
      console.info("[Progress stream] event", { jobId, progress });
      
      // Check if this event indicates an error
      if (progress.status === "error" || progress.error) {
        onError(progress.error || progress.message || "Pipeline error");
        handleComplete();
        return;
      }
      
      // Call the progress callback
      onProgress(progress);
      
      // If pipeline is complete, close the connection
      if (progress.status === "complete" || progress.progressPercent === 100) {
        handleComplete();
      }
    } catch (err) {
      console.error("Failed to parse progress:", err);
      onError("Failed to parse progress data");
      handleComplete();
    }
  };

  eventSource.onerror = () => {
    console.error("[Progress stream] connection error", { jobId });
    handleComplete();
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

export async function getLogs() {
  const response = await fetch(`${API_BASE}/pipeline/logs`);
  if (!response.ok) throw new Error("Failed to fetch logs");
  return response.json();
}

export async function getLogByJobId(jobId: string) {
  try {
    const response = await fetch(`${API_BASE}/pipeline/logs/${jobId}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function getPipelineBom(jobId: string) {
  const response = await fetch(`${API_BASE}/pipeline/bom/${jobId}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to fetch BOM");
  }
  return response.json();
}

export async function getBomStructure(jobId: string): Promise<BomNode | null> {
  try {
    const result = await getPipelineBom(jobId);
    if (result?.finalBom?.bomRoot) {
      return result.finalBom.bomRoot;
    }
    if (result?.finalBom?.bomRootNode) {
      return result.finalBom.bomRootNode;
    }
    return null;
  } catch (err) {
    console.error("Failed to get BOM structure:", err);
    return null;
  }
}

export async function healthCheck() {
  const response = await fetch(`${API_BASE}/pipeline/health`);
  if (!response.ok) throw new Error("Health check failed");
  return response.json();
}
