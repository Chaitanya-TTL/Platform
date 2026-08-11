import type { TreeNodeData } from "@/types/bom-comparison";

export type ExcelHierarchyMode = "auto" | "level" | "parent-child";
export type ExcelMappedField =
  | "itemId"
  | "parentItemId"
  | "name"
  | "quantity"
  | "level"
  | "revision"
  | "unit";

export type ExcelColumnMapping = Record<ExcelMappedField, string>;

export type ExcelWorksheetData = {
  name: string;
  rowCount: number;
  columnCount: number;
  headerRow: number;
  headers: string[];
  rows: Array<{ rowNumber: number; values: Record<string, string> }>;
};

export type ExcelWorkbookData = {
  fileName: string;
  worksheets: ExcelWorksheetData[];
};

export type ExcelValidationIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  rowNumber?: number;
  itemId?: string;
};

export type ExcelNormalizationSummary = {
  items: number;
  assemblies: number;
  leaves: number;
  levels: number;
  errors: number;
  warnings: number;
  ignoredRows: number;
};

export type ExcelNormalizationResult = {
  root: TreeNodeData | null;
  mode: Exclude<ExcelHierarchyMode, "auto"> | null;
  issues: ExcelValidationIssue[];
  summary: ExcelNormalizationSummary;
  normalizedAt: string;
  source: {
    fileName: string;
    sheetName: string;
    headerRow: number;
    mapping: ExcelColumnMapping;
  };
};
