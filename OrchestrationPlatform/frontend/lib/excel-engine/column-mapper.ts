import type { ExcelColumnMapping, ExcelConfidence, ExcelMappedField, ExcelMappingCandidate, ExcelWorksheetData } from "@/types/excel-bom";
import { excelAliases, excelFields, normalizeExcelHeader, tokenSimilarity } from "@/lib/excel-engine/header-normalizer";

function confidence(score: number): ExcelConfidence {
  return score >= 80 ? "high" : score >= 55 ? "medium" : "low";
}

function fieldProfileScore(field: ExcelMappedField, profile: ExcelWorksheetData["profiles"][number]) {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => { score += points; reasons.push(reason); };
  if (profile.completeness >= 0.85) add(field === "itemId" ? 16 : 6, "Column is consistently populated");
  if (field === "itemId") {
    if (profile.identifierRatio >= 0.8) add(20, "Values resemble engineering identifiers");
    if (profile.unique >= Math.max(2, profile.nonBlank * 0.1)) add(6, "Values have useful identifier diversity");
    if (profile.indentationRatio >= 0.25) add(8, "Indentation may encode BOM hierarchy");
    if (profile.quantityRatio > 0.98 && profile.numericRatio > 0.98 && profile.unique < 20) score -= 20;
  }
  if (field === "level") {
    if (profile.integerRatio >= 0.9) add(24, "Values are non-negative whole numbers");
    if (profile.unique <= 20 && profile.unique >= 2) add(12, "Small numeric range is consistent with BOM depth");
  }
  if (field === "quantity") {
    if (profile.quantityRatio >= 0.85) add(22, "Values parse as engineering quantities");
  }
  if (field === "path" && profile.pathRatio >= 0.5) add(28, "Values resemble structured hierarchy paths");
  if (field === "name" && profile.identifierRatio >= 0.5 && profile.numericRatio < 0.2) add(8, "Values are descriptive text");
  if (field === "parentItemId" && profile.identifierRatio >= 0.75) add(12, "Values resemble parent engineering identifiers");
  if (field === "revision" && profile.nonBlank && profile.unique <= profile.nonBlank) add(4, "Values can represent revisions");
  return { score, reasons };
}

function scoreCandidate(field: ExcelMappedField, sheet: ExcelWorksheetData, header: string): ExcelMappingCandidate {
  const normalized = normalizeExcelHeader(header);
  const aliases = excelAliases[field];
  const profile = sheet.profiles.find((item) => item.header === header)!;
  const reasons: string[] = [];
  let score = 0;
  if (aliases.includes(normalized)) { score += normalized === "number" && field === "itemId" ? 58 : 76; reasons.push("Header is a recognized field name"); }
  else {
    const similarity = Math.max(...aliases.map((alias) => tokenSimilarity(normalized, alias)));
    if (similarity >= 0.99) { score += 68; reasons.push("Header matches a known synonym"); }
    else if (similarity >= 0.66) { score += 42; reasons.push("Header is similar to a known synonym"); }
    else if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) { score += 30; reasons.push("Header contains a recognized engineering term"); }
  }
  const profiled = fieldProfileScore(field, profile);
  score += profiled.score;
  reasons.push(...profiled.reasons);
  const capped = Math.max(0, Math.min(100, score));
  return { field, header, score: capped, confidence: confidence(capped), reasons: [...new Set(reasons)].slice(0, 4), samples: profile.samples };
}

export function inferExcelMappings(sheet: ExcelWorksheetData) {
  const candidates: Partial<Record<ExcelMappedField, ExcelMappingCandidate[]>> = {};
  for (const field of excelFields) {
    candidates[field] = sheet.headers.map((header) => scoreCandidate(field, sheet, header)).sort((a, b) => b.score - a.score);
  }
  sheet.mappingCandidates = candidates;
  const mapping = Object.fromEntries(excelFields.map((field) => [field, ""])) as ExcelColumnMapping;
  const used = new Set<string>();
  const priority: ExcelMappedField[] = ["level", "parentItemId", "quantity", "name", "revision", "unit", "path", "findNumber", "lineNumber", "referenceDesignator", "lifecycleState", "itemId"];
  for (const field of priority) {
    const threshold = field === "itemId" ? 52 : 58;
    const best = candidates[field]?.find((candidate) => candidate.score >= threshold && !used.has(candidate.header));
    if (best) { mapping[field] = best.header; used.add(best.header); }
  }
  if (!mapping.itemId) {
    const best = candidates.itemId?.find((candidate) => candidate.score >= 48 && !used.has(candidate.header));
    if (best) mapping.itemId = best.header;
  }
  return { mapping, candidates };
}

export function mappingConfidenceFor(field: ExcelMappedField, header: string, sheet: ExcelWorksheetData) {
  return sheet.mappingCandidates[field]?.find((candidate) => candidate.header === header) ?? null;
}
