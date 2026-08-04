"use client";
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ElementRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, GizmoHelper, GizmoViewport, Line, OrbitControls, Text } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";
import { IconChevronLeft, IconChevronRight, IconSparkles } from "@tabler/icons-react";
import * as THREE from "three";
import { RequirementSnapshotCard } from "@/components/bom-requirements/RequirementSnapshotCard";
import { BomThreeBreadcrumbs } from "@/components/bom-visualization/BomThreeBreadcrumbs";
import { BomThreeFindingsPanel } from "@/components/bom-visualization/BomThreeFindingsPanel";
import { BomThreeLensSelector } from "@/components/bom-visualization/BomThreeLensSelector";
import { BomThreeNodeDetails } from "@/components/bom-visualization/BomThreeNodeDetails";
import { BomThreeSearchNavigator } from "@/components/bom-visualization/BomThreeSearchNavigator";
import { BomThreeToolbar } from "@/components/bom-visualization/BomThreeToolbar";
import { BomThreeChangeIntelligence } from "@/components/bom-visualization/BomThreeChangeIntelligence";
import { useCrossBomImpact } from "@/lib/cross-bom-impact-store";
import { branchAnalytics, buildThreeAnalysis } from "@/lib/bom-three-analysis";
import { boundsForNodes, layoutThreeBom } from "@/lib/bom-three-layout";
import { searchThreeBom } from "@/lib/bom-three-search";
import { ancestors, buildVisualBomGraph, deriveVisibleGraph, relationshipState } from "@/lib/bom-visualization";
import type { ComparisonStatus, NodeComparison, SourceType, TreeNodeData } from "@/types/bom-comparison";
import type { DataQualityFinding } from "@/types/bom-data-quality";
import type { ThreeAnalysisSnapshot, ThreeCameraAction, ThreeColorMode, ThreeFocusMode, ThreeLabelMode, ThreeLens, ThreeMatchedMode, ThreeNodeSize, ThreePosition, ThreeSizeMode, ThreeSpacingMode, ThreeUnrelatedMode } from "@/types/bom-three";
import type { VisualBomEdge, VisualBomGraph } from "@/types/bom-visualization";
import type { RequirementTraceResult, ReverseRequirementTraceResult } from "@/types/requirement-trace";
import type { WindchillChangeImpactFilter, WindchillChangeImpactResult } from "@/types/windchill-change-impact";

const roleColors = { root: "#06b6d4", assembly: "#6366f1", subassembly: "#8b5cf6", component: "#64748b" };
const statusColors: Record<ComparisonStatus, string> = { matched: "#10b981", changed: "#f59e0b", missing: "#f43f5e", "source-only": "#0ea5e9", probable: "#8b5cf6" };
const levelColors = ["#06b6d4", "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

type Props = { root: TreeNodeData; source: SourceType; comparison?: Record<string, NodeComparison>; search: string; selectedId?: string; onSelect: (node: TreeNodeData) => void; onFullScreen: () => void; requirementTraceEnabled?: boolean; requirementResult?: RequirementTraceResult | null; requirementFocus?: ReverseRequirementTraceResult | null; changeImpact?: WindchillChangeImpactResult | null; changeImpactFilter?: WindchillChangeImpactFilter };

export function BomThreeUniverseView({ root, source, comparison, search, selectedId, onSelect, onFullScreen, requirementTraceEnabled = false, requirementResult, requirementFocus, changeImpact = null, changeImpactFilter = "all" }: Props) {
  const impact = useCrossBomImpact();
  const fullGraph = useMemo(() => buildVisualBomGraph(root, source, comparison, true), [root, source, comparison]);
  const [hoveredId, setHoveredId] = useState<string | null>(null), [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null), [expanded, setExpanded] = useState<Set<string>>(() => new Set()), [spacing, setSpacing] = useState<ThreeSpacingMode>(fullGraph.nodes.length > 120 ? "expanded" : "balanced"), [labels, setLabels] = useState<ThreeLabelMode>("smart"), [nodeSize, setNodeSize] = useState<ThreeNodeSize>(fullGraph.nodes.length > 120 ? "small" : "medium"), [focusMode, setFocusMode] = useState<ThreeFocusMode>("full"), [lens, setLens] = useState<ThreeLens>("structure"), [colorBy, setColorBy] = useState<ThreeColorMode>("role"), [sizeBy, setSizeBy] = useState<ThreeSizeMode>("role"), [unrelated, setUnrelated] = useState<ThreeUnrelatedMode>("ghost"), [matched, setMatched] = useState<ThreeMatchedMode>("show"), [findingsOpen, setFindingsOpen] = useState(false), [cameraAction, setCameraAction] = useState<ThreeCameraAction>("fit-all"), [cameraActionKey, setCameraActionKey] = useState(0), [searchIndex, setSearchIndex] = useState(0), [differenceIndex, setDifferenceIndex] = useState(0), [changeMode, setChangeMode] = useState(false), [changeFilter, setChangeFilter] = useState<WindchillChangeImpactFilter>(changeImpactFilter), [isolateChange, setIsolateChange] = useState(false), [selectedNotice, setSelectedNotice] = useState<string | undefined>(undefined);

  useEffect(() => { setExpanded(new Set([fullGraph.rootId])); setSelectedOccurrenceId(null); triggerCamera("fit-all"); }, [fullGraph.rootId]);
  useEffect(() => { if (!selectedId) return; const occurrenceId = fullGraph.bySourceNodeId[selectedId]?.[0]; if (occurrenceId) setSelectedOccurrenceId(occurrenceId); }, [selectedId, fullGraph]);

  const searchResults = useMemo(() => searchThreeBom(fullGraph, search), [fullGraph, search]);
  useEffect(() => { setSearchIndex(0); }, [search]);
  const searchResultIds = useMemo(() => new Set(searchResults.map((entry) => entry.nodeId)), [searchResults]);
  const requirementIds = useMemo(() => new Set((requirementFocus?.occurrences.filter((entry) => entry.source === source) ?? []).flatMap((entry) => fullGraph.bySourceNodeId[entry.nodeId] ?? [])), [requirementFocus, source, fullGraph]);
  const impactIds = useMemo(() => new Set((impact.result?.occurrences.filter((entry) => entry.source === source) ?? []).flatMap((entry) => fullGraph.bySourceNodeId[entry.nodeId] ?? [])), [impact.result, source, fullGraph]);
  const changeSets = useMemo(() => {
    const direct = new Set<string>(), indirect = new Set<string>(), noticeIds = new Map<string, Set<string>>();
    if (!changeImpact) return { direct, indirect, noticeIds };
    for (const [sourceNodeId, entry] of Object.entries(changeImpact.impactMap)) {
      const visualIds = fullGraph.bySourceNodeId[sourceNodeId] ?? [];
      for (const visualId of visualIds) {
        (entry.impact === "direct" ? direct : indirect).add(visualId);
        for (const notice of entry.notices ?? []) {
          const key = notice.number ?? notice.name ?? "unknown";
          if (!noticeIds.has(key)) noticeIds.set(key, new Set());
          noticeIds.get(key)!.add(visualId);
        }
      }
    }
    return { direct, indirect, noticeIds };
  }, [changeImpact, fullGraph]);
  const activeChangeIds = useMemo(() => {
    const ids = new Set<string>();
    const notice = changeImpact?.changeNotices.find((item) => item.id === selectedNotice || item.number === selectedNotice);
    const allowedSourceIds = notice ? new Set(notice.affectedParts.flatMap((part) => part.matchedNodeIds)) : null;
    for (const [sourceNodeId, entry] of Object.entries(changeImpact?.impactMap ?? {})) {
      if (allowedSourceIds && entry.impact === "direct" && !allowedSourceIds.has(sourceNodeId)) continue;
      if (changeFilter !== "all" && entry.impact !== changeFilter) continue;
      for (const id of fullGraph.bySourceNodeId[sourceNodeId] ?? []) ids.add(id);
    }
    if (changeMode && (changeFilter === "all" || changeFilter === "indirect")) {
      for (const directId of [...ids].filter((id) => changeSets.direct.has(id))) ancestors(fullGraph, directId).forEach((node) => ids.add(node.id));
    }
    return ids;
  }, [changeImpact, fullGraph, selectedNotice, changeFilter, changeMode, changeSets.direct]);
  const forcedIds = useMemo(() => new Set([...requirementIds, ...impactIds, ...searchResultIds, ...(changeMode ? activeChangeIds : [])]), [requirementIds, impactIds, searchResultIds, changeMode, activeChangeIds]);
  useEffect(() => { if (!forcedIds.size) return; setExpanded((current) => { const next = new Set(current); for (const id of forcedIds) ancestors(fullGraph, id).forEach((node) => { if (node.isAssembly) next.add(node.id); }); return next; }); }, [forcedIds, fullGraph]);

  const analysis = useMemo(() => buildThreeAnalysis(fullGraph, comparison, requirementFocus), [fullGraph, comparison, requirementFocus]);
  const differenceIds = useMemo(() => fullGraph.nodes.filter((node) => { const status = comparison?.[node.sourceNodeId]?.status; return status && status !== "matched"; }).map((node) => node.id), [fullGraph, comparison]);
  const selectedNode = selectedOccurrenceId ? fullGraph.byId[selectedOccurrenceId] : undefined;
  const analytics = useMemo(() => selectedOccurrenceId ? branchAnalytics(fullGraph, selectedOccurrenceId, analysis) : null, [fullGraph, selectedOccurrenceId, analysis]);
  const breadcrumbPath = useMemo(() => ancestors(fullGraph, selectedOccurrenceId), [fullGraph, selectedOccurrenceId]);

  const baseVisible = useMemo(() => deriveVisibleGraph(fullGraph, new Set(expanded), selectedOccurrenceId, focusMode, search, forcedIds), [fullGraph, expanded, selectedOccurrenceId, focusMode, search, forcedIds]);
  const visibleGraph = useMemo(() => {
    const selectedRelations = relationshipState(fullGraph, selectedOccurrenceId);
    const keepContext = (id: string) => selectedRelations.ancestorIds.has(id) || forcedIds.has(id);
    const nodes = baseVisible.nodes.filter((node) => {
      if (unrelated === "hide" && selectedOccurrenceId && !keepContext(node.id) && !selectedRelations.descendantIds.has(node.id) && !selectedRelations.siblingIds.has(node.id)) return false;
      if (matched === "hide" && comparison?.[node.sourceNodeId]?.status === "matched" && !keepContext(node.id)) return false;
      if (changeMode && isolateChange && !activeChangeIds.has(node.id)) return false;
      return true;
    });
    const ids = new Set(nodes.map((node) => node.id)), edges = baseVisible.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId));
    return { ...baseVisible, nodes, edges, byId: Object.fromEntries(nodes.map((node) => [node.id, node])) };
  }, [baseVisible, unrelated, matched, comparison, selectedOccurrenceId, fullGraph, forcedIds, changeMode, isolateChange, activeChangeIds]);
  const layout = useMemo(() => layoutThreeBom(visibleGraph, { spacing }), [visibleGraph, spacing]);
  const relations = useMemo(() => relationshipState(fullGraph, selectedOccurrenceId), [fullGraph, selectedOccurrenceId]);

  function triggerCamera(action: ThreeCameraAction) { setCameraAction(action); setCameraActionKey((value) => value + 1); }
  function reveal(id: string) { setExpanded((current) => { const next = new Set(current); ancestors(fullGraph, id).forEach((node) => next.add(node.id)); return next; }); }
  function selectOccurrence(id: string, fit = false) { reveal(id); setSelectedOccurrenceId(id); const node = fullGraph.byId[id], raw = node ? findByPath(root, node.occurrencePath) : null; if (raw) onSelect(raw); if (fit) window.setTimeout(() => triggerCamera("focus-selected"), 40); }
  function toggleExpanded(id: string, want: boolean) { setExpanded((current) => { const next = new Set(current); want ? next.add(id) : next.delete(id); return next; }); }
  function navigateResults(direction: 1 | -1) { if (!searchResults.length) return; const next = (searchIndex + direction + searchResults.length) % searchResults.length; setSearchIndex(next); selectOccurrence(searchResults[next].nodeId, true); }
  function navigateDifferences(direction: 1 | -1) { if (!differenceIds.length) return; const next = (differenceIndex + direction + differenceIds.length) % differenceIds.length; setDifferenceIndex(next); selectOccurrence(differenceIds[next], true); }
  function applyLens(next: ThreeLens) {
    setLens(next); setFindingsOpen(next === "data-quality");
    const presets: Record<ThreeLens, () => void> = {
      structure: () => { setColorBy("role"); setSizeBy("role"); setLabels("smart"); setUnrelated("ghost"); setMatched("show"); },
      comparison: () => { setColorBy("comparison"); setSizeBy("role"); setLabels("branch"); setUnrelated("ghost"); setMatched("ghost"); },
      requirements: () => { setColorBy("requirements"); setSizeBy("role"); setLabels("branch"); setUnrelated("ghost"); },
      impact: () => { setColorBy("role"); setSizeBy("descendants"); setLabels("branch"); setUnrelated("ghost"); },
      complexity: () => { setColorBy("complexity"); setSizeBy("complexity"); setLabels("assemblies"); setUnrelated("show"); },
      "data-quality": () => { setColorBy("data-quality"); setSizeBy("role"); setLabels("smart"); setUnrelated("show"); },
    };
    presets[next]();
  }
  function selectFinding(finding: DataQualityFinding) { setFindingsOpen(false); selectOccurrence(finding.nodeId, true); }

  return <div className="relative h-[clamp(620px,74vh,850px)] min-h-[620px] w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#020617] text-white">
    <Boundary><Canvas camera={{ position: [0, 16, Math.max(30, layout.maxExtent * 1.7)], fov: 46, near: .1, far: 1600 }} dpr={[1, 1.5]}><Suspense fallback={null}><Scene graph={visibleGraph} layout={layout} selectedId={selectedOccurrenceId} hoveredId={hoveredId} comparison={comparison} analysis={analysis} requirementIds={requirementIds} impactIds={impactIds} changeMode={changeMode} directChangeIds={changeSets.direct} indirectChangeIds={changeSets.indirect} activeChangeIds={activeChangeIds} isolateChange={isolateChange} relations={relations} labels={labels} nodeSize={nodeSize} colorBy={colorBy} sizeBy={sizeBy} unrelated={unrelated} matched={matched} focusActive={Boolean(requirementFocus)} cameraAction={cameraAction} cameraActionKey={cameraActionKey} onHover={setHoveredId} onSelect={selectOccurrence} onToggle={(id) => toggleExpanded(id, !expanded.has(id))}/></Suspense></Canvas></Boundary>
    {changeImpact?.summary.changeNotices ? <BomThreeChangeIntelligence result={changeImpact} enabled={changeMode} filter={changeFilter} isolate={isolateChange} selectedNotice={selectedNotice} onToggle={() => setChangeMode((value) => !value)} onFilter={setChangeFilter} onIsolate={() => setIsolateChange((value) => !value)} onNotice={setSelectedNotice} onFocus={() => { if (!changeMode) setChangeMode(true); const first = [...activeChangeIds][0]; if (first) { selectOccurrence(first); window.setTimeout(() => triggerCamera("fit-branch"), 40); } }} onCloseSelection={() => { setSelectedNotice(undefined); setIsolateChange(false); }} /> : null}
    <BomThreeLensSelector value={lens} onChange={applyLens}/>
    <BomThreeToolbar spacing={spacing} setSpacing={setSpacing} labels={labels} setLabels={setLabels} nodeSize={nodeSize} setNodeSize={setNodeSize} focusMode={focusMode} setFocusMode={setFocusMode} colorBy={colorBy} setColorBy={setColorBy} sizeBy={sizeBy} setSizeBy={setSizeBy} unrelated={unrelated} setUnrelated={setUnrelated} matched={matched} setMatched={setMatched} canAct={Boolean(selectedNode)} comparisonActive={Boolean(comparison)} findingsCount={analysis.quality.total} findingsOpen={findingsOpen} onExpand={() => selectedNode && toggleExpanded(selectedNode.id, true)} onCollapse={() => selectedNode && toggleExpanded(selectedNode.id, false)} onExpandAll={() => setExpanded(new Set(fullGraph.nodes.filter((node) => node.isAssembly).map((node) => node.id)))} onCollapseAll={() => setExpanded(new Set([fullGraph.rootId]))} onFitAll={() => triggerCamera("fit-all")} onFitBranch={() => triggerCamera("fit-branch")} onReset={() => triggerCamera("reset")} onFindings={() => setFindingsOpen((value) => !value)} onFullScreen={onFullScreen}/>
    <BomThreeSearchNavigator query={search} results={searchResults} activeIndex={searchIndex} onPrevious={() => navigateResults(-1)} onNext={() => navigateResults(1)} onFocus={() => searchResults[searchIndex] && selectOccurrence(searchResults[searchIndex].nodeId, true)}/>
    {comparison && differenceIds.length ? <DifferenceNavigator index={differenceIndex} count={differenceIds.length} onPrevious={() => navigateDifferences(-1)} onNext={() => navigateDifferences(1)}/> : null}
    <BomThreeBreadcrumbs path={breadcrumbPath} onSelect={(id) => selectOccurrence(id, true)}/>
    {analytics ? <BomThreeNodeDetails analytics={analytics} expanded={expanded.has(analytics.node.id)} onExpand={() => toggleExpanded(analytics.node.id, true)} onCollapse={() => toggleExpanded(analytics.node.id, false)} onFit={() => triggerCamera("fit-branch")} onClear={() => setSelectedOccurrenceId(null)} onOpenComparison={() => selectOccurrence(analytics.node.id)}/> : null}
    <BomThreeFindingsPanel open={findingsOpen} summary={analysis.quality} onClose={() => setFindingsOpen(false)} onSelect={selectFinding}/>
    {requirementTraceEnabled && requirementResult ? <RequirementSnapshotCard result={requirementResult} className="absolute left-5 top-20 z-30"/> : null}
    <AnimatePresence>{lens !== "structure" ? <motion.div key={lens} initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute bottom-4 right-24 z-30 flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-slate-950/85 px-3 py-2 text-[9px] text-cyan-200"><IconSparkles className="h-3.5 w-3.5"/>{lens.replace("-", " ")} lens · {visibleGraph.nodes.length} of {fullGraph.nodes.length} visible</motion.div> : null}</AnimatePresence>
  </div>;
}

function DifferenceNavigator({ index, count, onPrevious, onNext }: { index: number; count: number; onPrevious: () => void; onNext: () => void }) { return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="absolute left-4 top-20 z-40 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-slate-950/90 p-2 shadow-xl"><span className="px-1 text-[9px] font-semibold text-amber-200">Difference {index + 1} of {count}</span><button onClick={onPrevious} className="nav"><IconChevronLeft/></button><button onClick={onNext} className="nav"><IconChevronRight/></button><style>{`.nav{display:flex;height:1.8rem;width:1.8rem;align-items:center;justify-content:center;border-radius:.55rem;border:1px solid rgb(71 85 105);color:rgb(203 213 225)}.nav svg{height:.85rem;width:.85rem}`}</style></motion.div>; }

type SceneProps = { graph: VisualBomGraph; layout: ReturnType<typeof layoutThreeBom>; selectedId: string | null; hoveredId: string | null; comparison?: Record<string, NodeComparison>; analysis: ThreeAnalysisSnapshot; requirementIds: Set<string>; impactIds: Set<string>; changeMode: boolean; directChangeIds: Set<string>; indirectChangeIds: Set<string>; activeChangeIds: Set<string>; isolateChange: boolean; relations: ReturnType<typeof relationshipState>; labels: ThreeLabelMode; nodeSize: ThreeNodeSize; colorBy: ThreeColorMode; sizeBy: ThreeSizeMode; unrelated: ThreeUnrelatedMode; matched: ThreeMatchedMode; focusActive: boolean; cameraAction: ThreeCameraAction; cameraActionKey: number; onHover: (id: string | null) => void; onSelect: (id: string) => void; onToggle: (id: string) => void };
function Scene(props: SceneProps) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  return <><ambientLight intensity={.82}/><directionalLight position={[10, 18, 12]} intensity={2.2}/><pointLight position={[-18, 2, -12]} intensity={58} color="#22d3ee" distance={100}/><fog attach="fog" args={["#020617", 70, 190]}/><gridHelper args={[180, 60, "#164e63", "#0f172a"]} position={[0, -12, 0]}/>{props.graph.edges.map((edge) => <Edge3 key={edge.id} edge={edge} {...props}/>) }{props.layout.nodes.map((node) => { const selected = node.id === props.selectedId, ancestor = props.relations.ancestorIds.has(node.id), descendant = props.relations.descendantIds.has(node.id), sibling = props.relations.siblingIds.has(node.id), related = !props.selectedId || selected || ancestor || descendant || sibling, matchedGhost = props.matched === "ghost" && props.comparison?.[node.sourceNodeId]?.status === "matched", changeDimmed = props.changeMode && !props.activeChangeIds.has(node.id), dimmed = changeDimmed || (props.selectedId && !related && props.unrelated !== "show") || matchedGhost || (props.focusActive && !props.requirementIds.has(node.id)); const showLabel = props.labels === "all" || (props.labels === "assemblies" && (node.isAssembly || node.isRoot)) || (props.labels === "branch" && (selected || ancestor || descendant)) || (props.labels === "smart" && (node.isRoot || node.isAssembly || selected || node.id === props.hoveredId || Boolean(props.selectedId && (ancestor || node.parentId === props.selectedId)))); return <Node3 key={node.id} node={node} selected={selected} hovered={node.id === props.hoveredId} ancestor={ancestor} descendant={descendant} comparison={props.comparison?.[node.sourceNodeId]} analysis={props.analysis} requirementLinked={props.requirementIds.has(node.id)} impactLinked={props.impactIds.has(node.id)} changeDirect={props.changeMode && props.directChangeIds.has(node.id)} changeIndirect={props.changeMode && props.indirectChangeIds.has(node.id)} dimmed={dimmed} hidden={props.unrelated === "hide" && props.selectedId !== null && !related} showLabel={showLabel} size={props.nodeSize} colorBy={props.colorBy} sizeBy={props.sizeBy} onHover={props.onHover} onSelect={props.onSelect} onToggle={props.onToggle}/>; })}<CameraRig controls={controls} layout={props.layout} selectedId={props.selectedId} relations={props.relations} action={props.cameraAction} actionKey={props.cameraActionKey}/><GizmoHelper alignment="bottom-right" margin={[88, 88]}><GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white"/></GizmoHelper><OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.08} minDistance={4} maxDistance={280}/></>;
}
function Edge3({ edge, layout, selectedId, relations, requirementIds, impactIds, unrelated, changeMode, activeChangeIds, directChangeIds }: SceneProps & { edge: VisualBomEdge }) { const a = layout.byId[edge.sourceId]?.position, b = layout.byId[edge.targetId]?.position; if (!a || !b) return null; const ancestor = Boolean(selectedId && relations.ancestorIds.has(edge.sourceId) && relations.ancestorIds.has(edge.targetId)), descendant = Boolean(selectedId && (edge.sourceId === selectedId || relations.descendantIds.has(edge.sourceId)) && relations.descendantIds.has(edge.targetId)), requirement = requirementIds.has(edge.sourceId) || requirementIds.has(edge.targetId), impact = impactIds.has(edge.sourceId) || impactIds.has(edge.targetId), changePath = changeMode && activeChangeIds.has(edge.sourceId) && activeChangeIds.has(edge.targetId), directPath = changeMode && (directChangeIds.has(edge.sourceId) || directChangeIds.has(edge.targetId)), related = !selectedId || ancestor || descendant; const color = requirement ? "#a78bfa" : changePath ? (directPath ? "#fb923c" : "#f59e0b") : impact ? "#f59e0b" : ancestor ? "#a78bfa" : descendant ? "#22d3ee" : "#334155"; return <Line points={[a, b]} color={color} lineWidth={requirement || impact || changePath ? (directPath ? 4 : 3) : related ? (selectedId ? 2.4 : 1) : .5} transparent opacity={requirement || impact || changePath ? 1 : related ? (selectedId ? 1 : .48) : unrelated === "show" ? .22 : .025}/>; }
function CameraRig({ controls, layout, selectedId, relations, action, actionKey }: { controls: RefObject<ElementRef<typeof OrbitControls> | null>; layout: ReturnType<typeof layoutThreeBom>; selectedId: string | null; relations: ReturnType<typeof relationshipState>; action: ThreeCameraAction; actionKey: number }) { const { camera } = useThree(), target = useRef(new THREE.Vector3()), position = useRef(new THREE.Vector3()), animating = useRef(false); useEffect(() => { let ids: Set<string> | undefined; if (action === "fit-branch" && selectedId) ids = new Set([selectedId, ...relations.descendantIds]); else if (action === "focus-selected" && selectedId) ids = new Set([selectedId]); const bounds = action === "reset" ? { center: [0, 0, 0] as ThreePosition, radius: Math.max(12, layout.maxExtent) } : boundsForNodes(layout, ids), center = new THREE.Vector3(...bounds.center), distance = Math.max(10, bounds.radius * 2.25); target.current.copy(center); position.current.set(center.x + distance * .55, center.y + distance * .42, center.z + distance); animating.current = true; }, [actionKey]); useFrame((_, delta) => { if (!animating.current || !controls.current) return; camera.position.lerp(position.current, Math.min(1, delta * 3.5)); controls.current.target.lerp(target.current, Math.min(1, delta * 4)); controls.current.update(); if (camera.position.distanceTo(position.current) < .08 && controls.current.target.distanceTo(target.current) < .05) animating.current = false; }); return null; }

type NodeProps = { node: ReturnType<typeof layoutThreeBom>["nodes"][number]; selected: boolean; hovered: boolean; ancestor: boolean; descendant: boolean; comparison?: NodeComparison; analysis: ThreeAnalysisSnapshot; requirementLinked: boolean; impactLinked: boolean; changeDirect: boolean; changeIndirect: boolean; dimmed: boolean; hidden: boolean; showLabel: boolean; size: ThreeNodeSize; colorBy: ThreeColorMode; sizeBy: ThreeSizeMode; onHover: (id: string | null) => void; onSelect: (id: string) => void; onToggle: (id: string) => void };
function Node3(props: NodeProps) {
  const group = useRef<THREE.Group>(null), pulse = useRef<THREE.Mesh>(null), baseFactor = props.size === "small" ? .68 : props.size === "large" ? 1.18 : 1, metricFactor = getMetricFactor(props), baseRadius = props.node.isRoot ? 1.15 : props.node.isAssembly ? .78 : .46, radius = baseRadius * baseFactor * metricFactor, color = getNodeColor(props), targetOpacity = props.hidden ? 0 : props.dimmed ? .08 : 1;
  useFrame(({ clock }, delta) => { if (group.current) { const scale = props.selected || props.requirementLinked || props.impactLinked || props.changeDirect ? 1.28 : props.changeIndirect ? 1.1 : props.hovered ? 1.13 : 1; group.current.scale.lerp(new THREE.Vector3(scale, scale, scale), Math.min(1, delta * 10)); group.current.position.lerp(new THREE.Vector3(...props.node.position), Math.min(1, delta * 7)); group.current.visible = targetOpacity > .001; } if (pulse.current) pulse.current.scale.setScalar(1.05 + (Math.sin(clock.elapsedTime * 3) + 1) * .18); });
  const stop = (event: ThreeEvent<PointerEvent>) => event.stopPropagation();
  return <group ref={group} position={props.node.position}><mesh onPointerOver={(event) => { stop(event); props.onHover(props.node.id); }} onPointerOut={(event) => { stop(event); props.onHover(null); }} onClick={(event) => { stop(event); props.onSelect(props.node.id); }} onDoubleClick={(event) => { stop(event); if (props.node.isAssembly) props.onToggle(props.node.id); }}><sphereGeometry args={[radius, 24, 18]}/><meshStandardMaterial color={color} emissive={props.requirementLinked ? "#8b5cf6" : props.changeDirect ? "#f97316" : props.changeIndirect ? "#f59e0b" : props.impactLinked ? "#f59e0b" : props.selected ? "#06b6d4" : color} emissiveIntensity={props.changeDirect ? 1.35 : props.requirementLinked || props.impactLinked || props.selected ? .9 : props.changeIndirect ? .55 : .16} transparent opacity={targetOpacity}/></mesh><mesh><sphereGeometry args={[radius + .08, 18, 14]}/><meshBasicMaterial color={props.comparison ? statusColors[props.comparison.status] : "#94a3b8"} wireframe transparent opacity={props.dimmed ? .02 : props.comparison ? .65 : .12}/></mesh>{props.requirementLinked || props.impactLinked || props.selected || props.changeDirect || props.changeIndirect ? <mesh ref={pulse}><sphereGeometry args={[radius + .22, 22, 16]}/><meshBasicMaterial color={props.requirementLinked ? "#a78bfa" : props.changeDirect ? "#fb923c" : props.changeIndirect ? "#f59e0b" : props.impactLinked ? "#f59e0b" : "#22d3ee"} wireframe transparent opacity={.72}/></mesh> : null}{props.node.isAssembly && props.node.childIds.length ? <Billboard position={[radius * .72, radius * .72, 0]}><Text fontSize={.24} color="#67e8f9" outlineWidth={.02} outlineColor="#020617">{`+${props.node.childIds.length}`}</Text></Billboard> : null}{props.showLabel && !props.dimmed ? <Billboard position={[0, radius + .55, 0]}><Text fontSize={props.node.isRoot ? .48 : props.node.isAssembly ? .31 : .24} color="#f8fafc" anchorX="center" anchorY="middle" outlineWidth={.025} outlineColor="#020617">{short(props.node.name, props.node.isAssembly ? 30 : 22)}</Text></Billboard> : null}</group>;
}
function getMetricFactor(props: NodeProps) { if (props.sizeBy === "uniform") return 1; if (props.sizeBy === "children") return 1 + Math.min(.75, props.node.childIds.length / 20); if (props.sizeBy === "descendants") return 1 + Math.min(.9, Math.sqrt(props.node.descendantCount) / 8); if (props.sizeBy === "complexity") return .85 + props.analysis.complexityByNode[props.node.id] / 130; return 1; }
function getNodeColor(props: NodeProps) { if (props.changeDirect) return "#f97316"; if (props.changeIndirect) return "#d97706"; if (props.selected) return "#22d3ee"; if (props.colorBy === "comparison") return props.comparison ? statusColors[props.comparison.status] : "#475569"; if (props.colorBy === "level") return levelColors[props.node.level % levelColors.length]; if (props.colorBy === "requirements") return props.requirementLinked ? "#a78bfa" : "#334155"; if (props.colorBy === "complexity") return heatColor(props.analysis.complexityByNode[props.node.id]); if (props.colorBy === "data-quality") { const count = props.analysis.quality.findingIdsByNode[props.node.id]?.length ?? 0; return count > 2 ? "#f43f5e" : count ? "#f59e0b" : "#10b981"; } if (props.ancestor) return "#8b5cf6"; if (props.descendant) return "#0ea5e9"; return props.node.isRoot ? roleColors.root : props.node.isAssembly ? (props.node.level === 1 ? roleColors.assembly : roleColors.subassembly) : roleColors.component; }
function heatColor(value: number) { if (value >= 75) return "#ef4444"; if (value >= 50) return "#f97316"; if (value >= 25) return "#facc15"; return "#10b981"; }
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <div className="flex h-full items-center justify-center">3D rendering unavailable</div> : this.props.children; } }
function findByPath(root: TreeNodeData, path: number[]) { let node: TreeNodeData | undefined = root; for (const index of path) node = node.children?.[index]; return node ?? null; }
function short(value: string, length: number) { return value.length > length ? `${value.slice(0, length - 1)}…` : value; }
