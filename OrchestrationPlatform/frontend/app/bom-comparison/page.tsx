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
import { AddComparisonSourceModal } from "@/components/AddComparisonSourceModal";
import { ComparisonLoader } from "@/components/ComparisonLoader";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  getConfigitRoot,
  getTeamcenterRoot,
  getWindchillRoot,
} from "@/components/BomStreamViewer";
import { compareMultipleBoms } from "@/lib/bom-comparison";
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
type Active = { type: SourceType; category: Category };
type Transition = "enter" | "exit" | "add" | null;
const defs: {
  type: SourceType;
  label: string;
  category: Category;
  description: string;
  icon: ReactNode;
}[] = [
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
    configit: "Configit",
  },
  meta = (t: SourceType) => defs.find((x) => x.type === t)!;
export default function Page() {
  const [active, setActive] = useState<Active[]>([]),
    [modal, setModal] = useState(false),
    [view, setView] = useState<"categories" | "options">("categories"),
    [category, setCategory] = useState<Category | null>(null),
    [job, setJob] = useState<string | null>(null),
    [tcRun, setTcRun] = useState(false),
    [progress, setProgress] = useState<PipelineProgress | null>(null),
    [cfgActive, setCfgActive] = useState(false),
    [cfgRun, setCfgRun] = useState(false),
    [product, setProduct] = useState<string | null>(null),
    [cfgRefresh, setCfgRefresh] = useState(0),
    [wcActive, setWcActive] = useState(false),
    [wcRun, setWcRun] = useState(false),
    [part, setPart] = useState<string | null>(null),
    [wcRefresh, setWcRefresh] = useState(0),
    [dragged, setDragged] = useState<SourceType | null>(null),
    [roots, setRoots] = useState<Partial<Record<SourceType, TreeNodeData>>>({}),
    [session, setSession] = useState<ComparisonSessionState>("idle"),
    [primary, setPrimary] = useState<SourceType | null>(null),
    [compared, setCompared] = useState<SourceType[]>([]),
    [filter, setFilter] = useState<ComparisonFilter>("all"),
    [transition, setTransition] = useState<Transition>(null),
    [addModal, setAddModal] = useState(false),
    [pendingAdd, setPendingAdd] = useState<SourceType | null>(null);
  const ready = useMemo(
      () => active.map((x) => x.type).filter((x) => Boolean(roots[x])),
      [active, roots],
    ),
    result = useMemo(
      () =>
        session === "active" && primary
          ? compareMultipleBoms(primary, compared, roots, labels)
          : null,
      [session, primary, compared, roots],
    ),
    comparing = session === "active" && Boolean(result),
    included = primary ? [primary, ...compared] : [],
    remaining = ready.filter((s) => !included.includes(s));
  const close = () => {
      setModal(false);
      setView("categories");
      setCategory(null);
    },
    add = (t: SourceType) => {
      setActive((v) =>
        v.some((x) => x.type === t)
          ? v
          : [...v, { type: t, category: meta(t).category }],
      );
      close();
    };
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
  const onReady = useCallback(
    (s: SourceType, r: TreeNodeData | null) =>
      setRoots((v) => {
        const n = { ...v };
        if (r) n[s] = r;
        else delete n[s];
        return n;
      }),
    [],
  );
  const start = (s: ComparisonSelection) => {
      setPrimary(s.leftSource);
      setCompared([s.rightSource]);
      setSession("preparing");
      setTransition("enter");
    },
    addComparisonSource = (s: SourceType) => {
      setAddModal(false);
      setPendingAdd(s);
      setTransition("add");
    },
    back = () => setTransition("exit");
  const complete = useCallback(() => {
    if (transition === "enter") setSession("active");
    if (transition === "add" && pendingAdd) {
      setCompared((v) => (v.includes(pendingAdd) ? v : [...v, pendingAdd]));
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
  const remove = (t: SourceType) => {
    setActive((v) => v.filter((x) => x.type !== t));
    onReady(t, null);
    if (included.includes(t)) {
      setSession("idle");
      setPrimary(null);
      setCompared([]);
    }
    if (t === "teamcenter") {
      setJob(null);
      setTcRun(false);
    }
    if (t === "configit") {
      setCfgActive(false);
      setCfgRun(false);
      setProduct(null);
    }
    if (t === "windchill") {
      setWcActive(false);
      setWcRun(false);
      setPart(null);
    }
  };
  const drop = (target: SourceType, e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    if (
      !dragged ||
      dragged === target ||
      meta(dragged).category !== meta(target).category
    )
      return setDragged(null);
    setActive((v) => {
      const a = [...v],
        f = a.findIndex((x) => x.type === dragged),
        t = a.findIndex((x) => x.type === target);
      const [m] = a.splice(f, 1);
      a.splice(f < t ? t - 1 : t, 0, m);
      return a;
    });
    setDragged(null);
  };
  const visible = comparing
      ? active.filter((x) => included.includes(x.type))
      : active,
    groups = ["PLM", "CPQ"]
      .map((c) => ({
        category: c as Category,
        sources: visible.filter((x) => x.category === c),
      }))
      .filter((x) => x.sources.length),
    options = defs
      .filter((d) => !active.some((a) => a.type === d.type))
      .map((d) => ({ ...d, value: d.type, disabled: false })),
    mapFor = (s: SourceType) => result?.maps[s],
    counterpart = (s: SourceType) =>
      s === primary
        ? compared.map((x) => labels[x]).join(" + ")
        : primary
          ? labels[primary]
          : undefined;
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[radial-gradient(circle_at_top,rgba(34,211,238,.10),transparent_42%),linear-gradient(135deg,#020617,#0f172a_48%,#111827)] dark:text-slate-50">
      <QuickStartModal
        open={modal}
        onClose={close}
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
        options={options}
        currentView={view}
        selectedCategory={category}
        onOpenCategory={(c) => {
          setCategory(c as Category);
          setView("options");
        }}
        onBack={() => setView("categories")}
        onSelect={(v) => add(v as SourceType)}
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
              {/* <p className="text-xs font-semibold uppercase tracking-[.24em] text-cyan-600 dark:text-cyan-300">
                WELCOME
              </p> */}
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
                  onClick={back}
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
              Load at least two BOMs to enable comparison.
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
          <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
            {groups.map((g) => (
              <section
                key={g.category}
                className="min-w-[min(100%,460px)] flex-1 snap-start rounded-[26px] border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/70 sm:p-4 lg:min-w-[540px]"
              >
                <div className="mb-4 flex justify-between">
                  <b className="text-xs uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    {g.category}
                  </b>
                  <span className="text-xs text-slate-500">
                    {g.sources.length} visible
                  </span>
                </div>
                <div
                  className={
                    g.sources.length === 1
                      ? "grid gap-4"
                      : "grid gap-4 2xl:grid-cols-2"
                  }
                >
                  {g.sources.map((s) => (
                    <article
                      key={s.type}
                      draggable={!comparing}
                      onDragStart={() => setDragged(s.type)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => drop(s.type, e)}
                      className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/80"
                    >
                      <div className="mb-5 flex justify-between">
                        <h2 className="text-xl font-semibold">
                          {labels[s.type]}
                          {s.type === primary && comparing ? (
                            <span className="ml-2 rounded-full bg-cyan-50 px-2 py-1 text-[9px] uppercase text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
                              Primary
                            </span>
                          ) : null}
                        </h2>
                        <div className="flex gap-2">
                          {!comparing ? (
                            <IconGripVertical className="h-5 w-5 text-slate-400" />
                          ) : null}
                          <button onClick={() => remove(s.type)}>
                            <IconX className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      {s.type === "teamcenter" ? (
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
                      {s.type === "configit" ? (
                        <>
                          <ConfigitForm
                            onSubmit={(id) => {
                              setCfgActive(true);
                              setCfgRun(true);
                              setProduct(id);
                              setCfgRefresh((v) => v + 1);
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
                      {s.type === "windchill" ? (
                        <>
                          <WindchillForm
                            onSubmit={(id) => {
                              setWcActive(true);
                              setWcRun(true);
                              setPart(id);
                              setWcRefresh((v) => v + 1);
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
