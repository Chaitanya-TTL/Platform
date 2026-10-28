"use client";

import { useMemo, useState } from "react";
import type { Viewport, XYPosition } from "@xyflow/react";
import { RelationshipCanvas } from "../components/RelationshipCanvas";
import { LatticeFlowProvider } from "../canvas/LatticeFlowProvider";
import type {
  LatticePinnedPositions,
} from "../canvas/lattice-flow-types";
import type { RendererViewport, RelationshipProjection } from "../contracts/projection";
import type { NavigableCitationTarget } from "../copilot/citation-id";
import type { CitedGraphProjection } from "../engines/project-cited-graph";

export type CopilotCitedGraphProps = {
  answerMessageId: string;
  citedGraph: CitedGraphProjection;
  focusTarget?: NavigableCitationTarget;
  emptyMessage: string;
  unavailableMessage: string;
};

const EMPTY_VIEWPORT: RendererViewport = { x: 0, y: 0, zoom: 1 };
const EMPTY_PINNED_POSITIONS: LatticePinnedPositions = {};

export function CopilotCitedGraph({
  answerMessageId,
  citedGraph,
  focusTarget,
  emptyMessage,
  unavailableMessage,
}: CopilotCitedGraphProps) {
  const projection = citedGraph.projection;
  const hasGraph = projection.nodes.length > 0 || projection.edges.length > 0;
  const canvasScopeId = `copilot-cited:${encodeURIComponent(answerMessageId)}`;

  if (!hasGraph) {
    return (
      <div
        role="region"
        aria-label="Copilot cited graph"
        className="h-full min-h-0 min-w-0"
        data-answer-message-id={answerMessageId}
      >
        <p role="status" className="p-4 text-sm text-slate-300">
          {citedGraph.unresolvedCitations.length > 0
            ? unavailableMessage
            : emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Copilot cited graph"
      className="h-full min-h-0 min-w-0"
      data-answer-message-id={answerMessageId}
    >
      {citedGraph.unresolvedCitations.length > 0 ? (
        <p role="status" className="px-4 pt-3 text-sm text-amber-200">
          {unavailableMessage}
        </p>
      ) : null}
      <LatticeFlowProvider key={answerMessageId}>
        <CitedGraphCanvas
          key={answerMessageId}
          answerMessageId={answerMessageId}
          canvasScopeId={canvasScopeId}
          projection={projection}
          focusTarget={focusTarget}
        />
      </LatticeFlowProvider>
    </div>
  );
}

function CitedGraphCanvas({
  answerMessageId,
  canvasScopeId,
  projection,
  focusTarget,
}: {
  answerMessageId: string;
  canvasScopeId: string;
  projection: RelationshipProjection;
  focusTarget?: NavigableCitationTarget;
}) {
  const [viewport, setViewport] = useState<RendererViewport>(EMPTY_VIEWPORT);
  const [pinnedPositions, setPinnedPositions] =
    useState<LatticePinnedPositions>(EMPTY_PINNED_POSITIONS);
  const [selectedEntityId, setSelectedEntityId] = useState<string>();
  const [selectedRelationshipId, setSelectedRelationshipId] =
    useState<string>();

  const focusTargetIds = useMemo(() => {
    if (!focusTarget) return [];
    if (focusTarget.kind === "entity") {
      return projection.nodes.some((node) => node.id === focusTarget.id)
        ? [focusTarget.id]
        : [];
    }

    const relationship = projection.edges.find(
      (edge) => edge.id === focusTarget.id,
    );
    return relationship ? [relationship.source, relationship.target] : [];
  }, [focusTarget, projection]);

  const localProjection = useMemo<RelationshipProjection>(
    () => ({
      ...projection,
      nodes: projection.nodes.map((node) => ({
        ...node,
        selected: selectedEntityId
          ? node.id === selectedEntityId
          : node.selected,
      })),
      edges: projection.edges.map((edge) => ({
        ...edge,
        selected: selectedRelationshipId
          ? edge.id === selectedRelationshipId
          : edge.selected,
      })),
    }),
    [projection, selectedEntityId, selectedRelationshipId],
  );

  const selectEntity = (id: string) => {
    setSelectedEntityId(id);
    setSelectedRelationshipId(undefined);
  };
  const selectRelationship = (id: string) => {
    setSelectedRelationshipId(id);
    setSelectedEntityId(undefined);
  };
  const clearSelection = () => {
    setSelectedEntityId(undefined);
    setSelectedRelationshipId(undefined);
  };
  const savePins = (positions: Record<string, XYPosition>) => {
    setPinnedPositions((current) => ({ ...current, ...positions }));
  };
  const ignoreNodeAction = () => undefined;
  const ignoreEdgeAction = () => undefined;
  const saveViewport = (next: Viewport) => setViewport(next);

  return (
    <div
      className="h-full min-h-0 min-w-0"
      data-answer-message-id={answerMessageId}
      data-testid="copilot-cited-graph-canvas"
    >
      <RelationshipCanvas
        projection={localProjection}
        orientation="RIGHT"
        pinnedPositions={pinnedPositions}
        viewport={viewport}
        onSelectEntity={selectEntity}
        onSelectRelationship={selectRelationship}
        onToggle={() => undefined}
        onViewport={saveViewport}
        onPinPosition={(id, position) =>
          setPinnedPositions((current) => ({ ...current, [id]: position }))
        }
        onClearTransient={clearSelection}
        onNodeAction={ignoreNodeAction}
        onEdgeAction={ignoreEdgeAction}
        layoutMode="DEFAULT"
        onBilateralReflow={savePins}
        onBilateralReflowStart={() => undefined}
        onCollapseAll={() => undefined}
        canvasScopeId={canvasScopeId}
        listenToWorkspaceEvents={false}
        focusTargetIds={focusTargetIds}
        showSelectionToolbar={false}
      />
    </div>
  );
}
