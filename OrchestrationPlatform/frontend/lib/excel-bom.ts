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
} from "@/types/excel-bom";

const FIELDS: ExcelMappedField[] = [
  "itemId",
  "parentItemId",
  "name",
  "quantity",
  "level",
  "revision",
  "unit",
];

const ALIASES: Record<ExcelMappedField, string[]> = {
  itemId: ["part number", "part no", "part id", "item number", "item no", "item id", "material id", "component id", "child part", "child item", "child number"],
  parentItemId: ["parent part", "parent number", "parent no", "parent id", "parent item", "parent item id", "assembly", "assembly id"],
  name: ["description", "part name", "item name", "item description", "component description", "component name", "name"],
  quantity: ["quantity", "qty", "component quantity", "usage quantity", "amount"],
  level: ["level", "bom level", "indent level", "hierarchy level", "depth"],
  revision: ["revision", "rev", "version", "rev id"],
  unit: ["unit", "uom", "unit of measure", "base unit"],
};

export const excelFieldLabels: Record<ExcelMappedField, string> = {
  itemId: "Item ID",
  parentItemId: "Parent Item ID",
  name: "Name",
  quantity: "Quantity",
  level: "BOM Level",
  revision: "Revision",
  unit: "Unit of measure",
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[_./-]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueHeaders(values: string[]) {
  const used = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `Column ${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

function cellText(cell: ExcelJS.Cell) {
  if (cell.value == null) return "";
  if (typeof cell.value === "object" && "result" in cell.value) {
    const result = cell.value.result;
    return result == null ? cell.text.trim() : String(result).trim();
  }
  return cell.text.trim();
}

function detectHeaderRow(sheet: ExcelJS.Worksheet) {
  let bestRow = 1;
  let bestScore = -1;
  const limit = Math.min(Math.max(sheet.rowCount, 1), 25);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const values: string[] = [];
    sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell) => values.push(cellText(cell)));
    const normalized = values.map(normalizeHeader).filter(Boolean);
    const aliasHits = normalized.filter((header) =>
      FIELDS.some((field) => ALIASES[field].some((alias) => header === alias || header.includes(alias))),
    ).length;
    const score = aliasHits * 10 + Math.min(normalized.length, 8);
    if (score > bestScore) {
      bestScore = score;
      bestRow = rowNumber;
    }
  }
  return bestRow;
}

function readWorksheet(sheet: ExcelJS.Worksheet): ExcelWorksheetData {
  const headerRow = detectHeaderRow(sheet);
  const header = sheet.getRow(headerRow);
  const width = Math.max(sheet.columnCount, header.cellCount, header.actualCellCount);
  const headers = uniqueHeaders(Array.from({ length: width }, (_, index) => cellText(header.getCell(index + 1))));
  const rows: ExcelWorksheetData["rows"] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries(headers.map((name, index) => [name, cellText(row.getCell(index + 1))]));
    if (Object.values(values).some((value) => value.trim())) rows.push({ rowNumber, values });
  }
  return { name: sheet.name, rowCount: sheet.rowCount, columnCount: width, headerRow, headers, rows };
}

export async function inspectExcelWorkbook(file: File): Promise<ExcelWorkbookData> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Only .xlsx workbooks are supported. Save legacy .xls files as .xlsx and try again.");
  const workbook = new ExcelJS.Workbook();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheets = workbook.worksheets.filter((sheet) => sheet.actualRowCount > 0).map(readWorksheet);
  if (!worksheets.length) throw new Error("The workbook does not contain a populated worksheet.");
  return { fileName: file.name, worksheets };
}

export function suggestExcelMapping(headers: string[]): ExcelColumnMapping {
  const mapping = Object.fromEntries(FIELDS.map((field) => [field, ""])) as ExcelColumnMapping;
  for (const field of FIELDS) {
    const aliases = ALIASES[field];
    const exact = headers.find((header) => aliases.includes(normalizeHeader(header)));
    const partial = headers.find((header) => aliases.some((alias) => normalizeHeader(header).includes(alias)));
    mapping[field] = exact ?? partial ?? "";
  }
  return mapping;
}

function parseQuantity(value: string) {
  if (!value.trim()) return { value: 1, defaulted: true, valid: true };
  const normalized = Number(value.replace(/,/g, ".").replace(/[^0-9.+-]/g, ""));
  return { value: normalized, defaulted: false, valid: Number.isFinite(normalized) && normalized > 0 };
}

function nodeFromRow(row: ExcelWorksheetData["rows"][number], mapping: ExcelColumnMapping, occurrenceId: string): TreeNodeData {
  const itemId = row.values[mapping.itemId]?.trim();
  const name = row.values[mapping.name]?.trim() || itemId || `Row ${row.rowNumber}`;
  const quantity = parseQuantity(row.values[mapping.quantity] ?? "").value;
  const attributes: Record<string, string | number | boolean> = {
    "Item ID": itemId || `ROW-${row.rowNumber}`,
    Quantity: quantity,
    "Source Row": row.rowNumber,
  };
  const revision = row.values[mapping.revision]?.trim();
  const unit = row.values[mapping.unit]?.trim();
  if (revision) attributes.Revision = revision;
  if (unit) attributes.UOM = unit;
  return { id: occurrenceId, name, attributes, children: [] };
}

function summary(root: TreeNodeData | null, issues: ExcelValidationIssue[], ignoredRows: number) {
  let items = 0, assemblies = 0, leaves = 0, levels = 0;
  const queue: Array<[TreeNodeData, number]> = root ? [[root, 1]] : [];
  while (queue.length) {
    const [node, level] = queue.shift()!;
    items += 1;
    levels = Math.max(levels, level);
    const children = node.children ?? [];
    if (children.length) assemblies += 1;
    else leaves += 1;
    queue.push(...children.map((child) => [child, level + 1] as [TreeNodeData, number]));
  }
  return {
    items,
    assemblies,
    leaves,
    levels,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    ignoredRows,
  };
}

function commonIssues(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping) {
  const issues: ExcelValidationIssue[] = [];
  const usable = sheet.rows.filter((row) => Object.values(row.values).some((value) => value.trim()));
  for (const row of usable) {
    const itemId = row.values[mapping.itemId]?.trim();
    if (!itemId) issues.push({ severity: "error", code: "missing-item", message: "Item ID is missing.", rowNumber: row.rowNumber });
    const qty = parseQuantity(row.values[mapping.quantity] ?? "");
    if (!qty.valid) issues.push({ severity: "error", code: "invalid-quantity", message: "Quantity must be a positive number.", rowNumber: row.rowNumber, itemId });
    else if (qty.defaulted) issues.push({ severity: "warning", code: "default-quantity", message: "Quantity was empty and defaulted to 1.", rowNumber: row.rowNumber, itemId });
    if (!row.values[mapping.name]?.trim()) issues.push({ severity: "warning", code: "missing-name", message: "Description is empty; Item ID will be used as the display name.", rowNumber: row.rowNumber, itemId });
  }
  return issues;
}

function buildLevelTree(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping, issues: ExcelValidationIssue[]) {
  const stack: Array<{ level: number; node: TreeNodeData }> = [];
  const roots: TreeNodeData[] = [];
  let previousLevel = 0;
  for (const row of sheet.rows) {
    const itemId = row.values[mapping.itemId]?.trim();
    if (!itemId) continue;
    const rawLevel = row.values[mapping.level]?.trim();
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level < 0) {
      issues.push({ severity: "error", code: "invalid-level", message: "BOM Level must be a non-negative whole number.", rowNumber: row.rowNumber, itemId });
      continue;
    }
    if (stack.length && level > previousLevel + 1) issues.push({ severity: "error", code: "level-jump", message: `Hierarchy jumps from level ${previousLevel} to ${level}.`, rowNumber: row.rowNumber, itemId });
    const node = nodeFromRow(row, mapping, `excel-row-${row.rowNumber}-${itemId}`);
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    if (!stack.length) roots.push(node);
    else stack.at(-1)!.node.children!.push(node);
    stack.push({ level, node });
    previousLevel = level;
  }
  if (!roots.length) issues.push({ severity: "error", code: "no-root", message: "No root item could be reconstructed from the level hierarchy." });
  if (roots.length > 1) issues.push({ severity: "warning", code: "multiple-roots", message: `${roots.length} top-level items were found; a neutral Excel BOM root was created.` });
  return roots.length === 1 ? roots[0] : roots.length ? { id: "excel-root", name: "Excel BOM", attributes: { "Root count": roots.length }, children: roots } : null;
}

function buildParentTree(sheet: ExcelWorksheetData, mapping: ExcelColumnMapping, issues: ExcelValidationIssue[]) {
  const rows = sheet.rows.filter((row) => row.values[mapping.itemId]?.trim());
  const occurrences = rows.map((row) => ({
    row,
    itemId: row.values[mapping.itemId].trim(),
    parentId: row.values[mapping.parentItemId]?.trim() || "",
  }));
  const knownIds = new Set(occurrences.map((entry) => entry.itemId));
  const referencedParents = new Set(occurrences.map((entry) => entry.parentId).filter(Boolean));
  const definitions = new Map<string, ExcelWorksheetData["rows"][number]>();
  occurrences.forEach((entry) => definitions.set(entry.itemId, entry.row));
  const adjacency = new Map<string, typeof occurrences>();
  occurrences.forEach((entry) => {
    const values = adjacency.get(entry.parentId) ?? [];
    values.push(entry);
    adjacency.set(entry.parentId, values);
    if (entry.parentId === entry.itemId) issues.push({ severity: "error", code: "self-parent", message: "An item cannot be its own parent.", rowNumber: entry.row.rowNumber, itemId: entry.itemId });
  });
  for (const parentId of referencedParents) {
    if (!knownIds.has(parentId)) issues.push({ severity: "warning", code: "implicit-parent", message: `Parent ${parentId} has no standalone row and will be synthesized.`, itemId: parentId });
  }
  const rootIds = new Set<string>();
  occurrences.filter((entry) => !entry.parentId).forEach((entry) => rootIds.add(entry.itemId));
  referencedParents.forEach((parentId) => {
    if (!occurrences.some((entry) => entry.itemId === parentId && entry.parentId)) rootIds.add(parentId);
  });
  const visiting = new Set<string>();
  const build = (itemId: string, path: string): TreeNodeData => {
    if (visiting.has(itemId)) {
      issues.push({ severity: "error", code: "cycle", message: `Circular parent relationship detected at ${itemId}.`, itemId });
      return { id: `${path}-cycle`, name: itemId, attributes: { "Item ID": itemId, Cycle: true }, children: [] };
    }
    visiting.add(itemId);
    const definition = definitions.get(itemId);
    const node = definition
      ? nodeFromRow(definition, mapping, `${path}-${definition.rowNumber}-${itemId}`)
      : { id: `${path}-synthetic-${itemId}`, name: itemId, attributes: { "Item ID": itemId, Synthetic: true }, children: [] as TreeNodeData[] };
    node.children = (adjacency.get(itemId) ?? []).filter((entry) => entry.itemId !== itemId).map((entry, index) => build(entry.itemId, `${path}-${index}`));
    visiting.delete(itemId);
    return node;
  };
  const roots = [...rootIds].map((itemId, index) => build(itemId, `excel-root-${index}`));
  if (!roots.length) issues.push({ severity: "error", code: "no-root", message: "No root item could be reconstructed from the parent-child relationships." });
  if (roots.length > 1) issues.push({ severity: "warning", code: "multiple-roots", message: `${roots.length} root items were found; a neutral Excel BOM root was created.` });
  return roots.length === 1 ? roots[0] : roots.length ? { id: "excel-root", name: "Excel BOM", attributes: { "Root count": roots.length }, children: roots } : null;
}

export function normalizeExcelBom(args: {
  workbook: ExcelWorkbookData;
  sheet: ExcelWorksheetData;
  mapping: ExcelColumnMapping;
  mode: ExcelHierarchyMode;
}): ExcelNormalizationResult {
  const { workbook, sheet, mapping } = args;
  const issues = commonIssues(sheet, mapping);
  if (!mapping.itemId) issues.unshift({ severity: "error", code: "mapping-item", message: "Map an Item ID column before validation." });
  const detectedMode = args.mode === "auto" ? (mapping.level ? "level" : "parent-child") : args.mode;
  if (detectedMode === "level" && !mapping.level) issues.unshift({ severity: "error", code: "mapping-level", message: "Level-based hierarchy requires a BOM Level column." });
  if (detectedMode === "parent-child" && !mapping.parentItemId) issues.unshift({ severity: "error", code: "mapping-parent", message: "Parent-child hierarchy requires a Parent Item ID column." });
  let root: TreeNodeData | null = null;
  if (!issues.some((issue) => issue.code.startsWith("mapping-"))) root = detectedMode === "level" ? buildLevelTree(sheet, mapping, issues) : buildParentTree(sheet, mapping, issues);
  const ignoredRows = Math.max(0, sheet.rowCount - sheet.headerRow - sheet.rows.length);
  return {
    root,
    mode: detectedMode,
    issues,
    summary: summary(root, issues, ignoredRows),
    normalizedAt: new Date().toISOString(),
    source: { fileName: workbook.fileName, sheetName: sheet.name, headerRow: sheet.headerRow, mapping },
  };
}

export function downloadExcelBomJson(result: ExcelNormalizationResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${result.source.fileName.replace(/\.xlsx$/i, "")}-normalized-bom.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
