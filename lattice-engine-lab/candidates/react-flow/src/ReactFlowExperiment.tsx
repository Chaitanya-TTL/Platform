import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow,
  ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CanonicalEntity, Domain, EntityId, EvidenceClass } from "@lattice-lab/contracts/canonical-graph";
import type { CameraSnapshot } from "@lattice-lab/contracts/commands";
import { verticalSliceFixture, requirementToSapPath } from "@lattice-lab/fixtures/lattice-vertical-slice";
import { ALL_DOMAINS, ALL_EVIDENCE, connectedEntities, neighborhood, projectGraph, relationshipLabel, stablePosition } from "./graph-projection";
import { useBenchmark } from "./useBenchmark";

type EntityNode = Node<{ entity: CanonicalEntity; selected: boolean; path: boolean }, "entity">;

const evidenceTone: Record<EvidenceClass, string> = {
  "authoritative-source-fact": "evidence-fact", "deterministic-calculation": "evidence-deterministic",
  "verified-cross-reference": "evidence-verified", "heuristic-match": "evidence-heuristic",
  "user-approved-link": "evidence-user", "inferred-relationship": "evidence-inferred",
  "simulated-test-data": "evidence-simulated", "unavailable-evidence": "evidence-unavailable",
};

const domainLabels: Record<string, string> = { product: "Product", plm: "PLM", erp: "ERP", cpq: "CPQ", requirements: "Requirements", change: "Change", document: "Documents", data: "Provenance", source: "Source" };

const EntityCard = memo(function EntityCard({ data }: NodeProps<EntityNode>) {
  const { entity } = data;
  return <article className={`entity-node domain-${entity.domain} ${evidenceTone[entity.evidenceClass]} ${data.selected ? "is-selected" : ""} ${data.path ? "is-path" : ""}`}>
    <Handle type="target" position={Position.Left} className="entity-handle" />
    <div className="entity-node__meta"><span>{domainLabels[entity.domain] ?? entity.domain}</span><span>{entity.kind.replaceAll("-", " ")}</span></div>
    <strong>{entity.label}</strong>
    {entity.secondaryLabel ? <small>{entity.secondaryLabel}</small> : null}
    <div className="entity-node__evidence">{entity.evidenceClass.replaceAll("-", " ")}</div>
    <Handle type="source" position={Position.Right} className="entity-handle" />
  </article>;
});

function Canvas() {
  const graph = verticalSliceFixture;
  const flow = useReactFlow<EntityNode, Edge>();
  const benchmark = useBenchmark();
  const mountedAt = useRef(performance.now());
  const listenerBalance = useRef(0);
  const [selectedId, setSelectedId] = useState<EntityId | null>(null);
  const [focusId, setFocusId] = useState<EntityId>(graph.focusId);
  const [visibleIds, setVisibleIds] = useState(() => neighborhood(graph, graph.focusId, 1));
  const [expandedIds, setExpandedIds] = useState<Set<EntityId>>(() => new Set([graph.focusId]));
  const [domains, setDomains] = useState<Set<Domain>>(() => new Set(ALL_DOMAINS));
  const [evidence, setEvidence] = useState<Set<EvidenceClass>>(() => new Set(ALL_EVIDENCE));
  const [highlightPath, setHighlightPath] = useState(false);
  const [camera, setCamera] = useState<CameraSnapshot | null>(null);
  const [semanticOpen, setSemanticOpen] = useState(false);
  const [status, setStatus] = useState("Focused product neighborhood ready");
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    listenerBalance.current += 1;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setStatus(media.matches ? "Reduced motion enabled" : "Standard motion enabled");
    media.addEventListener("change", onChange);
    return () => { media.removeEventListener("change", onChange); listenerBalance.current -= 1; };
  }, []);

  const projection = useMemo(() => projectGraph(graph, visibleIds, domains, evidence), [graph, visibleIds, domains, evidence]);
  const pathIds = useMemo(() => new Set(highlightPath ? requirementToSapPath : []), [highlightPath]);
  const pathEntityIds = useMemo(() => {
    const ids = new Set<string>();
    graph.relationships.forEach((item) => { if (pathIds.has(item.id)) { ids.add(item.sourceId); ids.add(item.targetId); } });
    return ids;
  }, [graph.relationships, pathIds]);

  const nodes = useMemo<EntityNode[]>(() => projection.entities.map((entity) => ({
    id: entity.id, type: "entity", position: stablePosition(entity, focusId),
    data: { entity, selected: entity.id === selectedId, path: pathEntityIds.has(entity.id) },
    draggable: true, selectable: true,
  })), [projection.entities, focusId, selectedId, pathEntityIds]);

  const edges = useMemo<Edge[]>(() => projection.relationships.map((relationship) => ({
    id: relationship.id, source: relationship.sourceId, target: relationship.targetId,
    label: relationshipLabel(relationship), markerEnd: { type: MarkerType.ArrowClosed },
    animated: highlightPath && pathIds.has(relationship.id) && !reducedMotion,
    className: `${evidenceTone[relationship.evidenceClass]} ${pathIds.has(relationship.id) ? "is-path" : ""}`,
    style: { strokeWidth: pathIds.has(relationship.id) ? 3 : 1.4 },
  })), [projection.relationships, highlightPath, pathIds, reducedMotion]);

  const selected = graph.entities.find((entity) => entity.id === selectedId) ?? null;
  const degree = selected ? connectedEntities(graph, selected.id).size : 0;

  const fit = useCallback(async (ids?: string[]) => {
    benchmark.begin("focus-fit");
    await flow.fitView({ nodes: ids?.map((id) => ({ id })) ?? undefined, padding: 0.22, duration: reducedMotion ? 0 : 350 });
    benchmark.end("focus-fit");
  }, [benchmark, flow, reducedMotion]);

  const select = useCallback((entityId: EntityId) => {
    benchmark.begin("selection"); setSelectedId(entityId); requestAnimationFrame(() => benchmark.end("selection"));
  }, [benchmark]);

  const expand = useCallback((entityId: EntityId) => {
    benchmark.begin("expansion");
    const additions = connectedEntities(graph, entityId);
    setVisibleIds((current) => new Set([...current, ...additions, entityId]));
    setExpandedIds((current) => new Set([...current, entityId]));
    setStatus(`Expanded first-degree neighborhood of ${graph.entities.find((item) => item.id === entityId)?.label ?? entityId}`);
    requestAnimationFrame(() => { benchmark.end("expansion"); void fit([entityId, ...additions]); });
  }, [benchmark, fit, graph]);

  const collapse = useCallback((entityId: EntityId) => {
    benchmark.begin("collapse");
    const protectedIds = neighborhood(graph, focusId, 1);
    setVisibleIds((current) => {
      const next = new Set(current); connectedEntities(graph, entityId).forEach((id) => { if (!protectedIds.has(id)) next.delete(id); }); return next;
    });
    setExpandedIds((current) => { const next = new Set(current); next.delete(entityId); return next; });
    requestAnimationFrame(() => benchmark.end("collapse"));
  }, [benchmark, focusId, graph]);

  const focus = useCallback((entityId: EntityId) => {
    setFocusId(entityId); setSelectedId(entityId); setVisibleIds((current) => new Set([...current, ...neighborhood(graph, entityId, 1)]));
    requestAnimationFrame(() => void fit([entityId, ...connectedEntities(graph, entityId)]));
  }, [fit, graph]);

  const showPath = useCallback(() => {
    benchmark.begin("path-highlight");
    const ids = new Set<string>(); graph.relationships.forEach((item) => { if (requirementToSapPath.includes(item.id)) { ids.add(item.sourceId); ids.add(item.targetId); } });
    setVisibleIds((current) => new Set([...current, ...ids])); setHighlightPath(true); setStatus("Requirement-to-SAP evidence path highlighted");
    requestAnimationFrame(() => { benchmark.end("path-highlight"); void fit([...ids]); });
  }, [benchmark, fit, graph.relationships]);

  const captureCamera = useCallback(() => { const view = flow.getViewport(); setCamera({ centerX: view.x, centerY: view.y, zoom: view.zoom }); setStatus("Camera state captured"); }, [flow]);
  const restoreCamera = useCallback(async () => { if (!camera) return; benchmark.begin("camera-restore"); await flow.setViewport({ x: camera.centerX, y: camera.centerY, zoom: camera.zoom }, { duration: reducedMotion ? 0 : 300 }); benchmark.end("camera-restore"); setStatus("Camera state restored"); }, [benchmark, camera, flow, reducedMotion]);

  const toggleDomain = (domain: Domain) => setDomains((current) => { const next = new Set(current); next.has(domain) ? next.delete(domain) : next.add(domain); return next; });
  const toggleEvidence = (item: EvidenceClass) => setEvidence((current) => { const next = new Set(current); next.has(item) ? next.delete(item) : next.add(item); return next; });

  return <div className="experiment-shell">
    <header className="experiment-header">
      <div><p className="eyebrow">Lattice Engine · React Flow baseline</p><h1>{graph.title}</h1><p>Progressive, evidence-classified engineering investigation using simulated data.</p></div>
      <div className="header-actions"><button onClick={() => void fit()}>Fit visible</button><button onClick={showPath}>Trace requirement to SAP</button></div>
    </header>
    <div className="workspace-grid">
      <aside className="filter-rail" aria-label="Graph filters">
        <section><h2>Domains</h2>{ALL_DOMAINS.filter((domain) => graph.entities.some((entity) => entity.domain === domain)).map((domain) => <label key={domain}><input type="checkbox" checked={domains.has(domain)} onChange={() => toggleDomain(domain)} />{domainLabels[domain] ?? domain}</label>)}</section>
        <section><h2>Evidence</h2>{ALL_EVIDENCE.filter((item) => graph.entities.some((entity) => entity.evidenceClass === item) || graph.relationships.some((relationship) => relationship.evidenceClass === item)).map((item) => <label key={item}><input type="checkbox" checked={evidence.has(item)} onChange={() => toggleEvidence(item)} /><span className={`legend-dot ${evidenceTone[item]}`} />{item.replaceAll("-", " ")}</label>)}</section>
        <section><h2>Camera</h2><button onClick={captureCamera}>Capture view</button><button disabled={!camera} onClick={() => void restoreCamera()}>Restore view</button></section>
      </aside>
      <main className="canvas-panel">
        {nodes.length ? <ReactFlow<EntityNode, Edge> nodes={nodes} edges={edges} nodeTypes={{ entity: EntityCard }} onNodeClick={(_, node) => select(node.id)} onNodeDoubleClick={(_, node) => focus(node.id)} onInit={(instance: ReactFlowInstance<EntityNode, Edge>) => { benchmark.begin("first-render"); requestAnimationFrame(() => { benchmark.end("first-render"); setStatus(`Renderer ready in ${(performance.now() - mountedAt.current).toFixed(1)} ms`); void instance.fitView({ padding: .22 }); }); }} minZoom={0.18} maxZoom={1.65} fitView proOptions={{ hideAttribution: false }}>
          <Background gap={28} size={1} color="#263247" /><MiniMap pannable zoomable nodeColor="#64748b" /><Controls showInteractive={false} />
        </ReactFlow> : <div className="state-panel"><h2>No visible evidence</h2><p>The active domain and evidence filters hide every entity.</p><button onClick={() => { setDomains(new Set(ALL_DOMAINS)); setEvidence(new Set(ALL_EVIDENCE)); }}>Restore filters</button></div>}
        <div className="status-strip"><span>{status}</span><span>{nodes.length} entities · {edges.length} relationships · {reducedMotion ? "reduced motion" : "standard motion"}</span></div>
      </main>
      <aside className="inspector" aria-live="polite">
        {selected ? <><p className="eyebrow">Selected evidence</p><h2>{selected.label}</h2><dl><dt>Entity type</dt><dd>{selected.kind}</dd><dt>Domain</dt><dd>{selected.domain}</dd><dt>Evidence class</dt><dd>{selected.evidenceClass}</dd><dt>Connected entities</dt><dd>{degree}</dd>{Object.entries(selected.attributes).map(([key, value]) => <span className="attribute" key={key}><dt>{key}</dt><dd>{String(value)}</dd></span>)}</dl><div className="inspector-actions"><button onClick={() => focus(selected.id)}>Explore from here</button>{expandedIds.has(selected.id) ? <button onClick={() => collapse(selected.id)}>Collapse</button> : <button onClick={() => expand(selected.id)}>Expand neighborhood</button>}<button onClick={() => setSelectedId(null)}>Close inspector</button></div></> : <div className="inspector-empty"><h2>Evidence inspector</h2><p>Select an entity to inspect source, classification, attributes, and available relationships.</p></div>}
        <section className="measurements"><h3>Runtime measurements</h3>{benchmark.measurements.length ? <ol>{benchmark.measurements.map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.durationMs} ms</strong></li>)}</ol> : <p>No interactions measured yet.</p>}<p className="technical">Listener balance: {listenerBalance.current} · DOM canvases: {document.querySelectorAll(".react-flow").length}</p></section>
      </aside>
    </div>
    <section className="semantic-panel"><button aria-expanded={semanticOpen} onClick={() => setSemanticOpen((value) => !value)}>{semanticOpen ? "Hide" : "Open"} accessible semantic representation</button>{semanticOpen ? <div className="semantic-content"><h2>Visible entities</h2><ul>{projection.entities.map((entity) => <li key={entity.id}><button onClick={() => select(entity.id)}><strong>{entity.label}</strong><span>{entity.kind}, {entity.domain}, {entity.evidenceClass}</span></button></li>)}</ul><h2>Visible relationships</h2><ul>{projection.relationships.map((relationship) => <li key={relationship.id}>{graph.entities.find((entity) => entity.id === relationship.sourceId)?.label} <strong>{relationshipLabel(relationship)}</strong> {graph.entities.find((entity) => entity.id === relationship.targetId)?.label}; {relationship.evidenceClass}</li>)}</ul></div> : null}</section>
  </div>;
}

export function ReactFlowExperiment() { return <ReactFlowProvider><Canvas /></ReactFlowProvider>; }
