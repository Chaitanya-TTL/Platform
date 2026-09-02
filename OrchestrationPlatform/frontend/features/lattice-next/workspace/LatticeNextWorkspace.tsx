"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconSearch,
} from "@tabler/icons-react";
import { readHandoff } from "../persistence/handoff-store";
import { buildInvestigation } from "../engines/build-investigation";
import { createInvestigationGraphCore } from "../engines/investigation-graph";
import { projectVisibleGraph } from "../engines/project-visible-graph";
import {
  initialInvestigation,
  investigationReducer,
} from "../state/investigation-reducer";
import {
  clearInvestigation,
  loadInvestigation,
  saveInvestigation,
} from "../persistence/investigation-store";
import { RelationshipCanvas } from "../components/RelationshipCanvas";
import { LatticeFlowProvider } from "../canvas/LatticeFlowProvider";
import { EntityInspector } from "../components/EntityInspector";
import { IntelligenceInspector } from "../components/IntelligenceInspector";
import { IntelligenceLegend } from "../components/IntelligenceLegend";
import { RelationshipInspector } from "../components/RelationshipInspector";
import { InvestigationToolbar } from "../components/InvestigationToolbar";
import type {
  HandoffReadResult,
  LatticeHandoff,
  LatticeSourceEnvelope,
} from "../contracts/handoff";
import { DiscoveryWorkspace } from "../discovery/DiscoveryWorkspace";
import { resolveSelectedStructure } from "../discovery/structure-resolver";
import { buildCorrespondenceCandidates } from "../discovery/identity-resolution";
import {
  createDirectInvestigation,
  handoffInvestigationShell,
} from "../discovery/investigation";
import {
  listCanonicalInvestigations,
  loadCanonicalInvestigation,
  saveCanonicalInvestigation,
} from "../persistence/canonical-investigation-store";

type CanonicalInvestigation = NonNullable<
  ReturnType<typeof loadCanonicalInvestigation>
>;

type RecentInvestigation = ReturnType<
  typeof listCanonicalInvestigations
>[number];

export function LatticeNextWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const handoffId = params.get("handoff");
  const investigationId = params.get("investigation");

  const [direct, setDirect] = useState<LatticeHandoff | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentInvestigation[]>([]);

  useEffect(() => {
    setRecent(listCanonicalInvestigations());
  }, []);
  const [handoff] = useState<HandoffReadResult | null>(() => handoffId ? readHandoff(handoffId) : null);
  const [restored] = useState<CanonicalInvestigation | null>(() => investigationId ? loadCanonicalInvestigation(investigationId) : null);

  const startNewInvestigation = useCallback(() => {
    setDirect(null);
    setMessage(null);
    router.replace("/lattice");
  }, [router]);

  if (direct) {
    return <Investigation handoffId={direct.handoffId} handoff={direct} onStartNew={startNewInvestigation} />;
  }

  if (handoffId) {
    return handoff?.ok ? (
      <Investigation
        handoffId={handoff.value.handoffId}
        handoff={handoff.value}
        onStartNew={startNewInvestigation}
      />
    ) : (
      <Recovery
        message={handoff?.message ?? "The contextual handoff is unavailable."}
      />
    );
  }

  if (restored) {
    return <Restored canonical={restored} />;
  }

  return (
    <>
      {message ? (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-amber-500/30 bg-slate-950 px-4 py-2 text-sm text-amber-200">
          {message}
        </div>
      ) : null}

      <DiscoveryWorkspace
        recent={recent}
        onInvestigate={async (selected) => {
          const controller = new AbortController();
          const sources: LatticeSourceEnvelope[] = [];

          for (const result of selected) {
            const resolved = await resolveSelectedStructure(
              result,
              controller.signal,
            );

            if (resolved.warning) {
              setMessage(resolved.warning);
            }

            sources.push({
              source: result.source,
              label: result.source,
              root: resolved.root,
              nativeId: result.nativeId,
              capturedAt: new Date().toISOString(),
              completeness: resolved.warning ? "partial" : "complete",
            });
          }

          const next: LatticeHandoff = {
            version: 2,
            handoffId: `direct-${crypto.randomUUID()}`,
            subjectLabel:
              selected[0]?.displayName ?? "Engineering investigation",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ).toISOString(),
            sources,
          };

          const graph = buildInvestigation(next);
          const snapshot = {
            request: {
              requestId: next.handoffId,
              query: selected[0]?.displayName ?? "",
              normalizedQuery: "",
              queryIntent: "unknown" as const,
              requestedSources: selected.map((item) => item.source),
              resultLimitPerSource: 10,
              startedAt: next.createdAt,
              timeoutMs: 30_000,
            },
            outcomes: {} as never,
            active: false,
            completedAt: new Date().toISOString(),
          };

          saveCanonicalInvestigation(
            createDirectInvestigation({
              selected,
              correspondences: buildCorrespondenceCandidates(selected),
              snapshot,
              graph,
            }),
          );

          setDirect(next);
        }}
      />
    </>
  );
}

function Restored({ canonical }: { canonical: CanonicalInvestigation }) {
  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950 p-6 text-white">
      <section className="max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-7 text-center">
        <h1 className="text-xl font-semibold">{canonical.rootContext.label}</h1>
        <p className="mt-2 text-sm text-slate-400">
          The investigation metadata was restored. Reopen from a contextual
          source or start a new investigation to refresh source structures.
        </p>
        <Link
          href="/lattice"
          className="mt-5 inline-flex rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold"
        >
          New investigation
        </Link>
      </section>
    </main>
  );
}

function Investigation({
  handoffId,
  handoff,
  onStartNew,
}: {
  handoffId: string;
  onStartNew: () => void;
  handoff:
    | Extract<HandoffReadResult, { ok: true }>["value"]
    | LatticeHandoff;
}) {
  const domain = useMemo(() => buildInvestigation(handoff), [handoff]);
  const core = useMemo(() => createInvestigationGraphCore(domain), [domain]);
  const sources = useMemo(
    () => [...new Set(domain.entities.map((entity) => entity.source))],
    [domain.entities],
  );

  const [state, dispatch] = useReducer(
    investigationReducer,
    undefined,
    () =>
      loadInvestigation(handoffId, domain, sources) ??
      initialInvestigation(domain.roots, sources),
  );

  useEffect(() => {
    saveInvestigation(handoffId, state);
  }, [handoffId, state]);

  const startNewInvestigation = useCallback(() => {
    dispatch({ type: "start-new-investigation" });
    clearInvestigation(handoffId);
    onStartNew();
  }, [handoffId, onStartNew]);

  useEffect(() => {
    const existing = loadCanonicalInvestigation(`lattice-${handoff.handoffId}`);
    if (!existing) {
      saveCanonicalInvestigation(handoffInvestigationShell(handoff, domain));
    }
  }, [domain, handoff]);

  const projection = useMemo(
    () =>
      projectVisibleGraph(domain, core, {
        expanded: state.interaction.expansion.expanded,
        selection: state.interaction.selection,
        query: state.query,
        focusRoot: state.interaction.expansion.focusRoot,
        sources: state.activeSources,
        relationships: state.activeRelationships,
      }),
    [
      domain,
      core,
      state.interaction.expansion.expanded,
      state.interaction.selection,
      state.interaction.expansion.focusRoot,
      state.query,
      state.activeSources,
      state.activeRelationships,
    ],
  );

  const entity =
    state.interaction.selection.type === "entity"
      ? domain.byId[state.interaction.selection.id] ?? null
      : null;
  const relationship =
    state.interaction.selection.type === "relationship"
      ? domain.relationshipById[state.interaction.selection.id] ?? null
      : null;
  const related = entity
    ? domain.relationships.filter(
        (item) => item.from === entity.id || item.to === entity.id,
      )
    : [];

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#050914] p-3 text-white sm:p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startNewInvestigation}
            aria-label="New investigation"
            className="rounded-lg border border-slate-700 p-2 text-slate-400"
          >
            <IconArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-400">
              Lattice investigation
            </p>
            <h1 className="mt-1 text-lg font-semibold">
              {handoff.subjectLabel}
            </h1>
          </div>
        </div>

        <div className="flex gap-3 text-xs text-slate-500">
          <span>{domain.entities.length} entities</span>
          <span>{domain.relationships.length} relationships</span>
          <button type="button" onClick={startNewInvestigation} className="text-cyan-300">
            New investigation
          </button>
        </div>
      </header>

      <div className="relative mb-3">
        <IconSearch className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <input
          value={state.query}
          onChange={(event) =>
            dispatch({ type: "query", value: event.target.value })
          }
          placeholder="Find an assembly, component, or identifier"
          className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 text-sm outline-none focus:border-cyan-500"
        />
      </div>

      <InvestigationToolbar
        sources={sources}
        activeSources={state.activeSources}
        onSource={(value) => dispatch({ type: "source", value })}
        activeKinds={state.activeRelationships}
        onKind={(value) => dispatch({ type: "relationship", value })}
        focused={Boolean(state.interaction.expansion.focusRoot)}
        onClearFocus={() => dispatch({ type: "focus", id: null })}
        pinnedCount={Object.keys(state.interaction.pinnedPositions).length}
        onResetLayout={() => dispatch({ type: "reset-layout" })}
        onResetSelected={() => dispatch({ type: "reset-selected" })}
        canResetSelected={
          state.interaction.selection.type === "entity" &&
          Boolean(state.interaction.pinnedPositions[state.interaction.selection.id])
        }
      />

      {entity ? (
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
          <span>
            {core
              .pathToRoot(entity.id)
              .map((id) => domain.byId[id]?.name)
              .join(" / ")}
          </span>
          {entity.kind === "assembly" ? (
            <button
              onClick={() => dispatch({ type: "focus", id: entity.id })}
              className="ml-auto rounded-md border border-slate-700 px-2 py-1 text-slate-300"
            >
              Focus branch
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="grid min-h-[650px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-[520px]">
          <LatticeFlowProvider>
            <RelationshipCanvas
              projection={projection}
              orientation={state.orientation}
              pinnedPositions={state.interaction.pinnedPositions}
              viewport={state.interaction.viewport}
              onSelectEntity={(id) => dispatch({ type: "select-entity", id })}
              onSelectRelationship={(id) => dispatch({ type: "select-relationship", id })}
              onToggle={(id) => dispatch({ type: "toggle", id })}
              onViewport={(value) => dispatch({ type: "viewport", value })}
              onPinPosition={(id, position) => dispatch({ type: "pin-position", id, position })}
              onClearTransient={() => dispatch({ type: "clear-transient" })}
              onNodeAction={({nodeId,action}) => {
                if(action==="focus") dispatch({type:"focus",id:nodeId});
                else if(action==="expand-one"&&!state.interaction.expansion.expanded.has(nodeId)) dispatch({type:"toggle",id:nodeId});
                else if(action==="expand-branch") dispatch({type:"expand-many",ids:[nodeId,...core.descendants(nodeId)]});
                else if(action==="collapse-descendants") dispatch({type:"collapse-many",ids:[nodeId,...core.descendants(nodeId)]});
                else if(action==="reset-position") dispatch({type:"unpin-position",id:nodeId});
                else if(action==="toggle-pin"&&state.interaction.pinnedPositions[nodeId]) dispatch({type:"unpin-position",id:nodeId});
                else if(action==="open-details") dispatch({type:"select-entity",id:nodeId});
                else if(action==="trace-upstream") dispatch({type:"expand-many",ids:core.ancestors(nodeId)});
                else if(action==="trace-downstream") dispatch({type:"expand-many",ids:core.descendants(nodeId)});
                else if(action==="compare-representations") dispatch({type:"focus",id:domain.roots[0]??null});
              }}
              onEdgeAction={({edgeId,action}) => {
                const relationship=domain.relationships.find(item=>item.id===edgeId);
                if(!relationship) return;
                if(action==="hide-family") dispatch({type:"relationship",value:relationship.kind});
                else if(action==="trace") { dispatch({type:"expand-many",ids:[relationship.from,relationship.to,...core.ancestors(relationship.from),...core.descendants(relationship.to)]}); dispatch({type:"select-relationship",id:edgeId}); }
                else if(action==="compare-endpoints") dispatch({type:"expand-many",ids:[relationship.from,relationship.to]});
                else dispatch({type:"select-relationship",id:edgeId});
              }}
            />
          </LatticeFlowProvider>
        </div>

        {relationship ? (
          <RelationshipInspector
            relationship={relationship}
            source={domain.byId[relationship.from]}
            target={domain.byId[relationship.to]}
          />
        ) : (
          domain.metadata?.contractVersion ? <IntelligenceInspector graph={domain} entity={entity} /> : <EntityInspector entity={entity} relationships={related} />
        )}
      </section>
    </main>
  );
}

function Recovery({ message }: { message: string }) {
  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950 p-6 text-white">
      <section className="max-w-md rounded-xl border border-amber-500/25 bg-slate-900 p-7 text-center">
        <IconAlertTriangle className="mx-auto h-7 w-7 text-amber-400" />
        <h1 className="mt-4 text-lg font-semibold">
          Contextual launch unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link
            href="/lattice"
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold"
          >
            Open Discovery Mode
          </Link>
          <Link
            href="/bom-comparison"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold"
          >
            BOM Comparison
          </Link>
        </div>
      </section>
    </main>
  );
}
