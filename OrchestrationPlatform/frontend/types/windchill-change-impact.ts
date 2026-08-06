export type WindchillChangeImpactKind = "direct" | "indirect";
export type WindchillChangeImpactFilter = "all" | WindchillChangeImpactKind;

export type WindchillAffectedPart = {
  partId: string;
  partNumber?: string | null;
  partName?: string | null;
  revision?: string | null;
  version?: string | null;
  state?: string | null;
  changeIntent?: string | null;
  finishedDisposition?: string | null;
  inventoryDisposition?: string | null;
  onOrderDisposition?: string | null;
  matchedNodeIds: string[];
  matchMethod: "part-oid" | "part-number";
};

export type WindchillChangeTask = {
  id: string;
  number?: string | null;
  name?: string | null;
  description?: string | null;
  state?: string | null;
  resolutionDate?: string | null;
};

export type WindchillChangeNotice = {
  id?: string | null;
  number?: string | null;
  name?: string | null;
  description?: string | null;
  descriptionSummary?: string | null;
  state?: string | null;
  createdOn?: string | null;
  lastModified?: string | null;
  resolutionDate?: string | null;
  tasks: WindchillChangeTask[];
  affectedParts: WindchillAffectedPart[];
};

export type WindchillNodeImpact = {
  impact: WindchillChangeImpactKind;
  notices?: Array<{
    number?: string | null;
    name?: string | null;
    state?: string | null;
    affectedVersion?: string | null;
    changeIntent?: string | null;
  }>;
};

export type WindchillChangeImpactResult = {
  product: { partId?: string | null; partNumber?: string | null; partName?: string | null };
  changeNotices: WindchillChangeNotice[];
  impactMap: Record<string, WindchillNodeImpact>;
  summary: {
    changeNotices: number;
    affectedParts: number;
    affectedOccurrences: number;
    impactedAssemblies: number;
  };
  warnings: string[];
  generatedAt: string;
  scanMode: "current-structure";
};
