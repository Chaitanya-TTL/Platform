"use client";
import "@xyflow/react/dist/style.css";
import "../lattice-next.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Viewport,
} from "@xyflow/react";
import { toReactFlow } from "../infrastructure/react-flow-adapter";
import { layoutProjection } from "../infrastructure/elk-layout-adapter";
import type {
  LayoutOrientation,
  RelationshipProjection,
  RendererViewport,
} from "../contracts/projection";
import { EngineeringNode } from "./EngineeringNode";
const nodeTypes = { engineering: EngineeringNode };
export function RelationshipCanvas({
  projection,
  orientation,
  onSelectEntity,
  onSelectRelationship,
  onToggle,
  onViewport,
}: {
  projection: RelationshipProjection;
  orientation: LayoutOrientation;
  onSelectEntity: (id: string) => void;
  onSelectRelationship: (id: string) => void;
  onToggle: (id: string) => void;
  onViewport: (v: RendererViewport) => void;
}) {
  const [positions, setPositions] = useState<
      Record<string, { x: number; y: number }>
    >({}),
    sequence = useRef(0);
  useEffect(() => {
    const token = ++sequence.current;
    layoutProjection(projection, orientation, token)
      .then((r) => {
        if (r.signal === sequence.current) setPositions(r.positions);
      })
      .catch(() => {});
    return () => {
      sequence.current += 1;
    };
  }, [projection, orientation]);
  const converted = useMemo(
    () => toReactFlow(projection, positions),
    [projection, positions],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(converted.nodes),
    [edges, setEdges, onEdgesChange] = useEdgesState(converted.edges);
  useEffect(() => {
    setNodes(converted.nodes);
    setEdges(converted.edges);
  }, [converted, setNodes, setEdges]);
  return (
    <div
      className="lattice-flow h-full"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const id =
          target.closest<HTMLElement>("[data-expand-node]")?.dataset.expandNode;
        if (id) {
          e.stopPropagation();
          onToggle(id);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, n) => onSelectEntity(n.id)}
        onEdgeClick={(_, e) => onSelectRelationship(e.id)}
        onNodeDoubleClick={(_, n) => onToggle(n.id)}
        onMoveEnd={(_, v: Viewport) => onViewport(v)}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={24} />
        <Controls position="bottom-left" showInteractive={false} />
        {nodes.length >= 30 ? (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            maskColor="rgba(2,6,23,.80)"
            nodeColor={(n) =>
              String((n.data as { source?: string })?.source) === "sap"
                ? "#34d399"
                : "#22d3ee"
            }
          />
        ) : null}
      </ReactFlow>
    </div>
  );
}
