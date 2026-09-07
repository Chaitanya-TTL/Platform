"use client";

import { MotionConfig, useAnimate, useReducedMotion } from "motion/react";

import "@xyflow/react/dist/style.css";
import "../lattice-next.css";
import { memo, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useKeyPress,
  useReactFlow,
  getConnectedEdges,
  getIncomers,
  getOutgoers,
  type EdgeChange,
  type NodeChange,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import { toReactFlow } from "../infrastructure/react-flow-adapter";
import { layoutProjection } from "../infrastructure/elk-layout-adapter";
import type { LayoutOrientation, RelationshipProjection, RendererViewport } from "../contracts/projection";
import type { LayoutSession } from "../layout/layout-session";
import type { LatticeFlowEdge, LatticeFlowNode, LatticePinnedPositions } from "../canvas/lattice-flow-types";
import type { LatticeNodeActionIntent } from "../canvas/lattice-node-actions";
import type { LatticeEdgeActionIntent } from "../canvas/lattice-edge-actions";
import {
  LATTICE_DEFAULT_EDGE_OPTIONS,
  LATTICE_EDGE_TYPES,
  LATTICE_FIT_VIEW_OPTIONS,
  LATTICE_NODE_TYPES,
  LATTICE_PAN_BUTTONS,
  LATTICE_PRO_OPTIONS,
  LATTICE_SNAP_GRID,
} from "../canvas/lattice-flow-config";

export type RelationshipCanvasProps = {
  projection: RelationshipProjection;
  orientation: LayoutOrientation;
  pinnedPositions: LatticePinnedPositions;
  viewport: RendererViewport;
  onSelectEntity: (id: string) => void;
  onSelectRelationship: (id: string) => void;
  onToggle: (id: string) => void;
  onViewport: (viewport: RendererViewport) => void;
  onPinPosition: (id: string, position: XYPosition) => void;
  onClearTransient: () => void;
  onNodeAction: (intent: LatticeNodeActionIntent) => void;
  onEdgeAction: (intent: LatticeEdgeActionIntent) => void;
};

function RelationshipCanvasComponent(props: RelationshipCanvasProps) {
  return <RelationshipCanvasInner {...props} />;
}

export const RelationshipCanvas = memo(RelationshipCanvasComponent);

function RelationshipCanvasInner({ projection, orientation, pinnedPositions, viewport, onSelectEntity, onSelectRelationship, onToggle, onViewport, onPinPosition, onClearTransient, onNodeAction, onEdgeAction }: RelationshipCanvasProps) {
  const reducedMotion = useReducedMotion();
  const [motionScope, animate] = useAnimate();
  const geometryBusy = useRef(new Set<string>());
  const settlementFrame = useRef<number | null>(null);
  const { setViewport, fitView } = useReactFlow<LatticeFlowNode, LatticeFlowEdge>();
  const [initialGraph] = useState(() => toReactFlow(projection, {}, pinnedPositions, orientation));
  const [nodes, setNodes] = useState<LatticeFlowNode[]>(initialGraph.nodes);
  const [edges, setEdges] = useState<LatticeFlowEdge[]>(initialGraph.edges);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [layoutViewport, setLayoutViewport] = useState({ width: 1440, height: 900, inspectorWidth: 0, toolbarHeight: 0, gutter: 24 });
  const layoutSequence = useRef(0);
  const layoutSessionRef = useRef<LayoutSession | undefined>(undefined);
  const staleResultsRejectedRef = useRef(0);
  const visibleCountRef = useRef(initialGraph.nodes.length);
  const nodesRef = useRef(initialGraph.nodes);
  const revealTimerRef = useRef<number | null>(null);
  const callbacks = useRef({ onSelectEntity, onSelectRelationship, onToggle, onViewport, onPinPosition, onClearTransient, onNodeAction, onEdgeAction });
  useEffect(() => { callbacks.current = { onSelectEntity, onSelectRelationship, onToggle, onViewport, onPinPosition, onClearTransient, onNodeAction, onEdgeAction }; }, [onSelectEntity, onSelectRelationship, onToggle, onViewport, onPinPosition, onClearTransient, onNodeAction, onEdgeAction]);
  const escapePressed = useKeyPress("Escape");

  useEffect(() => {
    if (escapePressed) callbacks.current.onClearTransient();
  }, [escapePressed]);

  useEffect(() => {
    const handleFit = () => void fitView({ padding: .18, duration: reducedMotion ? 0 : 320 });
    const handleCollapse = () => nodesRef.current.filter(node => node.id.startsWith("projection:domain:") && node.data.expanded).forEach(node => callbacks.current.onToggle(node.id));
    window.addEventListener("lattice:fit-view", handleFit);
    window.addEventListener("lattice:collapse-all", handleCollapse);
    return () => { window.removeEventListener("lattice:fit-view", handleFit); window.removeEventListener("lattice:collapse-all", handleCollapse); };
  }, [fitView, reducedMotion]);

  useEffect(() => {
    void setViewport(viewport, { duration: 0 });
    // Restore persisted camera at mount only. Live motion remains internal until move-end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    const handleGeometry = (event: Event) => {
      const detail = (event as CustomEvent<{active:boolean;id:string}>).detail;
      if (!detail) return;
      detail.active ? geometryBusy.current.add(detail.id) : geometryBusy.current.delete(detail.id);
      const labels=Array.from(document.querySelectorAll<HTMLElement>(".lattice-edge-label"));
      if(labels.length){void animate(labels,{opacity:geometryBusy.current.size?0:1},{duration:reducedMotion?0:geometryBusy.current.size?0.08:0.14});}
      if (!geometryBusy.current.size) {
        if (settlementFrame.current) cancelAnimationFrame(settlementFrame.current);
        settlementFrame.current = requestAnimationFrame(() => requestAnimationFrame(() => {
          layoutSequence.current += 1;
          window.dispatchEvent(new CustomEvent("lattice:routes-settled"));
        }));
      }
    };
    window.addEventListener("lattice:geometry-motion", handleGeometry);
    return () => { window.removeEventListener("lattice:geometry-motion", handleGeometry); if (settlementFrame.current) cancelAnimationFrame(settlementFrame.current); };
  }, [animate, reducedMotion]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) setLayoutViewport((current) => current.width === width && current.height === height ? current : { ...current, width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const signal = ++layoutSequence.current;
    layoutProjection(projection, orientation, signal, pinnedPositions, layoutViewport, layoutSessionRef.current)
      .then((result) => {
        const converted = toReactFlow(projection, result.positions, pinnedPositions, orientation, result);
        if (result.signal !== layoutSequence.current) { staleResultsRejectedRef.current += 1; return; }
        result.diagnostics.stability && (result.diagnostics.stability.staleResultsRejected = staleResultsRejectedRef.current);
        layoutSessionRef.current = result.session;
        const previousCount = visibleCountRef.current;
        const previousIds = new Set(nodesRef.current.map((node) => node.id));
        const stagedNodes = converted.nodes.map((node, index) => ({
          ...node,
          data: { ...node.data, entering: !previousIds.has(node.id), revealIndex: index },
          className: `${node.className ?? ""} ${!previousIds.has(node.id) ? "is-entering" : ""}`.trim(),
          style: { ...node.style, transitionDelay: `${Math.min(index * 18, 180)}ms` },
        } as LatticeFlowNode));
        nodesRef.current = stagedNodes;
        setNodes(stagedNodes);
        setEdges(converted.edges.map((edge) => ({ ...edge, data: { ...edge.data!, animation: previousIds.has(edge.source) && previousIds.has(edge.target) ? edge.data!.animation : "resolved" } })));
        visibleCountRef.current = converted.nodes.length;
        if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = window.setTimeout(() => {
          setNodes((current) => {
            const settled = current.map((node) => ({ ...node, className: node.className?.replace("is-entering", "").trim(), data: { ...node.data, entering: false } } as LatticeFlowNode));
            nodesRef.current = settled;
            return settled;
          });
          setEdges((current) => current.map((edge) => ({ ...edge, data: { ...edge.data!, animation: edge.selected ? "selected" : "settled" } } as LatticeFlowEdge)));
        }, 520);
        if (previousCount === 0 && converted.nodes.length > 0) requestAnimationFrame(() => { void fitView({ padding: .22, duration: 320, interpolate: "smooth" }); });
      })
      .catch(() => undefined);
    return () => { layoutSequence.current += 1; };
  }, [fitView, orientation, pinnedPositions, projection, layoutViewport]);

  useEffect(() => () => {
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<LatticeFlowNode>[]) => {
    setNodes((current: LatticeFlowNode[]) => {
      const next = applyNodeChanges(changes, current);
      nodesRef.current = next;
      return next;
    });
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<LatticeFlowEdge>[]) => {
    setEdges((current: LatticeFlowEdge[]) => applyEdgeChanges(changes, current));
  }, []);
  const handleNodeClick = useCallback((_: ReactMouseEvent, node: LatticeFlowNode) => callbacks.current.onSelectEntity(node.id), []);
  const handleEdgeClick = useCallback((_: ReactMouseEvent, edge: LatticeFlowEdge) => callbacks.current.onSelectRelationship(edge.id), []);
  const handleNodeDoubleClick = useCallback((event: ReactMouseEvent, node: LatticeFlowNode) => { if(event.shiftKey) callbacks.current.onNodeAction({nodeId:node.id,action:"collapse-descendants"}); else if(event.altKey) callbacks.current.onNodeAction({nodeId:node.id,action:"expand-branch"}); else callbacks.current.onToggle(node.id); }, []);

  const handleMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, next: Viewport) => callbacks.current.onViewport(next), []);
  const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: LatticeFlowNode) => callbacks.current.onPinPosition(node.id, node.position), []);
  const handlePaneClick = useCallback(() => callbacks.current.onClearTransient(), []);
  const selectedNodes = nodes.filter((node) => node.selected && node.data.category !== "cluster");
  const fitSelected = useCallback(() => { if (selectedNodes.length) void fitView({ nodes: selectedNodes, padding: 0.28, duration: reducedMotion ? 0 : 360, interpolate: "smooth" }); }, [fitView, selectedNodes]);

  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 280, damping: 30, mass: 0.8 }}>
    <div ref={(node) => { canvasRef.current = node; motionScope.current = node; }} className="lattice-flow h-full" onClick={(event) => {
      const target = event.target as HTMLElement;
      const edgeActionElement=target.closest<HTMLElement>("[data-edge-action]");
      if(edgeActionElement?.dataset.edgeAction&&edgeActionElement.dataset.edgeId){
        event.stopPropagation();
        const edgeId=edgeActionElement.dataset.edgeId;
        const action=edgeActionElement.dataset.edgeAction as LatticeEdgeActionIntent["action"];
        if(action==="trace"){
          const selectedEdge=edges.find((edge)=>edge.id===edgeId);
          if(selectedEdge){
            const source=nodes.find((node)=>node.id===selectedEdge.source);
            const target=nodes.find((node)=>node.id===selectedEdge.target);
            const neighbourhood=new Set<string>([selectedEdge.source,selectedEdge.target]);
            if(source){getIncomers(source,nodes,edges).forEach((node)=>neighbourhood.add(node.id));getConnectedEdges([source],edges).forEach((edge)=>{neighbourhood.add(edge.source);neighbourhood.add(edge.target);});}
            if(target){getOutgoers(target,nodes,edges).forEach((node)=>neighbourhood.add(node.id));getConnectedEdges([target],edges).forEach((edge)=>{neighbourhood.add(edge.source);neighbourhood.add(edge.target);});}
            setNodes((current)=>current.map((node)=>({...node,data:{...node.data,dimmed:!neighbourhood.has(node.id)}} as LatticeFlowNode)));
            setEdges((current)=>current.map((edge)=>({...edge,data:{...edge.data!,animation:edge.id===edgeId||neighbourhood.has(edge.source)&&neighbourhood.has(edge.target)?"trace":"settled",importance:neighbourhood.has(edge.source)&&neighbourhood.has(edge.target)?edge.data!.importance:"background"}} as LatticeFlowEdge)));
          }
        }
        callbacks.current.onEdgeAction({edgeId,action});return;}
      const actionElement = target.closest<HTMLElement>("[data-node-action]");
      if (actionElement?.dataset.nodeAction && actionElement.dataset.nodeId) { event.stopPropagation(); callbacks.current.onNodeAction({nodeId:actionElement.dataset.nodeId,action:actionElement.dataset.nodeAction as LatticeNodeActionIntent["action"]}); return; }
      const id = target.closest<HTMLElement>("[data-expand-node]")?.dataset.expandNode;
      if (id) { event.stopPropagation(); callbacks.current.onToggle(id); }
    }}>
      <ReactFlow<LatticeFlowNode, LatticeFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={LATTICE_NODE_TYPES}
        edgeTypes={LATTICE_EDGE_TYPES}
        defaultEdgeOptions={LATTICE_DEFAULT_EDGE_OPTIONS}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        edgesReconnectable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        onlyRenderVisibleElements={nodes.length > 120}
        onMoveEnd={handleMoveEnd}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={LATTICE_FIT_VIEW_OPTIONS}
        minZoom={0.2}
        maxZoom={1.8}
        panOnScroll
        panOnScrollSpeed={0.5}
        zoomOnScroll={false}
        zoomActivationKeyCode="Control"
        zoomOnPinch
        zoomOnDoubleClick={false}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[...LATTICE_PAN_BUTTONS]}
        panActivationKeyCode="Space"
        multiSelectionKeyCode="Control"
        selectionKeyCode={null}
        snapToGrid={false}
        snapGrid={LATTICE_SNAP_GRID}
        elevateNodesOnSelect
        elevateEdgesOnSelect
        nodesFocusable
        edgesFocusable
        autoPanOnNodeFocus
        proOptions={LATTICE_PRO_OPTIONS}
      >
        {selectedNodes.length > 1 ? (
          <Panel position="top-center" className="lattice-multi-toolbar nodrag nopan nowheel">
            <span>{selectedNodes.length} selected</span>
            <button type="button" onClick={fitSelected}>Fit selected</button>
            <button type="button" onClick={() => selectedNodes.forEach((node) => callbacks.current.onPinPosition(node.id, node.position))}>Pin selected</button>
            <button type="button" onClick={() => selectedNodes.forEach((node) => callbacks.current.onNodeAction({ nodeId: node.id, action: "reset-position" }))}>Unpin selected</button>
            <button type="button" onClick={() => selectedNodes.forEach((node) => callbacks.current.onNodeAction({ nodeId: node.id, action: "collapse-descendants" }))}>Collapse branches</button>
            <button type="button" onClick={() => callbacks.current.onNodeAction({ nodeId: selectedNodes[0].id, action: "compare-representations" })}>Compare</button>
          </Panel>
        ) : null}
        <Background color="#1e293b" gap={24} />
        <Controls position="bottom-left" showInteractive={false} />
        {nodes.length >= 30 ? (
          <MiniMap<LatticeFlowNode>
            position="bottom-right"
            pannable
            zoomable
            maskColor="rgba(2,6,23,.80)"
            nodeColor={(node: LatticeFlowNode) => String(node.data.source) === "sap" ? "#34d399" : "#22d3ee"}
          />
        ) : null}
      </ReactFlow>
      <span className="sr-only" aria-live="polite">{nodes.length} visible nodes and {edges.length} visible relationships</span>
    </div>
    </MotionConfig>
  );
}
