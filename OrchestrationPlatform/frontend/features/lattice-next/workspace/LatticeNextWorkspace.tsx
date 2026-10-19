/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronLeft,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { readHandoff } from "../persistence/handoff-store";
import { buildInvestigation } from "../engines/build-investigation";
import { buildIntelligenceInvestigation } from "../engines/build-intelligence-investigation";
import { investigateWindchill } from "../infrastructure/windchill-intelligence-client";
import { investigateSap } from "../infrastructure/sap-intelligence-client";
import { investigateConfigit } from "../infrastructure/configit-intelligence-client";
import { mergeSourceIntelligence } from "../infrastructure/merge-source-intelligence";
import { createCurrentInvestigationRuntime } from "../kernel/infrastructure/current-investigation-runtime";
import { HttpInvestigationAuthority } from "../kernel/infrastructure/http-investigation-authority";
import { asInvestigationId } from "../kernel/contracts/investigation-identity";
import { isEngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
import type { EngineeringIntelligenceInvestigationV1 } from "../contracts/intelligence-v1";
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
import { downloadHierarchicalLatticeJson } from "../export/hierarchical-json-export";
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

export function LatticeNextWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const handoffId = params.get("handoff");
  const investigationId = params.get("investigation");

  const [direct, setDirect] = useState<LatticeHandoff | null>(null);
  const [directCanonical, setDirectCanonical] =
    useState<EngineeringIntelligenceInvestigationV1 | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [serverRestored, setServerRestored] = useState<{ handoff: LatticeHandoff; canonical: EngineeringIntelligenceInvestigationV1 } | null>(null);
  const [serverRestorePending, setServerRestorePending] = useState(Boolean(investigationId));
  useEffect(() => {
    if (!investigationId || direct) { setServerRestorePending(false); return; }
    let active = true;
    const authority = new HttpInvestigationAuthority();
    void authority.load(asInvestigationId(investigationId)).then((snapshot) => {
      if (!active) return;
      const canonical = snapshot?.canonical?.value;
      if (!snapshot || !isEngineeringIntelligenceInvestigationV1(canonical)) {
        setServerRestorePending(false);
        return;
      }
      const createdAt = snapshot.createdAt;
      setServerRestored({
        canonical,
        handoff: {
          version: 2,
          handoffId: String(snapshot.identity.investigationId),
          createdAt,
          expiresAt: new Date(Date.parse(createdAt) + 365 * 24 * 60 * 60 * 1000).toISOString(),
          subjectLabel: snapshot.subjectLabel,
          sources: snapshot.selections.map((selection) => ({
            source: selection.source as LatticeSourceEnvelope["source"],
            label: selection.source,
            nativeId: selection.nativeId,
            completeness: snapshot.completeness.failedSources.includes(selection.source) ? "partial" : "complete",
            root: { id: `${selection.source}:${selection.nativeId}`, name: selection.displayName, attributes: { "Item ID": selection.nativeId }, children: [] },
          })),
        },
      });
      setServerRestorePending(false);
    }).catch((error) => {
      if (active) { setMessage(error instanceof Error ? error.message : "The durable investigation could not be restored."); setServerRestorePending(false); }
    });
    return () => { active = false; };
  }, [investigationId, direct]);

  const [handoff] = useState<HandoffReadResult | null>(() =>
    handoffId ? readHandoff(handoffId) : null,
  );
  const [restored] = useState<CanonicalInvestigation | null>(() =>
    investigationId ? loadCanonicalInvestigation(investigationId) : null,
  );

  const startNewInvestigation = useCallback(() => {
    setDirect(null);
    setDirectCanonical(null);
    setMessage(null);
    router.replace("/lattice");
  }, [router]);

  if (direct) {
    return (
      <Investigation
        handoffId={direct.handoffId}
        handoff={direct}
        canonical={directCanonical}
        onStartNew={startNewInvestigation}
      />
    );
  }

  if (serverRestored) {
    return <Investigation handoffId={serverRestored.handoff.handoffId} handoff={serverRestored.handoff} canonical={serverRestored.canonical} onStartNew={startNewInvestigation} />;
  }
  if (serverRestorePending) {
    return <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950 text-sm text-slate-400">Restoring durable investigation...</main>;
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
      <DiscoveryWorkspace
        onInvestigate={async (selected, subjectLabel) => {
          const runtime = createCurrentInvestigationRuntime();
          const toastId = toast.loading("Creating engineering investigation", { description: "Preparing selected source evidence and opening the governed investigation workflow." });
          try {
            const result = await runtime.investigate(
              selected,
              subjectLabel || selected[0]?.displayName || "Engineering investigation",
            );
            buildIntelligenceInvestigation(result.canonical);
            setDirectCanonical(result.canonical);
            setDirect(result.handoff);
            router.replace(`/lattice?investigation=${encodeURIComponent(String(result.snapshot.identity.investigationId))}`);
            toast.success("Investigation ready", { id: toastId, description: "Canonical evidence passed validation and the investigation workspace is opening." });
            if (result.snapshot.lifecycle === "partial" || result.snapshot.completeness.overall === "partial") {
              const limitation = result.snapshot.completeness.limitations.join(" | ") || "The investigation completed with partial source evidence.";
              setMessage(limitation);
              toast.warning("Investigation opened with partial evidence", { description: limitation });
            }
          } catch (cause) {
            const technicalDetail = cause instanceof Error ? cause.message : "The Investigation Kernel could not complete the investigation.";
            const detail = /[A-Z]:\\|EPERM|EBUSY|EACCES/i.test(technicalDetail) ? "Investigation persistence is temporarily unavailable. Retry after the file lock clears." : technicalDetail;
            console.error("Lattice investigation failure", cause);
            setMessage(detail);
            toast.error("Investigation could not be created", { id: toastId, description: detail });
          }
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
  canonical,
}: {
  handoffId: string;
  onStartNew: () => void;
  canonical?: EngineeringIntelligenceInvestigationV1 | null;
  handoff: Extract<HandoffReadResult, { ok: true }>["value"] | LatticeHandoff;
}) {
  const reducedMotion = useReducedMotion();
  const [workspaceFullscreen, setWorkspaceFullscreen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const domain = useMemo(
    () =>
      canonical
        ? buildIntelligenceInvestigation({
            ...canonical,
            subject: {
              ...canonical.subject,
              displayName: handoff.subjectLabel || canonical.subject.displayName,
            },
          })
        : buildInvestigation(handoff),
    [canonical, handoff],
  );
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

  useEffect(() => {
    const toggle = () => setWorkspaceFullscreen((value) => !value);
    window.addEventListener("lattice:toggle-workspace-fullscreen", toggle);
    return () =>
      window.removeEventListener("lattice:toggle-workspace-fullscreen", toggle);
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (!workspaceFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspaceFullscreen]);

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
      ? (domain.byId[state.interaction.selection.id] ?? null)
      : null;
  const relationship =
    state.interaction.selection.type === "relationship"
      ? (domain.relationshipById[state.interaction.selection.id] ?? null)
      : null;
  const related = entity
    ? domain.relationships.filter(
        (item) => item.from === entity.id || item.to === entity.id,
      )
    : [];

  return (
    <MotionConfig reducedMotion="user">
      <main
        className={
          workspaceFullscreen
            ? "fixed inset-0 z-[100] flex h-dvh min-h-0 flex-col overflow-hidden bg-[#050914] p-3 text-white sm:p-4"
            : "flex h-[calc(100dvh-64px)] min-h-0 flex-col overflow-hidden bg-[#050914] p-3 text-white sm:p-4"
        }
      >
        {/* <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/75 px-4 py-3">
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
      </header> */}

        {/* <div className="relative mb-3">
        <IconSearch className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <input
          value={state.query}
          onChange={(event) =>
            dispatch({ type: "query", value: event.target.value })
          }
          placeholder="Find an assembly, component, or identifier"
          className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 text-sm outline-none focus:border-cyan-500"
        />
      </div> */}

        <div className="shrink-0">
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
            onRearrange={() => window.dispatchEvent(new CustomEvent("lattice:bilateral-reflow"))}
            arranging={arranging}
            onDownloadJson={() => downloadHierarchicalLatticeJson(domain)}
            canResetSelected={
              state.interaction.selection.type === "entity" &&
              Boolean(
                state.interaction.pinnedPositions[state.interaction.selection.id],
              )
            }
          />

        </div>
        {entity ? (
          <div className="mb-3 flex shrink-0 items-center gap-2 text-xs text-slate-500">
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

        <motion.section
          layout
          className="relative grid min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
          style={{
            gridTemplateColumns: state.inspectorOpen
              ? "minmax(0,1fr) 340px"
              : "minmax(0,1fr)",
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 32,
            mass: 0.85,
          }}
        >
          <div className="min-h-0 min-w-0 overflow-hidden">
            <LatticeFlowProvider>
              <RelationshipCanvas
                projection={projection}
                orientation={state.orientation}
                pinnedPositions={state.interaction.pinnedPositions}
                viewport={state.interaction.viewport}
                layoutMode={state.interaction.layoutMode}
                onBilateralReflow={(positions) => { dispatch({ type: "bilateral-reflow", positions }); setArranging(false); }}
                onBilateralReflowStart={() => setArranging(true)}
                onCollapseAll={() => dispatch({ type: "collapse-all" })}
                onSelectEntity={(id) => dispatch({ type: "select-entity", id })}
                onSelectRelationship={(id) =>
                  dispatch({ type: "select-relationship", id })
                }
                onToggle={(id) => dispatch({ type: "toggle", id })}
                onViewport={(value) => dispatch({ type: "viewport", value })}
                onPinPosition={(id, position) =>
                  dispatch({ type: "pin-position", id, position })
                }
                onClearTransient={() => dispatch({ type: "clear-transient" })}
                onEscape={() =>
                  state.inspectorOpen
                    ? dispatch({ type: "close-inspector" })
                    : dispatch({ type: "clear-transient" })
                }
                onNodeAction={({ nodeId, action }) => {
                  if (action === "focus")
                    dispatch({ type: "focus", id: nodeId });
                  else if (
                    action === "expand-one" &&
                    !state.interaction.expansion.expanded.has(nodeId)
                  )
                    dispatch({ type: "toggle", id: nodeId });
                  else if (action === "expand-branch")
                    dispatch({
                      type: "expand-many",
                      ids: [nodeId, ...core.descendants(nodeId)],
                    });
                  else if (action === "collapse-descendants")
                    dispatch({
                      type: "collapse-many",
                      ids: [nodeId, ...core.descendants(nodeId)],
                    });
                  else if (action === "reset-position")
                    dispatch({ type: "unpin-position", id: nodeId });
                  else if (
                    action === "toggle-pin" &&
                    state.interaction.pinnedPositions[nodeId]
                  )
                    dispatch({ type: "unpin-position", id: nodeId });
                  else if (action === "open-details")
                    dispatch({ type: "select-entity", id: nodeId });
                  else if (action === "trace-upstream")
                    dispatch({
                      type: "expand-many",
                      ids: core.ancestors(nodeId),
                    });
                  else if (action === "trace-downstream")
                    dispatch({
                      type: "expand-many",
                      ids: core.descendants(nodeId),
                    });
                  else if (action === "compare-representations")
                    dispatch({ type: "focus", id: domain.roots[0] ?? null });
                }}
                onEdgeAction={({ edgeId, action }) => {
                  const relationship = domain.relationships.find(
                    (item) => item.id === edgeId,
                  );
                  if (!relationship) return;
                  if (action === "hide-family")
                    dispatch({
                      type: "relationship",
                      value: relationship.kind,
                    });
                  else if (action === "trace") {
                    dispatch({
                      type: "expand-many",
                      ids: [
                        relationship.from,
                        relationship.to,
                        ...core.ancestors(relationship.from),
                        ...core.descendants(relationship.to),
                      ],
                    });
                    dispatch({ type: "select-relationship", id: edgeId });
                  } else if (action === "compare-endpoints")
                    dispatch({
                      type: "expand-many",
                      ids: [relationship.from, relationship.to],
                    });
                  else dispatch({ type: "select-relationship", id: edgeId });
                }}
              />
            </LatticeFlowProvider>
          </div>

          <AnimatePresence initial={false}>
            {state.inspectorOpen ? (
              <motion.aside
                key="lattice-inspector-panel"
                id="lattice-inspector-panel"
                initial={
                  reducedMotion ? { opacity: 1 } : { x: 340, opacity: 0 }
                }
                animate={{ x: 0, opacity: 1 }}
                exit={reducedMotion ? { opacity: 0 } : { x: 340, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 32,
                  mass: 0.85,
                }}
                className="relative min-w-0 overflow-hidden border-l border-slate-800"
              >
                <button
                  type="button"
                  onClick={() => dispatch({ type: "close-inspector" })}
                  aria-label="Close details"
                  className="absolute right-3 top-3 z-20 rounded-lg border border-slate-700 bg-slate-950/90 p-1.5 text-slate-400 hover:text-white"
                >
                  <IconX className="h-4 w-4" />
                </button>
                {relationship ? (
                  <RelationshipInspector
                    relationship={relationship}
                    source={domain.byId[relationship.from]}
                    target={domain.byId[relationship.to]}
                  />
                ) : domain.metadata?.contractVersion ? (
                  <IntelligenceInspector graph={domain} entity={entity} />
                ) : (
                  <EntityInspector entity={entity} relationships={related} />
                )}
              </motion.aside>
            ) : null}
          </AnimatePresence>

          {!state.inspectorOpen ? (
            <motion.button
              initial={reducedMotion ? undefined : { x: 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              type="button"
              onClick={() => dispatch({ type: "open-inspector" })}
              aria-expanded="false"
              aria-controls="lattice-inspector-panel"
              className="absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-slate-300 shadow-xl"
            >
              <IconChevronLeft className="h-4 w-4" /> Details
            </motion.button>
          ) : null}
        </motion.section>
      </main>
    </MotionConfig>
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