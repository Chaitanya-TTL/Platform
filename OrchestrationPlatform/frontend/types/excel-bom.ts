import type { TreeNodeData } from "@/types/bom-comparison";

export type ExcelHierarchyMode = "auto" | "level" | "parent-child" | "indentation" | "path" | "level-columns" | "flat";
export type ResolvedExcelHierarchyMode = Exclude<ExcelHierarchyMode, "auto">;
export type ExcelMappedField =
  | "itemId" | "parentItemId" | "name" | "quantity" | "level" | "revision" | "unit"
  | "path" | "findNumber" | "lineNumber" | "referenceDesignator" | "lifecycleState";
export type ExcelColumnMapping = Record<ExcelMappedField, string>;
export type ExcelConfidence = "high" | "medium" | "low";

export type ExcelColumnProfile = {
  header: string;
  normalizedHeader: string;
  nonBlank: number;
  unique: number;
  completeness: number;
  numericRatio: number;
  integerRatio: number;
  identifierRatio: number;
  quantityRatio: number;
  pathRatio: number;
  indentationRatio: number;
  samples: string[];
};

export type ExcelMappingCandidate = {
  field: ExcelMappedField;
  header: string;
  score: number;
  confidence: ExcelConfidence;
  reasons: string[];
  samples: string[];
};

export type ExcelWorksheetData = {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  rowCount: number;
  dataRowCount: number;
  columnCount: number;
  headerRow: number;
  headerConfidence: number;
  dataRegion: string;
  headers: string[];
  rows: Array<{ rowNumber: number; outlineLevel: number; values: Record<string, string> }>;
  profiles: ExcelColumnProfile[];
  mappingCandidates: Partial<Record<ExcelMappedField, ExcelMappingCandidate[]>>;
  sheetScore: number;
};

export type ExcelWorkbookData = {
  fileName: string;
  worksheets: ExcelWorksheetData[];
  suggestedSheetName: string;
  inspectedAt: string;
};

export type ExcelHierarchyCandidate = {
  mode: ResolvedExcelHierarchyMode;
  score: number;
  confidence: ExcelConfidence;
  rootCount: number;
  maximumDepth: number;
  attachedRows: number;
  orphanRows: number;
  invalidJumps: number;
  evidence: string[];
};

export type ExcelValidationIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  rowNumber?: number;
  itemId?: string;
  affectedRows?: number;
  sampleRows?: number[];
  suggestion?: string;
};

export type ExcelIssueGroup = {
  severity: ExcelValidationIssue["severity"];
  code: string;
  message: string;
  count: number;
  affectedRows: number;
  sampleRows: number[];
  suggestion?: string;
};

export type ParsedExcelQuantity = {
  value: number;
  unit: string;
  qualifier: string;
  raw: string;
  defaulted: boolean;
  valid: boolean;
};

export type ExcelNormalizedPreviewRow = {
  rowNumber: number;
  rawItemId: string;
  itemId: string;
  name: string;
  level: number | null;
  parentItemId: string;
  quantity: number;
  unit: string;
  rawQuantity: string;
  revision: string;
  warnings: string[];
};

export type ExcelNormalizationSummary = {
  items: number;
  uniqueItems: number;
  assemblies: number;
  leaves: number;
  levels: number;
  roots: number;
  errors: number;
  warnings: number;
  ignoredRows: number;
};

export type ExcelDiagnosticReport = {
  parserVersion: string;
  workbook: string;
  worksheet: string;
  headerRow: number;
  dataRegion: string;
  mapping: ExcelColumnMapping;
  mappingCandidates: Partial<Record<ExcelMappedField, ExcelMappingCandidate[]>>;
  hierarchyCandidates: ExcelHierarchyCandidate[];
  selectedHierarchy: ResolvedExcelHierarchyMode | null;
  issues: ExcelIssueGroup[];
  summary: ExcelNormalizationSummary;
  generatedAt: string;
};

export type ExcelNormalizationResult = {
  root: TreeNodeData | null;
  mode: ResolvedExcelHierarchyMode | null;
  hierarchyCandidates: ExcelHierarchyCandidate[];
  issues: ExcelValidationIssue[];
  issueGroups: ExcelIssueGroup[];
  preview: ExcelNormalizedPreviewRow[];
  summary: ExcelNormalizationSummary;
  normalizedAt: string;
  source: { fileName: string; sheetName: string; headerRow: number; mapping: ExcelColumnMapping };
  diagnostic: ExcelDiagnosticReport;
};
