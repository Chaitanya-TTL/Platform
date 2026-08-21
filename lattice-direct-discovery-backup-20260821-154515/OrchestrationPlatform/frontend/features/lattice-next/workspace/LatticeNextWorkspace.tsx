"use client";
import { useEffect, useMemo, useReducer } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  loadInvestigation,
  saveInvestigation,
} from "../persistence/investigation-store";
import { RelationshipCanvas } from "../components/RelationshipCanvas";
import { EntityInspector } from "../components/EntityInspector";
import { RelationshipInspector } from "../components/RelationshipInspector";
import { InvestigationToolbar } from "../components/InvestigationToolbar";
import type { HandoffReadResult } from "../contracts/handoff";
export function LatticeNextWorkspace() {
  const search = useSearchParams(),
    id = search.get("handoff");
  const result = useMemo<HandoffReadResult>(
    () =>
      id
        ? readHandoff(id)
        : {
            ok: false,
            code: "not-found",
            message: "No Lattice handoff was provided.",
          },
    [id],
  );
  return result.ok ? (
    <Investigation handoffId={result.value.handoffId} handoff={result.value} />
  ) : (
    <Recovery message={result.message} />
  );
}
function Investigation({
  handoffId,
  handoff,
}: {
  handoffId: string;
  handoff: Extract<HandoffReadResult, { ok: true }>["value"];
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
  const projection = useMemo(
    () =>
      projectVisibleGraph(domain, core, {
        expanded: state.expanded,
        selection: state.selection,
        query: state.query,
        focusRoot: state.focusRoot,
        sources: state.activeSources,
        relationships: state.activeRelationships,
      }),
    [domain, core, state],
  );
  const entity =
      state.selection.type === "entity"
        ? (domain.byId[state.selection.id] ?? null)
        : null,
    relationship =
      state.selection.type === "relationship"
        ? (domain.relationshipById[state.selection.id] ?? null)
        : null,
    related = entity
      ? domain.relationships.filter(
          (r) => r.from === entity.id || r.to === entity.id,
        )
      : [];
  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#050914] p-3 text-white sm:p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/bom-comparison"
            aria-label="Return to source workspace"
            className="rounded-lg border border-slate-700 p-2 text-slate-400"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
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
          <span className="text-emerald-400">Auto-save active</span>
        </div>
      </header>
      <div className="relative mb-3">
        <IconSearch className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <input
          value={state.query}
          onChange={(e) => dispatch({ type: "query", value: e.target.value })}
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
        focused={Boolean(state.focusRoot)}
        onClearFocus={() => dispatch({ type: "focus", id: null })}
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
          <RelationshipCanvas
            projection={projection}
            orientation={state.orientation}
            onSelectEntity={(id) => dispatch({ type: "select-entity", id })}
            onSelectRelationship={(id) =>
              dispatch({ type: "select-relationship", id })
            }
            onToggle={(id) => dispatch({ type: "toggle", id })}
            onViewport={(value) => dispatch({ type: "viewport", value })}
          />
        </div>
        {relationship ? (
          <RelationshipInspector
            relationship={relationship}
            source={domain.byId[relationship.from]}
            target={domain.byId[relationship.to]}
          />
        ) : (
          <EntityInspector entity={entity} relationships={related} />
        )}
      </section>
      <p className="sr-only" aria-live="polite">
        {entity
          ? `${entity.name} selected`
          : relationship
            ? `${relationship.kind} relationship selected`
            : "No selection"}
      </p>
    </main>
  );
}
function Recovery({ message }: { message: string }) {
  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950 p-6 text-white">
      <section className="max-w-md rounded-xl border border-amber-500/25 bg-slate-900 p-7 text-center">
        <IconAlertTriangle className="mx-auto h-7 w-7 text-amber-400" />
        <h1 className="mt-4 text-lg font-semibold">
          Investigation unavailable
        </h1>
        <p className="mt-2 text-sm text-slate-400">{message}</p>
      </section>
    </main>
  );
}
