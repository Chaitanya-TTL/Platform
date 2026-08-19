"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { IconArrowsMaximize, IconFocus2, IconRefresh, IconSearch, IconTopologyStar3 } from "@tabler/icons-react";
import { useFederatedItemSearch } from "@/hooks/item-explorer/useFederatedItemSearch";
import { LatticeArena } from "@/components/lattice/LatticeArena";
import { LatticeInspector } from "@/components/lattice/LatticeInspector";
import { AccessibleEvidenceExplorer } from "@/components/lattice/AccessibleEvidenceExplorer";
import type { EnterpriseSource, ItemSearchCandidate, ResolvedItemContext, SearchMode, SourceSearchResult } from "@/types/item-explorer";
import type { LatticeInspectorTarget, LatticeLens } from "@/types/lattice";

const initialResults: SourceSearchResult[] = ["teamcenter","windchill","sap","configit"].map((source) => ({ source: source as EnterpriseSource, status: "idle", candidates: [], durationMs: 0, capabilities: { nameSearch: source === "windchill" || source === "sap", itemIdSearch: true, nearbyIds: source === "sap", live: source === "windchill" || source === "sap" } }));
const lenses: Array<{ id: LatticeLens; label: string; available: boolean }> = [
  { id:"identity", label:"Identity", available:true }, { id:"structure", label:"Structure", available:false }, { id:"change", label:"Change", available:false }, { id:"business-impact", label:"Business impact", available:false }, { id:"configuration", label:"Configuration", available:false }, { id:"requirements", label:"Requirements", available:false }, { id:"data-quality", label:"Data quality", available:false }, { id:"timeline", label:"Timeline", available:false },
];

export function LatticeWorkspace() {
  const federated = useFederatedItemSearch();
  const [query,setQuery] = useState(""); const [mode,setMode] = useState<SearchMode>("name"); const [selections,setSelections] = useState<ResolvedItemContext>({}); const [target,setTarget] = useState<LatticeInspectorTarget>(null); const [lens,setLens] = useState<LatticeLens>("identity"); const [fallback,setFallback] = useState(false); const [reducedMotion,setReducedMotion] = useState(false);
  const arena = useRef<HTMLDivElement>(null); const fitRef = useRef<() => void>(() => undefined);
  useEffect(() => { setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches); try { const canvas=document.createElement("canvas"); if(!(canvas.getContext("webgl2") || canvas.getContext("webgl"))) setFallback(true); } catch { setFallback(true); } try { const saved=sessionStorage.getItem("lattice-session-v1"); if(saved) setSelections(JSON.parse(saved)); } catch {} }, []);
  useEffect(() => { try { sessionStorage.setItem("lattice-session-v1",JSON.stringify(selections)); } catch {} }, [selections]);
  const results = federated.data?.results ?? initialResults;
  const selectedIds = useMemo(() => Object.fromEntries(Object.entries(selections).map(([source,value]) => [source,value?.candidate.candidateId])) as Partial<Record<EnterpriseSource,string>>, [selections]);
  const selectedList = Object.values(selections).filter(Boolean); const centerLabel = selectedList[0]?.candidate.name || (query.trim() ? query.trim() : "Search a product");
  const run = async () => { if(query.trim().length < (mode === "name" ? 3 : 1)) return; setSelections({}); setTarget(null); await federated.search(query.trim(),mode); };
  const choose = (candidate: ItemSearchCandidate) => { setSelections((current) => ({ ...current,[candidate.source]:{ source:candidate.source,candidate,selectedBy:"user",selectedAt:new Date().toISOString(),selectionScope:"session" } })); setTarget({kind:"source",source:candidate.source}); };
  const clearSource = (source: EnterpriseSource) => setSelections((current) => { const next={...current}; delete next[source]; return next; });
  const newSearch = () => { federated.clear(); setSelections({}); setQuery(""); setMode("name"); setTarget(null); };
  const fullscreen = async () => { if(!arena.current) return; if(document.fullscreenElement) await document.exitFullscreen(); else await arena.current.requestFullscreen(); };
  return <main className="min-h-[calc(100vh-64px)] bg-[#020817] text-white">
    <div ref={arena} className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-[#020817]">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 p-4 sm:p-5">
        <div className="pointer-events-auto"><div className="flex items-center gap-2"><IconTopologyStar3 className="h-5 w-5 text-cyan-300"/><h1 className="text-lg font-semibold tracking-tight">Lattice</h1></div><p className="mt-1 text-xs text-slate-500">Spatial enterprise product intelligence</p></div>
        <div className="pointer-events-auto flex gap-2"><Tool label="Fit arena" onClick={() => fitRef.current()}><IconFocus2/></Tool><Tool label="New search" onClick={newSearch}><IconRefresh/></Tool><Tool label="Fullscreen" onClick={() => void fullscreen()}><IconArrowsMaximize/></Tool></div>
      </header>
      <div className="absolute inset-0 z-0">{fallback ? <AccessibleEvidenceExplorer results={results} selections={selections} onInspect={(source) => setTarget({kind:"source",source})}/> : <LatticeArena results={results} selected={selectedIds} centerLabel={centerLabel} active={target} reducedMotion={reducedMotion} onInspect={setTarget} onFitReady={(fit) => { fitRef.current=fit; }}/>}</div>
      <form onSubmit={(event) => { event.preventDefault(); void run(); }} className="absolute left-1/2 top-1/2 z-20 w-[min(650px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2">
        <motion.div layout className="rounded-2xl border border-cyan-500/30 bg-[#061224]/92 p-3 shadow-[0_24px_90px_rgba(6,182,212,.18)] backdrop-blur-xl">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300"><IconSearch className="h-5 w-5"/></span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === "name" ? "Search product name" : "Search source-native Item ID"} className="h-11 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-slate-600"/><button disabled={federated.loading || query.trim().length < (mode === "name" ? 3 : 1)} className="h-10 rounded-lg bg-cyan-600 px-5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40">{federated.loading ? "Searching" : "Search"}</button></div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2"><button type="button" onClick={() => setMode(mode === "name" ? "item-id" : "name")} className="text-xs font-semibold text-cyan-300">Use {mode === "name" ? "Item ID" : "product name"}</button><span className="text-xs text-slate-500">{selectedList.length ? `${selectedList.length} sources resolved` : "Search propagates to every connected application"}</span></div>
        </motion.div>
      </form>
      <nav aria-label="Analytical lenses" className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 gap-1 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/90 p-1.5 shadow-2xl backdrop-blur-xl">{lenses.map((item) => <button key={item.id} disabled={!item.available} title={item.available ? item.label : `${item.label} lens is planned`} onClick={() => setLens(item.id)} className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold ${lens===item.id ? "bg-cyan-600 text-white" : item.available ? "text-slate-400 hover:text-white" : "cursor-not-allowed text-slate-700"}`}>{item.label}</button>)}</nav>
      <button onClick={() => setFallback((value) => !value)} className="absolute bottom-4 left-4 z-30 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white">{fallback ? "Spatial view" : "Accessible list"}</button>
      <LatticeInspector target={target} results={results} selections={selections} centerLabel={centerLabel} onClose={() => setTarget(null)} onSelect={choose} onClear={clearSource} onRetry={federated.retrySource} onItemIdMode={() => setMode("item-id")}/>
    </div>
  </main>;
}
function Tool({ label,onClick,children }: { label:string; onClick:()=>void; children:React.ReactNode }) { return <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/90 text-slate-400 shadow-xl hover:border-cyan-500/40 hover:text-cyan-300 [&_svg]:h-4 [&_svg]:w-4">{children}</button>; }
