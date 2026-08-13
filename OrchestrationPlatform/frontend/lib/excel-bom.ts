import ExcelJS from "exceljs";
import type { TreeNodeData } from "@/types/bom-comparison";
import type {
  ExcelColumnMapping,
  ExcelHierarchyMode,
  ExcelMappedField,
  ExcelNormalizationResult,
  ExcelValidationIssue,
  ExcelWorkbookData,
  ExcelWorksheetData,
  ResolvedExcelHierarchyMode,
} from "@/types/excel-bom";
import { excelFields } from "@/lib/excel-engine/header-normalizer";
import { profileWorksheet } from "@/lib/excel-engine/workbook-profiler";
import { inferExcelMappings } from "@/lib/excel-engine/column-mapper";
import { buildExcelHierarchy, detectHierarchyCandidates, prepareRows } from "@/lib/excel-engine/hierarchy-engine";
import { groupExcelIssues } from "@/lib/excel-engine/validation";

export const EXCEL_PARSER_VERSION = "2.0.0";

export const excelFieldLabels: Record<ExcelMappedField, string> = {
  itemId: "Item ID",
  parentItemId: "Parent Item ID",
  name: "Name / description",
  quantity: "Quantity",
  level: "BOM level",
  revision: "Revision",
  unit: "Unit of measure",
  path: "Hierarchy path",
  findNumber: "Find number",
  lineNumber: "Line number",
  referenceDesignator: "Reference designator",
  lifecycleState: "Lifecycle state",
};

export async function inspectExcelWorkbook(file: File): Promise<ExcelWorkbookData> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Only .xlsx workbooks are supported. Save legacy .xls files as .xlsx and try again.");
  }
  const workbook = new ExcelJS.Workbook();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheets = workbook.worksheets.filter((sheet) => sheet.actualRowCount > 0).map(profileWorksheet);
  if (!worksheets.length) throw new Error("The workbook does not contain a populated worksheet.");
  for (const sheet of worksheets) inferExcelMappings(sheet);
  worksheets.sort((a, b) => b.sheetScore - a.sheetScore);
  return {
    fileName: file.name,
    worksheets,
    suggestedSheetName: worksheets[0].name,
    inspectedAt: new Date().toISOString(),
  };
}

export function suggestExcelMapping(headersOrSheet: string[] | ExcelWorksheetData): ExcelColumnMapping {
  if (!Array.isArray(headersOrSheet)) return inferExcelMappings(headersOrSheet).mapping;
  const blankSheet: ExcelWorksheetData = {
    name: "", state: "visible", rowCount: 0, dataRowCount: 0, columnCount: headersOrSheet.length,
    headerRow: 1, headerConfidence: 0, dataRegion: "", headers: headersOrSheet, rows: [],
    profiles: headersOrSheet.map((header) => ({ header, normalizedHeader: header.toLowerCase(), nonBlank: 0, unique: 0, completeness: 0, numericRatio: 0, integerRatio: 0, identifierRatio: 0, quantityRatio: 0, pathRatio: 0, indentationRatio: 0, samples: [] })),
    mappingCandidates: {}, sheetScore: 0,
  };
  return inferExcelMappings(blankSheet).mapping;
}

function rootCount(root: TreeNodeData | null) {
  if (!root) return 0;
  return root.attributes?.Virtual === true ? root.children?.length ?? 0 : 1;
}

function summarize(root: TreeNodeData | null, issues: ExcelValidationIssue[], ignoredRows: number) {
  let items = 0, assemblies = 0, leaves = 0, levels = 0;
  const unique = new Set<string>();
  const queue: Array<[TreeNodeData, number]> = root ? [[root, 1]] : [];
  while (queue.length) {
    const [node, level] = queue.shift()!;
    const virtual = node.attributes?.Virtual === true;
    if (!virtual) {
      items += 1;
      const itemId = String(node.attributes?.["Item ID"] ?? node.id);
      unique.add(itemId);
      levels = Math.max(levels, level - (root?.attributes?.Virtual === true ? 1 : 0));
      const children = node.children ?? [];
      if (children.length) assemblies += 1; else leaves += 1;
    }
    queue.push(...(node.children ?? []).map((child) => [child, level + 1] as [TreeNodeData, number]));
  }
  return {
    items,
    uniqueItems: unique.size,
    assemblies,
    leaves,
    levels,
    roots: rootCount(root),
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    ignoredRows,
  };
}

function validatePreparedRows(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping, prepared: ReturnType<typeof prepareRows>) {
  const issues: ExcelValidationIssue[] = [];
  if (!mapping.itemId) {
    const suggestion = sheet.mappingCandidates.itemId?.[0];
    issues.push({
      severity: "error",
      code: "mapping-item",
      message: "An Item ID column is required before the BOM can be reconstructed.",
      affectedRows: sheet.rows.length,
      suggestion: suggestion ? `Map “${suggestion.header}” to Item ID (${suggestion.score}% confidence).` : "Select the column containing part, item, component or material identifiers.",
    });
    return issues;
  }
  const missingRows = sheet.rows.filter((row) => !row.values[mapping.itemId]?.trim());
  if (missingRows.length) issues.push({
    severity: missingRows.length === sheet.rows.length ? "error" : "warning",
    code: "missing-item",
    message: "Some data rows do not contain an Item ID and will be skipped.",
    affectedRows: missingRows.length,
    sampleRows: missingRows.slice(0, 5).map((row) => row.rowNumber),
  });
  for (const row of prepared) {
    if (row.warnings.includes("Quantity could not be interpreted")) issues.push({ severity: "warning", code: "invalid-quantity", message: "Quantity could not be interpreted and was preserved as source text; normalized quantity is 1.", rowNumber: row.rowNumber, itemId: row.itemId });
    if (row.warnings.includes("Quantity defaulted to 1")) issues.push({ severity: "warning", code: "default-quantity", message: "Quantity was empty and defaulted to 1.", rowNumber: row.rowNumber, itemId: row.itemId });
    if (!mapping.name || !row.source.values[mapping.name]?.trim()) issues.push({ severity: "info", code: "missing-name", message: "Description is empty; Item ID is used as the display name.", rowNumber: row.rowNumber, itemId: row.itemId });
  }
  return issues;
}

function resolveMode(mode: ExcelHierarchyMode, candidates: ReturnType<typeof detectHierarchyCandidates>): ResolvedExcelHierarchyMode | null {
  if (mode !== "auto") return mode;
  const viable = candidates.find((candidate) => candidate.score >= 50 && candidate.mode !== "flat");
  return viable?.mode ?? (candidates.some((candidate) => candidate.mode === "flat" && candidate.attachedRows > 0) ? "flat" : null);
}

function requiredMappingIssue(mode: ResolvedExcelHierarchyMode | null, mapping: ExcelColumnMapping): ExcelValidationIssue | null {
  if (mode === "level" && !mapping.level) return { severity: "error", code: "mapping-level", message: "Level-based hierarchy requires a BOM Level column." };
  if (mode === "parent-child" && !mapping.parentItemId) return { severity: "error", code: "mapping-parent", message: "Parent-child hierarchy requires a Parent Item ID column." };
  if (mode === "path" && !mapping.path) return { severity: "error", code: "mapping-path", message: "Path hierarchy requires a hierarchy path column." };
  return null;
}

export function normalizeExcelBom(args: { workbook: ExcelWorkbookData; sheet: ExcelWorksheetData; mapping: ExcelColumnMapping; mode: ExcelHierarchyMode }): ExcelNormalizationResult {
  const { workbook, sheet, mapping } = args;
  const prepared = prepareRows(sheet, mapping);
  const issues = validatePreparedRows(sheet, mapping, prepared);
  const hierarchyCandidates = detectHierarchyCandidates(sheet, mapping, prepared);
  const detectedMode = resolveMode(args.mode, hierarchyCandidates);
  const mappingIssue = requiredMappingIssue(detectedMode, mapping);
  if (mappingIssue) issues.unshift(mappingIssue);
  if (!detectedMode) issues.unshift({ severity: "error", code: "hierarchy-unresolved", message: "No reliable hierarchy strategy could be determined." });
  let root: TreeNodeData | null = null;
  if (!issues.some((issue) => issue.severity === "error" && issue.code.startsWith("mapping-")) && detectedMode) {
    root = buildExcelHierarchy(sheet, mapping, detectedMode, issues, prepared);
  }
  if (!root && !issues.some((issue) => issue.severity === "error")) issues.push({ severity: "error", code: "no-root", message: "No BOM root could be constructed from the selected worksheet." });
  if (root?.attributes?.Virtual === true) issues.push({ severity: "warning", code: "multiple-roots", message: `${root.children?.length ?? 0} top-level assemblies were found; a neutral Excel BOM root was created.` });
  const ignoredRows = Math.max(0, sheet.rowCount - sheet.headerRow - sheet.rows.length);
  const summary = summarize(root, issues, ignoredRows);
  const issueGroups = groupExcelIssues(issues);
  const normalizedAt = new Date().toISOString();
  const source = { fileName: workbook.fileName, sheetName: sheet.name, headerRow: sheet.headerRow, mapping };
  const diagnostic = {
    parserVersion: EXCEL_PARSER_VERSION,
    workbook: workbook.fileName,
    worksheet: sheet.name,
    headerRow: sheet.headerRow,
    dataRegion: sheet.dataRegion,
    mapping,
    mappingCandidates: sheet.mappingCandidates,
    hierarchyCandidates,
    selectedHierarchy: detectedMode,
    issues: issueGroups,
    summary,
    generatedAt: normalizedAt,
  };
  return { root, mode: detectedMode, hierarchyCandidates, issues, issueGroups, preview: prepared.slice(0, 50), summary, normalizedAt, source, diagnostic };
}

function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadExcelBomJson(result: ExcelNormalizationResult) {
  download(`${result.source.fileName.replace(/\.xlsx$/i, "")}-normalized-bom.json`, result);
}

export { mappingConfidenceFor } from "@/lib/excel-engine/column-mapper";
export { downloadExcelDiagnostics } from "@/lib/excel-engine/diagnostics";
export { excelFields };
