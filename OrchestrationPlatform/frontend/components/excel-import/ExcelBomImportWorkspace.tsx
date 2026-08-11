"use client";

import { useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconFileSpreadsheet,
  IconRefresh,
  IconTable,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import {
  downloadExcelBomJson,
  excelFieldLabels,
  inspectExcelWorkbook,
  normalizeExcelBom,
  suggestExcelMapping,
} from "@/lib/excel-bom";
import type { TreeNodeData } from "@/types/bom-comparison";
import type {
  ExcelColumnMapping,
  ExcelHierarchyMode,
  ExcelMappedField,
  ExcelNormalizationResult,
  ExcelWorkbookData,
  ExcelWorksheetData,
} from "@/types/excel-bom";

const levelFields: ExcelMappedField[] = ["itemId", "level", "name", "quantity", "revision", "unit"];
const parentFields: ExcelMappedField[] = ["itemId", "parentItemId", "name", "quantity", "revision", "unit"];

function resolvedMode(mode: ExcelHierarchyMode, mapping: ExcelColumnMapping): Exclude<ExcelHierarchyMode, "auto"> {
  return mode === "auto" ? (mapping.level ? "level" : "parent-child") : mode;
}

function mappingReady(mode: Exclude<ExcelHierarchyMode, "auto">, mapping: ExcelColumnMapping) {
  return Boolean(mapping.itemId && (mode === "level" ? mapping.level : mapping.parentItemId));
}

function normalize(
  workbook: ExcelWorkbookData,
  sheet: ExcelWorksheetData,
  mapping: ExcelColumnMapping,
  mode: ExcelHierarchyMode,
) {
  return normalizeExcelBom({ workbook, sheet, mapping, mode });
}

export function ExcelBomImportWorkspace({ onBomReady }: { onBomReady: (root: TreeNodeData | null) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [workbook, setWorkbook] = useState<ExcelWorkbookData | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [mapping, setMapping] = useState<ExcelColumnMapping | null>(null);
  const [mode, setMode] = useState<ExcelHierarchyMode>("auto");
  const [result, setResult] = useState<ExcelNormalizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [mappingOpen, setMappingOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);

  const sheet = workbook?.worksheets.find((item) => item.name === sheetName) ?? null;
  const modeResolved = mapping ? resolvedMode(mode, mapping) : "level";
  const relevantFields = modeResolved === "level" ? levelFields : parentFields;
  const mappedCount = mapping ? relevantFields.filter((field) => Boolean(mapping[field])).length : 0;
  const requiredReady = mapping ? mappingReady(modeResolved, mapping) : false;
  const canLoad = Boolean(result?.root && !result.summary.errors);
  const previewRows = useMemo(() => sheet?.rows.slice(0, 8) ?? [], [sheet]);

  const runValidation = (
    nextWorkbook = workbook,
    nextSheet = sheet,
    nextMapping = mapping,
    nextMode = mode,
  ) => {
    if (!nextWorkbook || !nextSheet || !nextMapping) return null;
    const normalized = normalize(nextWorkbook, nextSheet, nextMapping, nextMode);
    setResult(normalized);
    setIssuesOpen(normalized.summary.errors > 0);
    return normalized;
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setLoading(true);
    setError("");
    setLoaded(false);
    setResult(null);
    onBomReady(null);
    try {
      const inspected = await inspectExcelWorkbook(file);
      const first = inspected.worksheets[0];
      const suggested = suggestExcelMapping(first.headers);
      setWorkbook(inspected);
      setSheetName(first.name);
      setMapping(suggested);
      setMode("auto");
      setMappingOpen(false);
      setPreviewOpen(false);
      runValidation(inspected, first, suggested, "auto");
    } catch (cause) {
      setWorkbook(null);
      setMapping(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  const selectSheet = (name: string) => {
    const next = workbook?.worksheets.find((item) => item.name === name);
    if (!workbook || !next) return;
    const suggested = suggestExcelMapping(next.headers);
    setSheetName(name);
    setMapping(suggested);
    setLoaded(false);
    onBomReady(null);
    runValidation(workbook, next, suggested, mode);
  };

  const changeMode = (nextMode: ExcelHierarchyMode) => {
    setMode(nextMode);
    setLoaded(false);
    onBomReady(null);
    if (workbook && sheet && mapping) runValidation(workbook, sheet, mapping, nextMode);
  };

  const updateMapping = (field: ExcelMappedField, value: string) => {
    if (!workbook || !sheet || !mapping) return;
    const next = { ...mapping, [field]: value };
    setMapping(next);
    setLoaded(false);
    onBomReady(null);
  };

  const reset = () => {
    setWorkbook(null);
    setSheetName("");
    setMapping(null);
    setResult(null);
    setLoaded(false);
    setError("");
    setMappingOpen(false);
    setPreviewOpen(false);
    setIssuesOpen(false);
    onBomReady(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!workbook) {
    return (
      <section className="space-y-3">
        <div className="flex min-h-[300px] items-center justify-center rounded-[22px] border border-dashed border-slate-700 bg-slate-950/35 p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[.07] text-cyan-300">
              <IconFileSpreadsheet className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-slate-100">Import an Excel BOM</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">Select an .xlsx workbook. The platform will detect the worksheet, hierarchy and required columns before loading the BOM.</p>
            <button type="button" disabled={loading} onClick={() => inputRef.current?.click()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
              <IconUpload className="h-4 w-4" />{loading ? "Reading workbook" : "Choose workbook"}
            </button>
            <p className="mt-3 text-[10px] uppercase tracking-wide text-slate-700">XLSX · Processed locally</p>
          </div>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void loadFile(event.target.files?.[0])} />
        {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void loadFile(event.target.files?.[0])} />

      <div className="rounded-[22px] border border-slate-800 bg-slate-950/55 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-600">Excel BOM</p>
            <h3 className="mt-1 truncate text-base font-semibold text-slate-100">{workbook.fileName}</h3>
            <p className="mt-1 text-xs text-slate-500">{sheet?.name} · {sheet?.rows.length ?? 0} data rows · {sheet?.headers.length ?? 0} columns</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-400 hover:text-white">Replace file</button>
            <button type="button" onClick={reset} className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-500 hover:text-white"><IconX className="mr-1.5 inline h-4 w-4" />Reset</button>
          </div>
        </div>

        {sheet && mapping ? (
          <div className="mt-4 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_repeat(3,minmax(110px,.65fr))]">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Worksheet
              <select value={sheetName} onChange={(event) => selectSheet(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-200">
                {workbook.worksheets.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Hierarchy
              <select value={mode} onChange={(event) => changeMode(event.target.value as ExcelHierarchyMode)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-200">
                <option value="auto">Auto · {modeResolved === "level" ? "Level based" : "Parent and child"}</option>
                <option value="level">Level based</option>
                <option value="parent-child">Parent and child</option>
              </select>
            </label>
            <Stat label="Header row" value={sheet.headerRow} />
            <Stat label="Mapping" value={requiredReady ? "Ready" : "Review"} tone={requiredReady ? "ok" : "warn"} />
            <Stat label="Validation" value={result?.summary.errors ? `${result.summary.errors} errors` : "Passed"} tone={result?.summary.errors ? "error" : "ok"} />
          </div>
        ) : null}
      </div>

      {sheet && mapping ? (
        <>
          <Disclosure
            title="Column mapping"
            meta={`${mappedCount} of ${relevantFields.length} fields mapped`}
            open={mappingOpen}
            onToggle={() => setMappingOpen((value) => !value)}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relevantFields.map((field) => (
                <label key={field} className="text-xs font-semibold text-slate-400">
                  {excelFieldLabels[field]}{field === "itemId" || (field === "level" && modeResolved === "level") || (field === "parentItemId" && modeResolved === "parent-child") ? <span className="text-rose-400"> *</span> : null}
                  <select value={mapping[field]} onChange={(event) => updateMapping(field, event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100">
                    <option value="">Not mapped</option>
                    {sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => runValidation()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-xs font-semibold text-slate-200 hover:border-cyan-500/50"><IconRefresh className="h-4 w-4" />Revalidate</button>
            </div>
          </Disclosure>

          <Disclosure title="Preview rows" meta={`${sheet.rows.length} data rows detected`} open={previewOpen} onToggle={() => setPreviewOpen((value) => !value)}>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-500"><tr><th className="px-3 py-2">Row</th>{sheet.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-800">{previewRows.map((row) => <tr key={row.rowNumber}><td className="px-3 py-2 text-slate-600">{row.rowNumber}</td>{sheet.headers.map((header) => <td key={header} className="max-w-[220px] truncate px-3 py-2 text-slate-300">{row.values[header] || "-"}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </Disclosure>
        </>
      ) : null}

      {result ? (
        <div className={`rounded-2xl border p-4 ${result.summary.errors ? "border-rose-500/30 bg-rose-500/[.05]" : "border-slate-800 bg-slate-950/55"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${result.summary.errors ? "bg-rose-500/10 text-rose-400" : "bg-emerald-400/10 text-emerald-400"}`}>
                  {result.summary.errors ? <IconAlertTriangle className="h-4 w-4" /> : <IconCheck className="h-4 w-4" />}
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">{result.summary.errors ? `${result.summary.errors} issues require attention` : loaded ? "Excel BOM loaded" : "Ready to load"}</h4>
                  <p className="mt-0.5 text-xs text-slate-500">{result.summary.items} occurrences · {result.summary.assemblies} assemblies · {result.summary.levels} levels · {result.mode === "level" ? "Level based" : "Parent and child"}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadExcelBomJson(result)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300"><IconDownload className="h-4 w-4" />Export JSON</button>
              {result.issues.length ? <button type="button" onClick={() => setIssuesOpen((value) => !value)} className="h-9 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300">{issuesOpen ? "Hide issues" : `Review ${result.issues.length} issues`}</button> : null}
              <button type="button" disabled={!canLoad || loaded} onClick={() => { onBomReady(result.root); setLoaded(true); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white disabled:bg-slate-800 disabled:text-slate-600"><IconCheck className="h-4 w-4" />{loaded ? "Loaded" : "Load BOM"}</button>
            </div>
          </div>

          {result.summary.warnings && !issuesOpen ? (
            <button type="button" onClick={() => setIssuesOpen(true)} className="mt-3 text-left text-xs text-amber-400">{result.summary.warnings} warning{result.summary.warnings === 1 ? "" : "s"} detected. Review before loading if required.</button>
          ) : null}

          {issuesOpen && result.issues.length ? (
            <div className="mt-4 max-h-64 overflow-y-auto border-t border-slate-800 pt-3">
              <div className="space-y-2">{result.issues.map((issue, index) => (
                <div key={`${issue.code}-${issue.rowNumber}-${index}`} className="flex gap-3 rounded-lg bg-slate-900/70 px-3 py-2">
                  <IconAlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === "error" ? "text-rose-400" : issue.severity === "warning" ? "text-amber-400" : "text-slate-500"}`} />
                  <div><p className="text-xs text-slate-300">{issue.message}</p><p className="mt-0.5 text-[10px] text-slate-600">{issue.rowNumber ? `Row ${issue.rowNumber}` : "Workbook"}{issue.itemId ? ` · ${issue.itemId}` : ""}</p></div>
                </div>
              ))}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
    </section>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "ok" | "warn" | "error" }) {
  const color = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : tone === "error" ? "text-rose-400" : "text-slate-200";
  return <div className="flex min-h-14 flex-col justify-center border-l border-slate-800 pl-3"><span className="text-[9px] font-semibold uppercase tracking-wide text-slate-700">{label}</span><b className={`mt-1 text-xs ${color}`}>{value}</b></div>;
}

function Disclosure({ title, meta, open, onToggle, children }: { title: string; meta: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/45">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-900/50">
        <span><b className="block text-sm text-slate-200">{title}</b><span className="mt-0.5 block text-[11px] text-slate-600">{meta}</span></span>
        {open ? <IconChevronDown className="h-4 w-4 text-slate-500" /> : <IconChevronRight className="h-4 w-4 text-slate-500" />}
      </button>
      {open ? <div className="border-t border-slate-800 p-4">{children}</div> : null}
    </section>
  );
}
