/* eslint-disable react-hooks/immutability */
"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  IconAlertTriangle, IconCheck, IconChevronDown, IconChevronRight, IconDownload,
  IconFileDescription, IconFileSpreadsheet, IconRefresh, IconUpload, IconX,
} from "@tabler/icons-react";
import {
  downloadExcelBomJson, downloadExcelDiagnostics, excelFieldLabels, excelFields,
  inspectExcelWorkbook, mappingConfidenceFor, normalizeExcelBom, suggestExcelMapping,
} from "@/lib/excel-bom";
import type { TreeNodeData } from "@/types/bom-comparison";
import type {
  ExcelColumnMapping, ExcelHierarchyMode, ExcelMappedField, ExcelNormalizationResult,
  ExcelWorkbookData, ExcelWorksheetData,
} from "@/types/excel-bom";

const hierarchyLabels: Record<Exclude<ExcelHierarchyMode, "auto">, string> = {
  level: "Explicit level", "parent-child": "Parent and child", indentation: "Indented values",
  path: "Hierarchy path", "level-columns": "Separate level columns", flat: "Flat BOM",
};
const requiredFields = new Set<ExcelMappedField>(["itemId"]);

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
  const [treeOpen, setTreeOpen] = useState(true);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const sheet = workbook?.worksheets.find((item) => item.name === sheetName) ?? null;
  const canLoad = Boolean(result?.root && result.summary.errors === 0);
  const mappedCount = mapping ? excelFields.filter((field) => mapping[field]).length : 0;

  const execute = (nextWorkbook: ExcelWorkbookData, nextSheet: ExcelWorksheetData, nextMapping: ExcelColumnMapping, nextMode: ExcelHierarchyMode) => {
    const normalized = normalizeExcelBom({ workbook: nextWorkbook, sheet: nextSheet, mapping: nextMapping, mode: nextMode });
    setResult(normalized);
    setIssuesOpen(normalized.summary.errors > 0);
    return normalized;
  };

  const loadFile = async (file?: File) => {
    if (!file) return;
    setLoading(true); setError(""); setLoaded(false); setResult(null); onBomReady(null);
    try {
      const inspected = await inspectExcelWorkbook(file);
      const first = inspected.worksheets.find((item) => item.name === inspected.suggestedSheetName) ?? inspected.worksheets[0];
      const suggested = suggestExcelMapping(first);
      setWorkbook(inspected); setSheetName(first.name); setMapping(suggested); setMode("auto");
      setMappingOpen(false); setPreviewOpen(false); setTreeOpen(true);
      execute(inspected, first, suggested, "auto");
    } catch (cause) {
      setWorkbook(null); setMapping(null); setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
  };

  const selectSheet = (name: string) => {
    const next = workbook?.worksheets.find((item) => item.name === name);
    if (!workbook || !next) return;
    const suggested = suggestExcelMapping(next);
    setSheetName(name); setMapping(suggested); setLoaded(false); onBomReady(null);
    execute(workbook, next, suggested, mode);
  };

  const changeMode = (nextMode: ExcelHierarchyMode) => {
    setMode(nextMode); setLoaded(false); onBomReady(null);
    if (workbook && sheet && mapping) execute(workbook, sheet, mapping, nextMode);
  };

  const updateMapping = (field: ExcelMappedField, value: string) => {
    if (!workbook || !sheet || !mapping) return;
    const next = { ...mapping, [field]: value };
    setMapping(next); setLoaded(false); onBomReady(null);
    execute(workbook, sheet, next, mode);
  };

  const reset = () => {
    setWorkbook(null); setSheetName(""); setMapping(null); setResult(null); setLoaded(false); setError("");
    setMappingOpen(false); setPreviewOpen(false); setTreeOpen(true); setIssuesOpen(false); onBomReady(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!workbook) return (
    <section className="space-y-3">
      <div className="flex min-h-[320px] items-center justify-center rounded-[22px] border border-dashed border-slate-700 bg-slate-950/35 p-8 text-center">
        <div className="max-w-lg">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[.07] text-cyan-300"><IconFileSpreadsheet className="h-6 w-6" /></span>
          <h3 className="mt-4 text-lg font-semibold text-slate-100">Import an Excel BOM</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">Upload an .xlsx workbook. The engine will profile worksheets, infer column meaning, detect hierarchy, normalize engineering values and show a review before loading.</p>
          <button type="button" disabled={loading} onClick={() => inputRef.current?.click()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"><IconUpload className="h-4 w-4" />{loading ? "Understanding workbook" : "Choose workbook"}</button>
          <p className="mt-3 text-xs text-slate-600">XLSX · Processed locally · Source values retained</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void loadFile(event.target.files?.[0])} />
      {error ? <ErrorBox>{error}</ErrorBox> : null}
    </section>
  );

  return (
    <section className="space-y-3">
      <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void loadFile(event.target.files?.[0])} />
      <div className="rounded-[22px] border border-slate-800 bg-slate-950/55 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-cyan-400">Excel BOM</p>
            <h3 className="mt-1 truncate text-lg font-semibold text-slate-100">{workbook.fileName}</h3>
            <p className="mt-1 text-sm text-slate-400">Workbook profiled across {workbook.worksheets.length} populated worksheet{workbook.worksheets.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="h-9 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-300 hover:border-slate-600 hover:text-white">Replace file</button>
            <button type="button" onClick={reset} className="h-9 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-400 hover:text-white"><IconX className="mr-1.5 inline h-4 w-4" />Reset</button>
          </div>
        </div>
        {sheet && mapping ? (
          <div className="mt-5 grid gap-3 border-t border-slate-800 pt-5 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_minmax(220px,1fr)_repeat(4,minmax(110px,.55fr))]">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Worksheet
              <select value={sheetName} onChange={(event) => selectSheet(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100">{workbook.worksheets.map((item) => <option key={item.name} value={item.name}>{item.name}{item.state !== "visible" ? ` (${item.state})` : ""}</option>)}</select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hierarchy
              <select value={mode} onChange={(event) => changeMode(event.target.value as ExcelHierarchyMode)} className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100">
                <option value="auto">Auto{result?.mode ? ` · ${hierarchyLabels[result.mode]}` : ""}</option>
                {Object.entries(hierarchyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <Stat label="Header" value={`Row ${sheet.headerRow}`} />
            <Stat label="Rows" value={sheet.dataRowCount.toLocaleString("en-IN")} />
            <Stat label="Mapping" value={mapping.itemId ? "Ready" : "Review"} tone={mapping.itemId ? "ok" : "warn"} />
            <Stat label="Validation" value={result?.summary.errors ? `${result.summary.errors} blocking` : "Ready"} tone={result?.summary.errors ? "error" : "ok"} />
          </div>
        ) : null}
      </div>

      {sheet && mapping && result ? <DetectionSummary sheet={sheet} result={result} /> : null}

      {sheet && mapping ? (
        <Disclosure title="Column mapping" meta={`${mappedCount} fields mapped · review or override any decision`} open={mappingOpen} onToggle={() => setMappingOpen((value) => !value)}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {excelFields.map((field) => {
              const selected = mapping[field];
              const confidence = selected ? mappingConfidenceFor(field, selected, sheet) : null;
              return <label key={field} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm font-semibold text-slate-300">
                <span className="flex items-center justify-between gap-2"><span>{excelFieldLabels[field]}{requiredFields.has(field) ? <span className="text-rose-400"> *</span> : null}</span>{confidence ? <Confidence value={confidence.score} /> : null}</span>
                <select value={selected} onChange={(event) => updateMapping(field, event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"><option value="">Not mapped</option>{sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select>
                {confidence ? <p className="mt-2 text-xs font-normal leading-5 text-slate-500">{confidence.reasons[0]}. Samples: {confidence.samples.slice(0, 2).join(", ") || "none"}</p> : <p className="mt-2 text-xs font-normal text-slate-600">Optional unless required by the selected hierarchy.</p>}
              </label>;
            })}
          </div>
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => execute(workbook, sheet, mapping, mode)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 hover:border-cyan-500/50"><IconRefresh className="h-4 w-4" />Revalidate</button></div>
        </Disclosure>
      ) : null}

      {result ? (
        <>
          <Disclosure title="Normalized preview" meta={`Raw and interpreted values · first ${Math.min(result.preview.length, 50)} rows`} open={previewOpen} onToggle={() => setPreviewOpen((value) => !value)}>
            <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="min-w-full text-left text-sm"><thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Row</th><th className="px-3 py-3">Source Item ID</th><th className="px-3 py-3">Normalized Item ID</th><th className="px-3 py-3">Name</th><th className="px-3 py-3">Qty</th><th className="px-3 py-3">Unit</th><th className="px-3 py-3">Level</th></tr></thead><tbody className="divide-y divide-slate-800">{result.preview.map((row) => <tr key={row.rowNumber}><td className="px-3 py-3 text-slate-500">{row.rowNumber}</td><td className="max-w-[220px] whitespace-pre px-3 py-3 font-mono text-xs text-slate-500">{row.rawItemId || "-"}</td><td className="px-3 py-3 font-mono text-xs font-semibold text-slate-200">{row.itemId}</td><td className="max-w-[280px] truncate px-3 py-3 text-slate-300">{row.name}</td><td className="px-3 py-3 text-slate-300">{row.quantity}</td><td className="px-3 py-3 text-slate-400">{row.unit || "-"}</td><td className="px-3 py-3 text-slate-400">{row.level ?? "-"}</td></tr>)}</tbody></table></div>
          </Disclosure>
          <Disclosure title="Structure preview" meta="A bounded preview of the reconstructed BOM" open={treeOpen} onToggle={() => setTreeOpen((value) => !value)}>{result.root ? <TreePreview root={result.root} /> : <p className="text-sm text-slate-500">Resolve blocking issues to generate a structure preview.</p>}</Disclosure>
        </>
      ) : null}

      {result ? (
        <div className={`rounded-2xl border p-5 ${result.summary.errors ? "border-rose-500/30 bg-rose-500/[.05]" : "border-emerald-500/20 bg-slate-950/55"}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${result.summary.errors ? "bg-rose-500/10 text-rose-400" : "bg-emerald-400/10 text-emerald-400"}`}>{result.summary.errors ? <IconAlertTriangle className="h-5 w-5" /> : <IconCheck className="h-5 w-5" />}</span><div><h4 className="text-base font-semibold text-slate-100">{result.summary.errors ? "Review required before loading" : loaded ? "Excel BOM loaded" : "BOM ready to load"}</h4><p className="mt-1 text-sm text-slate-400">{result.summary.items.toLocaleString("en-IN")} occurrences · {result.summary.uniqueItems.toLocaleString("en-IN")} unique items · {result.summary.roots} root{result.summary.roots === 1 ? "" : "s"} · {result.summary.levels} levels</p></div></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => downloadExcelDiagnostics(result)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-300"><IconFileDescription className="h-4 w-4" />Diagnostics</button><button type="button" onClick={() => downloadExcelBomJson(result)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-300"><IconDownload className="h-4 w-4" />Normalized JSON</button>{result.issueGroups.length ? <button type="button" onClick={() => setIssuesOpen((value) => !value)} className="h-9 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-300">{issuesOpen ? "Hide issues" : `Review ${result.issueGroups.length} issue groups`}</button> : null}<button type="button" disabled={!canLoad || loaded} onClick={() => { onBomReady(result.root); setLoaded(true); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600"><IconCheck className="h-4 w-4" />{loaded ? "Loaded" : "Load BOM"}</button></div>
          </div>
          {issuesOpen && result.issueGroups.length ? <IssueGroups result={result} /> : null}
        </div>
      ) : null}
      {error ? <ErrorBox>{error}</ErrorBox> : null}
    </section>
  );
}

function DetectionSummary({ sheet, result }: { sheet: ExcelWorksheetData; result: ExcelNormalizationResult }) {
  const selected = result.hierarchyCandidates.find((candidate) => candidate.mode === result.mode);
  return <section className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold text-slate-100">Workbook understood</h4><p className="mt-1 text-sm text-slate-400">{sheet.name} · {sheet.dataRegion} · {sheet.dataRowCount.toLocaleString("en-IN")} data rows</p></div><Confidence value={Math.round(Math.min(sheet.headerConfidence * 100, selected?.score ?? 100))} /></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MiniStat label="Hierarchy" value={result.mode ? hierarchyLabels[result.mode] : "Unresolved"} /><MiniStat label="Root assemblies" value={selected?.rootCount ?? result.summary.roots} /><MiniStat label="Maximum depth" value={selected?.maximumDepth ?? result.summary.levels} /><MiniStat label="Blocking errors" value={result.summary.errors} tone={result.summary.errors ? "error" : "ok"} /></div>{selected?.evidence.length ? <p className="mt-3 text-xs leading-5 text-slate-500">Evidence: {selected.evidence.join(" · ")}</p> : null}</section>;
}

function IssueGroups({ result }: { result: ExcelNormalizationResult }) {
  return <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">{result.issueGroups.map((group) => <div key={`${group.severity}-${group.code}`} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3"><IconAlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${group.severity === "error" ? "text-rose-400" : group.severity === "warning" ? "text-amber-400" : "text-slate-500"}`} /><div className="min-w-0"><p className="text-sm text-slate-200">{group.message}</p><p className="mt-1 text-xs text-slate-500">{group.affectedRows ? `${group.affectedRows.toLocaleString("en-IN")} affected row${group.affectedRows === 1 ? "" : "s"}` : "Workbook"}{group.sampleRows.length ? ` · Samples: ${group.sampleRows.join(", ")}` : ""}</p>{group.suggestion ? <p className="mt-1 text-xs font-medium text-cyan-300">{group.suggestion}</p> : null}</div></div>)}</div>;
}

function TreePreview({ root }: { root: TreeNodeData }) {
  let rendered = 0;
  const render = (node: TreeNodeData, depth: number): ReactNode => {
    if (rendered >= 80 || depth > 6) return null;
    rendered += 1;
    const itemId = String(node.attributes?.["Item ID"] ?? "");
    return <li key={node.id} className="relative"><div className="flex min-h-8 items-center gap-2 rounded px-2 text-sm hover:bg-slate-900"><span className="text-slate-700">{depth ? "└" : ""}</span><span className="font-medium text-slate-200">{node.name}</span>{itemId && itemId !== node.name ? <span className="font-mono text-xs text-slate-500">{itemId}</span> : null}<span className="text-xs text-slate-600">{node.children?.length ? `${node.children.length} children` : "part"}</span></div>{node.children?.length && depth < 6 ? <ul className="ml-5 border-l border-slate-800 pl-2">{node.children.slice(0, 12).map((child) => render(child, depth + 1))}{node.children.length > 12 ? <li className="px-2 py-1 text-xs text-slate-600">+ {node.children.length - 12} more children</li> : null}</ul> : null}</li>;
  };
  return <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-3"><ul>{render(root, 0)}</ul>{rendered >= 80 ? <p className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-600">Preview limited to 80 nodes. The complete BOM will load into the workspace.</p> : null}</div>;
}

function Confidence({ value }: { value: number }) { const tone = value >= 80 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : value >= 55 ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-900 text-slate-400"; return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{Math.round(value)}% confidence</span>; }
function MiniStat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "ok" | "error" }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3"><p className="text-xs uppercase tracking-wide text-slate-600">{label}</p><p className={`mt-1 text-sm font-semibold ${tone === "ok" ? "text-emerald-300" : tone === "error" ? "text-rose-300" : "text-slate-200"}`}>{value}</p></div>; }
function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "ok" | "warn" | "error" }) { const color = tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : tone === "error" ? "text-rose-400" : "text-slate-200"; return <div className="flex min-h-14 flex-col justify-center border-l border-slate-800 pl-3"><span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span><b className={`mt-1 text-sm ${color}`}>{value}</b></div>; }
function Disclosure({ title, meta, open, onToggle, children }: { title: string; meta: string; open: boolean; onToggle: () => void; children: ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/45"><button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-900/50"><span><b className="block text-sm text-slate-200">{title}</b><span className="mt-1 block text-xs text-slate-500">{meta}</span></span>{open ? <IconChevronDown className="h-4 w-4 text-slate-500" /> : <IconChevronRight className="h-4 w-4 text-slate-500" />}</button>{open ? <div className="border-t border-slate-800 p-4">{children}</div> : null}</section>; }
function ErrorBox({ children }: { children: ReactNode }) { return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{children}</div>; }
