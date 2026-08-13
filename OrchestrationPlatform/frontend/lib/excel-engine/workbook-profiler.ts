import ExcelJS from "exceljs";
import type { ExcelColumnProfile, ExcelWorksheetData } from "@/types/excel-bom";
import { excelAliases, excelFields, normalizeExcelHeader } from "@/lib/excel-engine/header-normalizer";
import { indentationDepth, parseEngineeringQuantity, pathDepth } from "@/lib/excel-engine/engineering-values";

export function excelCellText(cell: ExcelJS.Cell) {
  if (cell.value == null) return "";
  if (typeof cell.value === "object" && "result" in cell.value) {
    const result = cell.value.result;
    return String(result ?? cell.text ?? "").trimEnd();
  }
  if (cell.value instanceof Date) return cell.value.toISOString();
  return String(cell.text ?? cell.value).trimEnd();
}

function uniqueHeaders(values: string[]) {
  const used = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `Column ${index + 1}`;
    const key = base.toLowerCase();
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

function headerVocabularyScore(values: string[]) {
  return values.reduce((score, value) => {
    const header = normalizeExcelHeader(value);
    if (!header) return score;
    const exact = excelFields.some((field) => excelAliases[field].includes(header));
    const partial = excelFields.some((field) => excelAliases[field].some((alias) => header.includes(alias) || alias.includes(header)));
    return score + (exact ? 12 : partial ? 5 : 0);
  }, 0);
}

function detectHeaderRow(sheet: ExcelJS.Worksheet) {
  let best = { row: 1, score: -Infinity };
  const limit = Math.min(Math.max(sheet.rowCount, 1), 50);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const width = Math.max(sheet.columnCount, row.cellCount, row.actualCellCount);
    const values = Array.from({ length: width }, (_, index) => excelCellText(row.getCell(index + 1)));
    const populated = values.filter((value) => value.trim());
    if (populated.length < 2) continue;
    const textRatio = populated.filter((value) => Number.isNaN(Number(value.trim()))).length / populated.length;
    let followingRows = 0;
    for (let i = rowNumber + 1; i <= Math.min(sheet.rowCount, rowNumber + 6); i += 1) {
      const cells = Array.from({ length: width }, (_, index) => excelCellText(sheet.getRow(i).getCell(index + 1)));
      if (cells.filter((value) => value.trim()).length >= 2) followingRows += 1;
    }
    const score = headerVocabularyScore(populated) + Math.min(populated.length, 12) + textRatio * 3 + followingRows * 2 - (rowNumber - 1) * 0.08;
    if (score > best.score) best = { row: rowNumber, score };
  }
  const confidence = Math.max(0.35, Math.min(1, best.score / 45));
  return { row: best.row, confidence };
}

function columnProfile(header: string, rows: ExcelWorksheetData["rows"]): ExcelColumnProfile {
  const values = rows.map((row) => row.values[header] ?? "").filter((value) => value.trim());
  const sample = values.slice(0, 1500);
  const ratio = (test: (value: string) => boolean) => sample.length ? sample.filter(test).length / sample.length : 0;
  return {
    header,
    normalizedHeader: normalizeExcelHeader(header),
    nonBlank: values.length,
    unique: new Set(values.map((value) => value.trim())).size,
    completeness: rows.length ? values.length / rows.length : 0,
    numericRatio: ratio((value) => Number.isFinite(Number(value.replace(/,/g, "")))),
    integerRatio: ratio((value) => /^\s*\d+\s*$/.test(value)),
    identifierRatio: ratio((value) => /^[\s]*[A-Za-z0-9][A-Za-z0-9_.\-/ ]{1,80}$/.test(value) && !/^(true|false|yes|no)$/i.test(value.trim())),
    quantityRatio: ratio((value) => parseEngineeringQuantity(value).valid),
    pathRatio: ratio((value) => pathDepth(value) != null && /[.\/\\>-]/.test(value)),
    indentationRatio: ratio((value) => indentationDepth(value) > 0),
    samples: values.slice(0, 5).map((value) => value.trim()),
  };
}

function stateOf(sheet: ExcelJS.Worksheet): ExcelWorksheetData["state"] {
  return sheet.state === "veryHidden" ? "veryHidden" : sheet.state === "hidden" ? "hidden" : "visible";
}

export function profileWorksheet(sheet: ExcelJS.Worksheet): ExcelWorksheetData {
  const detected = detectHeaderRow(sheet);
  const header = sheet.getRow(detected.row);
  const width = Math.max(sheet.columnCount, header.cellCount, header.actualCellCount);
  const headers = uniqueHeaders(Array.from({ length: width }, (_, index) => excelCellText(header.getCell(index + 1))));
  const rows: ExcelWorksheetData["rows"] = [];
  for (let rowNumber = detected.row + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries(headers.map((name, index) => [name, excelCellText(row.getCell(index + 1))]));
    if (Object.values(values).some((value) => value.trim())) rows.push({ rowNumber, outlineLevel: row.outlineLevel ?? 0, values });
  }
  const profiles = headers.map((name) => columnProfile(name, rows));
  const aliasSignal = headers.reduce((sum, value) => sum + headerVocabularyScore([value]), 0);
  const state = stateOf(sheet);
  const sheetScore = Math.max(0, rows.length * 0.02 + aliasSignal + detected.confidence * 20 - (state === "visible" ? 0 : 15));
  const endColumn = width <= 26 ? String.fromCharCode(64 + width) : `C${width}`;
  return {
    name: sheet.name, state, rowCount: sheet.rowCount, dataRowCount: rows.length, columnCount: width,
    headerRow: detected.row, headerConfidence: detected.confidence, dataRegion: `A${detected.row}:${endColumn}${sheet.rowCount}`,
    headers, rows, profiles, mappingCandidates: {}, sheetScore,
  };
}
