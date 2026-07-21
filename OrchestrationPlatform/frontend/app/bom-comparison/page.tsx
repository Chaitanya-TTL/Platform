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
  IconDatabase,
  IconGripVertical,
  IconPlus,
  IconPlugConnected,
  IconX,
} from "@tabler/icons-react";

import { AddComparisonSourceModal } from "@/components/AddComparisonSourceModal";
import {
  getConfigitRoot,
  getTeamcenterRoot,
  getWindchillRoot,
} from "@/components/BomStreamViewer";
import { ComparisonLoader } from "@/components/ComparisonLoader";
import { ComparisonSetupModal } from "@/components/ComparisonSetupModal";
import { ComparisonSummary } from "@/components/ComparisonSummary";
import { ConfigitForm } from "@/components/ConfigitForm";
import { PipelineForm } from "@/components/PipelineForm";
import { QuickStartModal } from "@/components/QuickStartModal";
import { SAPForm } from "@/components/SAPForm";
import { SourceBomPanel } from "@/components/SourceBomPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WindchillForm } from "@/components/WindchillForm";
import { subscribeToProgress, type PipelineProgress } from "@/lib/api";
import { compareMultipleBoms } from "@/lib/bom-comparison";
import type {
  ComparisonFilter,
  ComparisonSelection,
  ComparisonSessionState,
  SourceType,
  TreeNodeData,
} from "@/types/bom-comparison";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";
type Category = "PLM" | "ERP" | "CPQ";
type Active = { type: SourceType; category: Category };
type Transition = "enter" | "exit" | "add" | null;
type SourceDefinition = {
  type: SourceType;
  label: string;
  category: Category;
  description: string;
  icon: ReactNode;
};

const defs: SourceDefinition[] = [
  {
    type: "teamcenter",
    label: "Teamcenter",
    category: "PLM",
    description: "Run Teamcenter extraction.",
    icon: <IconPlugConnected className="h-6 w-6" />,
  },
  {
    type: "windchill",
    label: "Windchill",
    category: "PLM",
    description: "Extract a Windchill hierarchy.",
    icon: <IconBuildingFactory className="h-6 w-6" />,
  },
  {
    type: "sap",
    label: "SAP",
    category: "ERP",
    description: "Prepare SAP material BOM extraction.",
    icon: <IconDatabase className="h-6 w-6" />,
  },
  {
    type: "configit",
    label: "Configit",
    category: "CPQ",
    description: "Resolve a Configit product model.",
    icon: <IconBox className="h-6 w-6" />,
  },
];
const labels: Record<SourceType, string> = {
  teamcenter: "Teamcenter",
  windchill: "Windchill",
  sap: "SAP",
  configit: "Configit",
};
const meta = (type: SourceType) => defs.find((item) => item.type === type)!;

export default function Page() {
  const [active, setActive] = useState<Active[]>([]);
  const [modal, setModal] = useState(false);
  const [view, setView] = useState<"categories" | "options">("categories");
  const [category, setCategory] = useState<Category | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [tcRun, setTcRun] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [cfgActive, setCfgActive] = useState(false);
  const [cfgRun, setCfgRun] = useState(false);
  const [product, setProduct] = useState<string | null>(null);
  const [cfgRefresh, setCfgRefresh] = useState(0);
  const [wcActive, setWcActive] = useState(false);
  const [wcRun, setWcRun] = useState(false);
  const [part, setPart] = useState<string | null>(null);
  const [wcRefresh, setWcRefresh] = useState(0);
  const [dragged, setDragged] = useState<SourceType | null>(null);
  const [roots, setRoots] = useState<Partial<Record<SourceType, TreeNodeData>>>(
    {},
  );
  const [session, setSession] = useState<ComparisonSessionState>("idle");
  const [primary, setPrimary] = useState<SourceType | null>(null);
  const [compared, setCompared] = useState<SourceType[]>([]);
  const [filter, setFilter] = useState<ComparisonFilter>("all");
  const [transition, setTransition] = useState<Transition>(null);
  const [addModal, setAddModal] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<SourceType | null>(null);

  const ready = useMemo(
    () =>
      active.map((item) => item.type).filter((type) => Boolean(roots[type])),
    [active, roots],
  );
  const result = useMemo(
    () =>
      session === "active" && primary
        ? compareMultipleBoms(primary, compared, roots, labels)
        : null,
    [session, primary, compared, roots],
  );
  const comparing = session === "active" && Boolean(result);
  const included = primary ? [primary, ...compared] : [];
  const remaining = ready.filter((source) => !included.includes(source));
  const visible = comparing
    ? active.filter((item) => included.includes(item.type))
    : active;
  const groups = (["PLM", "ERP", "CPQ"] as Category[])
    .map((groupCategory) => ({
      category: groupCategory,
      sources: visible.filter((item) => item.category === groupCategory),
    }))
    .filter((group) => group.sources.length);
  const options = defs
    .filter((def) => !active.some((item) => item.type === def.type))
    .map((def) => ({ ...def, value: def.type, disabled: false }));

  const closeModal = () => {
    setModal(false);
    setView("categories");
    setCategory(null);
  };
  const addSource = (type: SourceType) => {
    setActive((current) =>
      current.some((item) => item.type === type)
        ? current
        : [...current, { type, category: meta(type).category }],
    );
    closeModal();
  };
  const onReady = useCallback(
    (source: SourceType, root: TreeNodeData | null) => {
      setRoots((current) => {
        const next = { ...current };
        if (root) next[source] = root;
        else delete next[source];
        return next;
      });
    },
    [],
  );
  const submitTc = useCallback((id: string) => {
    if (!id.trim()) return toast.error("No Teamcenter job ID returned");
    setJob(id);
    setTcRun(true);
    setProgress(null);
  }, []);

  useEffect(() => {
    if (!job || !tcRun) return;
    return subscribeToProgress(
      job,
      setProgress,
      (message) => toast.error(message),
      () => undefined,
    );
  }, [job, tcRun]);

  const start = (selection: ComparisonSelection) => {
    setPrimary(selection.leftSource);
    setCompared([selection.rightSource]);
    setSession("preparing");
    setTransition("enter");
  };
  const addComparisonSource = (source: SourceType) => {
    setAddModal(false);
    setPendingAdd(source);
    setTransition("add");
  };
  const complete = useCallback(() => {
    if (transition === "enter") setSession("active");
    if (transition === "add" && pendingAdd) {
      setCompared((current) =>
        current.includes(pendingAdd) ? current : [...current, pendingAdd],
      );
      setPendingAdd(null);
    }
    if (transition === "exit") {
      setSession("idle");
      setPrimary(null);
      setCompared([]);
      setFilter("all");
    }
    setTransition(null);
  }, [transition, pendingAdd]);

  const remove = (type: SourceType) => {
    setActive((current) => current.filter((item) => item.type !== type));
    onReady(type, null);
    if (included.includes(type)) {
      setSession("idle");
      setPrimary(null);
      setCompared([]);
    }
    if (type === "teamcenter") {
      setJob(null);
      setTcRun(false);
    }
    if (type === "configit") {
      setCfgActive(false);
      setCfgRun(false);
      setProduct(null);
    }
    if (type === "windchill") {
      setWcActive(false);
      setWcRun(false);
      setPart(null);
    }
  };
  const drop = (target: SourceType, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (
      !dragged ||
      dragged === target ||
      meta(dragged).category !== meta(target).category
    )
      return setDragged(null);
    setActive((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.type === dragged);
      const to = next.findIndex((item) => item.type === target);
      const [moved] = next.splice(from, 1);
      next.splice(from < to ? to - 1 : to, 0, moved);
      return next;
    });
    setDragged(null);
  };
  const mapFor = (source: SourceType) => result?.maps[source];
  const counterpart = (source: SourceType) =>
    source === primary
      ? compared.map((item) => labels[item]).join(" + ")
      : primary
        ? labels[primary]
        : undefined;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[radial-gradient(circle_at_top,rgba(34,211,238,.10),transparent_42%),linear-gradient(135deg,#020617,#0f172a_48%,#111827)] dark:text-slate-50">
      <QuickStartModal
        open={modal}
        onClose={closeModal}
        categories={[
          {
            label: "PLM",
            value: "PLM",
            description: "Teamcenter and Windchill",
            icon: <IconPlugConnected className="h-6 w-6" />,
          },
          {
            label: "ERP",
            value: "ERP",
            description: "SAP enterprise resource planning",
            icon: <IconDatabase className="h-6 w-6" />,
          },
          {
            label: "CPQ",
            value: "CPQ",
            description: "Configit",
            icon: <IconBox className="h-6 w-6" />,
          },
        ]}
        options={options}
        currentView={view}
        selectedCategory={category}
        onOpenCategory={(value) => {
          setCategory(value as Category);
          setView("options");
        }}
        onBack={() => setView("categories")}
        onSelect={(value) => addSource(value as SourceType)}
      />
      <ComparisonSetupModal
        open={session === "selecting"}
        readySources={ready}
        labels={labels}
        initialSelection={
          primary && compared[0]
            ? { leftSource: primary, rightSource: compared[0] }
            : null
        }
        onClose={() => setSession(comparing ? "active" : "idle")}
        onStart={start}
      />
      <AddComparisonSourceModal
        open={addModal}
        availableSources={remaining}
        labels={labels}
        onClose={() => setAddModal(false)}
        onAdd={addComparisonSource}
      />
      <AnimatePresence>
        {transition ? (
          <ComparisonLoader
            mode={transition}
            left={primary ?? undefined}
            right={compared[0]}
            addedSource={pendingAdd ?? undefined}
            labels={labels}
            onComplete={complete}
          />
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex min-h-screen max-w-[1920px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
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
                <IconArrowLeft className="h-4 w-4" />
                Overview
              </Link>
              <button
                onClick={() => setModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700"
              >
                <IconPlus className="h-4 w-4" />
                Add source
              </button>
              {comparing ? (
                <button
                  onClick={() => setTransition("exit")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white"
                >
                  <IconArrowLeft className="h-4 w-4" />
                  Back to workspace
                </button>
              ) : (
                <button
                  disabled={ready.length < 2}
                  onClick={() => setSession("selecting")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-45"
                >
                  <IconArrowsExchange className="h-4 w-4" />
                  Compare BOMs
                </button>
              )}
            </div>
          </div>
          {ready.length < 2 && !comparing ? (
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-700">
              Load at least two BOMs to enable comparison. SAP remains
              frontend-only until backend integration is available.
            </p>
          ) : null}
        </header>

        {result ? (
          <ComparisonSummary
            result={result}
            filter={filter}
            onFilterChange={setFilter}
            sourceLabels={labels}
            canAddSource={remaining.length > 0}
            onAddSource={() => setAddModal(true)}
          />
        ) : null}
        {!active.length ? (
          <section className="flex min-h-[55vh] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/60 text-center dark:border-slate-700 dark:bg-slate-900/60">
            <button
              onClick={() => setModal(true)}
              className="rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Add your first source
            </button>
          </section>
        ) : (
          <div className="bom-groups flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
            {groups.map((group) => (
              <section
                key={group.category}
                className="bom-source-group flex-none snap-start rounded-[26px] border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/70 sm:p-4 lg:min-w-0 lg:basis-0"
                style={{ flexGrow: group.sources.length }}
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
                  className="bom-source-grid grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${group.sources.length}, minmax(0, 1fr))`,
                  }}
                >
                  {group.sources.map((source) => (
                    <article
                      key={source.type}
                      draggable={!comparing}
                      onDragStart={() => setDragged(source.type)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => drop(source.type, event)}
                      className="bom-source-card min-w-0 rounded-[22px] border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/80 sm:p-4"
                    >
                      <div className="mb-5 flex justify-between gap-3">
                        <h2 className="min-w-0 truncate text-xl font-semibold">
                          {labels[source.type]}
                          {source.type === primary && comparing ? (
                            <span className="ml-2 rounded-full bg-cyan-50 px-2 py-1 text-[9px] uppercase text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
                              Primary
                            </span>
                          ) : null}
                        </h2>
                        <div className="flex shrink-0 gap-2">
                          {!comparing ? (
                            <IconGripVertical className="h-5 w-5 text-slate-400" />
                          ) : null}
                          <button
                            onClick={() => remove(source.type)}
                            aria-label={`Remove ${labels[source.type]}`}
                          >
                            <IconX className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {source.type === "teamcenter" ? (
                        <>
                          <PipelineForm onSubmit={submitTc} isLoading={tcRun} />
                          <div className="mt-4">
                            <SourceBomPanel
                              source="teamcenter"
                              title="PLM"
                              endpoint={
                                job
                                  ? `${API_BASE}/pipeline/bom/${encodeURIComponent(job)}`
                                  : ""
                              }
                              transformPayload={getTeamcenterRoot}
                              active={Boolean(job)}
                              onLoadComplete={() => setTcRun(false)}
                              onBomReady={onReady}
                              progress={progress}
                              comparisonMode={Boolean(comparing)}
                              comparison={mapFor("teamcenter")}
                              comparisonFilter={filter}
                              counterpartLabel={counterpart("teamcenter")}
                            />
                          </div>
                        </>
                      ) : null}
                      {source.type === "windchill" ? (
                        <>
                          <WindchillForm
                            onSubmit={(id) => {
                              setWcActive(true);
                              setWcRun(true);
                              setPart(id);
                              setWcRefresh((value) => value + 1);
                            }}
                            isRunning={wcRun}
                          />
                          <div className="mt-4">
                            <SourceBomPanel
                              source="windchill"
                              title="PLM"
                              endpoint={
                                part
                                  ? `/api/bom-windchill?partId=${encodeURIComponent(part)}`
                                  : "/api/bom-windchill"
                              }
                              transformPayload={getWindchillRoot}
                              active={wcActive}
                              refreshSignal={wcRefresh}
                              onLoadComplete={() => setWcRun(false)}
                              onBomReady={onReady}
                              comparisonMode={Boolean(comparing)}
                              comparison={mapFor("windchill")}
                              comparisonFilter={filter}
                              counterpartLabel={counterpart("windchill")}
                            />
                          </div>
                        </>
                      ) : null}
                      {source.type === "sap" ? <SAPForm /> : null}
                      {source.type === "configit" ? (
                        <>
                          <ConfigitForm
                            onSubmit={(id) => {
                              setCfgActive(true);
                              setCfgRun(true);
                              setProduct(id);
                              setCfgRefresh((value) => value + 1);
                            }}
                            isRunning={cfgRun}
                          />
                          <div className="mt-4">
                            <SourceBomPanel
                              source="configit"
                              title="CPQ"
                              endpoint={
                                product
                                  ? `/api/bom-configit?productId=${encodeURIComponent(product)}`
                                  : "/api/bom-configit"
                              }
                              transformPayload={getConfigitRoot}
                              active={cfgActive || cfgRun}
                              refreshSignal={cfgRefresh}
                              onLoadComplete={() => setCfgRun(false)}
                              onBomReady={onReady}
                              comparisonMode={Boolean(comparing)}
                              comparison={mapFor("configit")}
                              comparisonFilter={filter}
                              counterpartLabel={counterpart("configit")}
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
