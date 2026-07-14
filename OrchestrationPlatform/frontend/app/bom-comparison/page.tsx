"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconBox,
  IconBuildingFactory,
  IconGripVertical,
  IconPlus,
  IconPlugConnected,
  IconX,
} from "@tabler/icons-react";

import { PipelineForm } from "@/components/PipelineForm";
import { ConfigitForm } from "@/components/ConfigitForm";
import { WindchillForm } from "@/components/WindchillForm";
import { QuickStartModal } from "@/components/QuickStartModal";
import { SourceBomPanel } from "@/components/SourceBomPanel";
import { ComparisonSummary } from "@/components/ComparisonSummary";
import { ComparisonSetupModal } from "@/components/ComparisonSetupModal";
import { ComparisonLoader } from "@/components/ComparisonLoader";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  getConfigitRoot,
  getTeamcenterRoot,
  getWindchillRoot,
} from "@/components/BomStreamViewer";
import { compareBoms, isValidComparisonPair } from "@/lib/bom-comparison";
import { subscribeToProgress, type PipelineProgress } from "@/lib/api";
import type {
  ComparisonFilter,
  ComparisonSelection,
  ComparisonSessionState,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";

type Category = "PLM" | "CPQ";
type ActiveSource = { type: SourceType; category: Category };
type SourceDefinition = {
  type: SourceType;
  label: string;
  category: Category;
  description: string;
  icon: ReactNode;
};

type TransitionMode = "enter" | "exit" | null;

const definitions: SourceDefinition[] = [
  {
    type: "teamcenter",
    label: "Teamcenter",
    category: "PLM",
    description: "Run Teamcenter extraction and inspect its BOM hierarchy.",
    icon: <IconPlugConnected className="h-6 w-6" />,
  },
  {
    type: "windchill",
    label: "Windchill",
    category: "PLM",
    description: "Extract and inspect a Windchill part hierarchy.",
    icon: <IconBuildingFactory className="h-6 w-6" />,
  },
  {
    type: "configit",
    label: "Configit",
    category: "CPQ",
    description: "Resolve and inspect a Configit product-model BOM.",
    icon: <IconBox className="h-6 w-6" />,
  },
];

const sourceLabels: Record<SourceType, string> = {
  teamcenter: "Teamcenter",
  windchill: "Windchill",
  configit: "Configit",
};

const sourceMeta = (type: SourceType) =>
  definitions.find((definition) => definition.type === type)!;

export default function BomComparisonPage() {
  const [activeSources, setActiveSources] = useState<ActiveSource[]>([]);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [sourceModalView, setSourceModalView] = useState<
    "categories" | "options"
  >("categories");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null,
  );

  const [teamcenterJobId, setTeamcenterJobId] = useState<string | null>(null);
  const [teamcenterRunning, setTeamcenterRunning] = useState(false);
  const [teamcenterProgress, setTeamcenterProgress] =
    useState<PipelineProgress | null>(null);

  const [configitActive, setConfigitActive] = useState(false);
  const [configitRunning, setConfigitRunning] = useState(false);
  const [configitProductId, setConfigitProductId] = useState<string | null>(
    null,
  );
  const [configitRefresh, setConfigitRefresh] = useState(0);

  const [windchillActive, setWindchillActive] = useState(false);
  const [windchillRunning, setWindchillRunning] = useState(false);
  const [windchillPartId, setWindchillPartId] = useState<string | null>(null);
  const [windchillRefresh, setWindchillRefresh] = useState(0);

  const [draggedSource, setDraggedSource] = useState<SourceType | null>(null);
  const [bomRoots, setBomRoots] = useState<
    Partial<Record<SourceType, TreeNodeData>>
  >({});
  const [comparisonSession, setComparisonSession] =
    useState<ComparisonSessionState>("idle");
  const [comparisonSelection, setComparisonSelection] =
    useState<ComparisonSelection | null>(null);
  const [comparisonFilter, setComparisonFilter] =
    useState<ComparisonFilter>("all");
  const [transitionMode, setTransitionMode] = useState<TransitionMode>(null);

  const readySources = useMemo(
    () =>
      activeSources
        .map((source) => source.type)
        .filter((source) => Boolean(bomRoots[source])),
    [activeSources, bomRoots],
  );

  const comparisonResult = useMemo(() => {
    if (
      comparisonSession !== "active" ||
      !comparisonSelection ||
      !isValidComparisonPair(
        comparisonSelection.leftSource,
        comparisonSelection.rightSource,
        bomRoots,
      )
    ) {
      return null;
    }

    return compareBoms(
      bomRoots[comparisonSelection.leftSource]!,
      comparisonSelection.leftSource,
      bomRoots[comparisonSelection.rightSource]!,
      comparisonSelection.rightSource,
    );
  }, [comparisonSession, comparisonSelection, bomRoots]);

  const closeSourceModal = () => {
    setShowSourceModal(false);
    setSourceModalView("categories");
    setSelectedCategory(null);
  };

  const addSource = (type: SourceType) => {
    setActiveSources((current) =>
      current.some((source) => source.type === type)
        ? current
        : [...current, { type, category: sourceMeta(type).category }],
    );
    closeSourceModal();
    toast.success(`${sourceLabels[type]} card added`);
  };

  const handlePipelineSubmit = useCallback((jobId: string) => {
    if (!jobId.trim()) {
      toast.error("The backend did not return a Teamcenter job ID.");
      return;
    }
    setTeamcenterJobId(jobId);
    setTeamcenterRunning(true);
    setTeamcenterProgress(null);
    toast.info("Teamcenter extraction started");
  }, []);

  useEffect(() => {
    if (!teamcenterJobId || !teamcenterRunning) return;
    return subscribeToProgress(
      teamcenterJobId,
      setTeamcenterProgress,
      (message) => toast.error(message),
      () => undefined,
    );
  }, [teamcenterJobId, teamcenterRunning]);

  const handleBomReady = useCallback(
    (source: SourceType, root: TreeNodeData | null) => {
      setBomRoots((current) => {
        const next = { ...current };
        if (root) next[source] = root;
        else delete next[source];
        return next;
      });
    },
    [],
  );

  const removeSource = (type: SourceType) => {
    setActiveSources((current) =>
      current.filter((source) => source.type !== type),
    );
    handleBomReady(type, null);

    if (
      comparisonSelection &&
      (comparisonSelection.leftSource === type ||
        comparisonSelection.rightSource === type)
    ) {
      setComparisonSession("idle");
      setComparisonSelection(null);
      setComparisonFilter("all");
    }

    if (type === "teamcenter") {
      setTeamcenterJobId(null);
      setTeamcenterRunning(false);
      setTeamcenterProgress(null);
    }
    if (type === "configit") {
      setConfigitActive(false);
      setConfigitRunning(false);
      setConfigitProductId(null);
    }
    if (type === "windchill") {
      setWindchillActive(false);
      setWindchillRunning(false);
      setWindchillPartId(null);
    }
  };

  const handleDrop = (target: SourceType, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (
      !draggedSource ||
      draggedSource === target ||
      sourceMeta(draggedSource).category !== sourceMeta(target).category
    ) {
      setDraggedSource(null);
      return;
    }

    setActiveSources((current) => {
      const next = [...current];
      const sourceIndex = next.findIndex(
        (source) => source.type === draggedSource,
      );
      const targetIndex = next.findIndex((source) => source.type === target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(
        sourceIndex < targetIndex ? targetIndex - 1 : targetIndex,
        0,
        moved,
      );
      return next;
    });
    setDraggedSource(null);
  };

  const startComparison = (selection: ComparisonSelection) => {
    setComparisonSelection(selection);
    setComparisonSession("preparing");
    setTransitionMode("enter");
  };

  const returnToWorkspace = () => {
    if (transitionMode) return;
    setTransitionMode("exit");
  };

  const handleTransitionComplete = useCallback(() => {
    if (transitionMode === "enter") {
      setComparisonSession("active");
    } else if (transitionMode === "exit") {
      setComparisonSession("idle");
      setComparisonSelection(null);
      setComparisonFilter("all");
    }
    setTransitionMode(null);
  }, [transitionMode]);

  const comparing = comparisonSession === "active" && Boolean(comparisonResult);

  const visibleSources =
    comparing && comparisonSelection
      ? activeSources.filter(
          (source) =>
            source.type === comparisonSelection.leftSource ||
            source.type === comparisonSelection.rightSource,
        )
      : activeSources;

  const visibleGroups = (["PLM", "CPQ"] as Category[])
    .map((category) => ({
      category,
      sources: visibleSources.filter((source) => source.category === category),
    }))
    .filter((group) => group.sources.length > 0);

  const modalOptions = definitions
    .filter(
      (definition) =>
        !activeSources.some((source) => source.type === definition.type),
    )
    .map((definition) => ({
      ...definition,
      value: definition.type,
      disabled: false,
    }));

  const comparisonFor = (source: SourceType) =>
    !comparisonResult
      ? undefined
      : source === comparisonResult.leftSource
        ? comparisonResult.left
        : source === comparisonResult.rightSource
          ? comparisonResult.right
          : undefined;

  const counterpartFor = (source: SourceType) =>
    !comparisonResult
      ? undefined
      : source === comparisonResult.leftSource
        ? sourceLabels[comparisonResult.rightSource]
        : source === comparisonResult.rightSource
          ? sourceLabels[comparisonResult.leftSource]
          : undefined;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[radial-gradient(circle_at_top,rgba(34,211,238,.10),transparent_42%),linear-gradient(135deg,#020617,#0f172a_48%,#111827)] dark:text-slate-50">
      <QuickStartModal
        open={showSourceModal}
        onClose={closeSourceModal}
        categories={[
          {
            label: "PLM",
            value: "PLM",
            description: "Teamcenter and Windchill",
            icon: <IconPlugConnected className="h-6 w-6" />,
          },
          {
            label: "CPQ",
            value: "CPQ",
            description: "Configit",
            icon: <IconBox className="h-6 w-6" />,
          },
        ]}
        options={modalOptions}
        currentView={sourceModalView}
        selectedCategory={selectedCategory}
        onOpenCategory={(category) => {
          setSelectedCategory(category as Category);
          setSourceModalView("options");
        }}
        onBack={() => setSourceModalView("categories")}
        onSelect={(value) => addSource(value as SourceType)}
      />

      <ComparisonSetupModal
        open={comparisonSession === "selecting"}
        readySources={readySources}
        labels={sourceLabels}
        initialSelection={comparisonSelection}
        onClose={() =>
          setComparisonSession(comparisonResult ? "active" : "idle")
        }
        onStart={startComparison}
      />

      <AnimatePresence>
        {transitionMode ? (
          <ComparisonLoader
            mode={transitionMode}
            left={comparisonSelection?.leftSource}
            right={comparisonSelection?.rightSource}
            labels={sourceLabels}
            onComplete={handleTransitionComplete}
          />
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex min-h-screen max-w-[1920px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600 dark:text-cyan-300">
                WELCOME
              </p>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                Digital Thread Orchestration Platform
              </h1>
              <p className="mt-3 text-sm text-slate-500">
                Extract and inspect BOMs independently. Start comparison only
                when needed.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <ThemeToggle compact />
              <Link
                href="/"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700"
              >
                <IconArrowLeft className="h-4 w-4" /> Overview
              </Link>
              <button
                type="button"
                onClick={() => setShowSourceModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700"
              >
                <IconPlus className="h-4 w-4" /> Add source
              </button>

              {comparing ? (
                <button
                  type="button"
                  onClick={returnToWorkspace}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white"
                >
                  <IconArrowLeft className="h-4 w-4" /> Back to workspace
                </button>
              ) : (
                <button
                  type="button"
                  disabled={readySources.length < 2}
                  onClick={() => setComparisonSession("selecting")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <IconArrowsExchange className="h-4 w-4" /> Compare BOMs
                </button>
              )}
            </div>
          </div>

          {readySources.length < 2 && !comparing ? (
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700">
              Load at least two BOMs to enable comparison.
            </p>
          ) : null}
        </header>

        {comparisonResult ? (
          <ComparisonSummary
            result={comparisonResult}
            filter={comparisonFilter}
            onFilterChange={setComparisonFilter}
            sourceLabels={sourceLabels}
            onChangeSources={() => setComparisonSession("selecting")}
            onExit={returnToWorkspace}
          />
        ) : null}

        {!activeSources.length ? (
          <section className="flex min-h-[55vh] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/60 text-center dark:border-slate-700 dark:bg-slate-900/60">
            <div>
              <IconPlus className="mx-auto h-8 w-8 text-cyan-500" />
              <h2 className="mt-4 text-xl font-semibold">
                Add your first source
              </h2>
              <button
                type="button"
                onClick={() => setShowSourceModal(true)}
                className="mt-5 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Add source
              </button>
            </div>
          </section>
        ) : (
          <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
            {visibleGroups.map((group) => (
              <section
                key={group.category}
                className="min-w-[min(100%,460px)] flex-1 snap-start rounded-[26px] border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/70 sm:p-4 lg:min-w-[540px]"
              >
                <div className="mb-4 flex justify-between">
                  <b className="text-xs uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    {group.category}
                  </b>
                  <span className="text-xs text-slate-500">
                    {group.sources.length} visible
                  </span>
                </div>

                <div
                  className={
                    group.sources.length === 1
                      ? "grid gap-4"
                      : "grid gap-4 2xl:grid-cols-2"
                  }
                >
                  {group.sources.map((source) => (
                    <article
                      key={source.type}
                      draggable={!comparing}
                      onDragStart={() => setDraggedSource(source.type)}
                      onDragEnd={() => setDraggedSource(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDrop(source.type, event)}
                      className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/80"
                    >
                      <div className="mb-5 flex justify-between">
                        <h2 className="text-xl font-semibold">
                          {sourceLabels[source.type]}
                        </h2>
                        <div className="flex gap-2">
                          {!comparing ? (
                            <IconGripVertical className="h-5 w-5 text-slate-400" />
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeSource(source.type)}
                            aria-label={`Remove ${sourceLabels[source.type]}`}
                          >
                            <IconX className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {source.type === "teamcenter" ? (
                        <>
                          <PipelineForm
                            onSubmit={handlePipelineSubmit}
                            isLoading={teamcenterRunning}
                          />
                          <div className="mt-4">
                            <SourceBomPanel
                              source="teamcenter"
                              title="PLM"
                              endpoint={
                                teamcenterJobId
                                  ? `${API_BASE}/pipeline/bom/${encodeURIComponent(teamcenterJobId)}`
                                  : ""
                              }
                              transformPayload={getTeamcenterRoot}
                              active={Boolean(teamcenterJobId)}
                              onLoadComplete={() => setTeamcenterRunning(false)}
                              onBomReady={handleBomReady}
                              progress={teamcenterProgress}
                              comparisonMode={comparing}
                              comparison={comparisonFor("teamcenter")}
                              comparisonFilter={comparisonFilter}
                              counterpartLabel={counterpartFor("teamcenter")}
                            />
                          </div>
                        </>
                      ) : null}

                      {source.type === "configit" ? (
                        <>
                          <ConfigitForm
                            onSubmit={(id) => {
                              setConfigitActive(true);
                              setConfigitRunning(true);
                              setConfigitProductId(id);
                              setConfigitRefresh((value) => value + 1);
                            }}
                            isRunning={configitRunning}
                          />
                          <div className="mt-4">
                            <SourceBomPanel
                              source="configit"
                              title="CPQ"
                              endpoint={
                                configitProductId
                                  ? `/api/bom-configit?productId=${encodeURIComponent(configitProductId)}`
                                  : "/api/bom-configit"
                              }
                              transformPayload={getConfigitRoot}
                              active={configitActive || configitRunning}
                              refreshSignal={configitRefresh}
                              onLoadComplete={() => setConfigitRunning(false)}
                              onBomReady={handleBomReady}
                              comparisonMode={comparing}
                              comparison={comparisonFor("configit")}
                              comparisonFilter={comparisonFilter}
                              counterpartLabel={counterpartFor("configit")}
                            />
                          </div>
                        </>
                      ) : null}

                      {source.type === "windchill" ? (
                        <>
                          <WindchillForm
                            onSubmit={(id) => {
                              setWindchillActive(true);
                              setWindchillRunning(true);
                              setWindchillPartId(id);
                              setWindchillRefresh((value) => value + 1);
                            }}
                            isRunning={windchillRunning}
                          />
                          <div className="mt-4">
                            <SourceBomPanel
                              source="windchill"
                              title="PLM"
                              endpoint={
                                windchillPartId
                                  ? `/api/bom-windchill?partId=${encodeURIComponent(windchillPartId)}`
                                  : "/api/bom-windchill"
                              }
                              transformPayload={getWindchillRoot}
                              active={windchillActive}
                              refreshSignal={windchillRefresh}
                              onLoadComplete={() => setWindchillRunning(false)}
                              onBomReady={handleBomReady}
                              comparisonMode={comparing}
                              comparison={comparisonFor("windchill")}
                              comparisonFilter={comparisonFilter}
                              counterpartLabel={counterpartFor("windchill")}
                            />
                          </div>
                        </>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
