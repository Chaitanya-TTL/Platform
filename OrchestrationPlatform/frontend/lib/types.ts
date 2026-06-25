export interface BomNode {
  itemId: string;
  sequence: string;
  variantState: string;
  revId: string;
  name: string;
  qty: string;
  variantCondition: string | null;
  children: BomNode[];
}

export interface BomRoot {
  bomRoot: BomNode;
  sourceItemId: string;
  sourceRevId: string;
  variantOptions: Record<string, string[]>;
  extractedAt: string;
}

export interface PipelineProgress {
  jobId: string;
  phase: string;
  status: "in_progress" | "complete" | "error";
  progressPercent: number;
  message: string;
  bomStructure?: BomRoot;
  error?: string;
  timestamp: string;
}

export interface PipelineRequest {
  teamcenterItemId: string;
  pipelinePath?: string;
}
