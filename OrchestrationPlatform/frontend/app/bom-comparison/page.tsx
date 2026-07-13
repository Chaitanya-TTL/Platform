"use client";

import { useCallback, useState, type DragEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  IconArrowLeft,
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
import {
  getConfigitRoot,
  getTeamcenterRoot,
  getWindchillRoot,
} from "@/components/BomStreamViewer";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";

type SourceCategory = "PLM" | "CPQ";
type SourceType = "teamcenter" | "configit" | "windchill";

type ActiveSource = {
  type: SourceType;
  category: SourceCategory;
};

type SourceDefinition = {
  type: SourceType;
  label: string;
  category: SourceCategory;
  description: string;
  icon: React.ReactNode;
};

const sourceDefinitions: SourceDefinition[] = [
  {
    type: "teamcenter",
    label: "Teamcenter",
    category: "PLM",
    description:
      "Run the Teamcenter pipeline and inspect the BOM structure in a dedicated card.",
    icon: <IconPlugConnected className="h-6 w-6" />,
  },
  {
    type: "windchill",
    label: "Windchill",
    category: "PLM",
    description:
      "Extract a Windchill part hierarchy and compare it with other sources in parallel.",
    icon: <IconBuildingFactory className="h-6 w-6" />,
  },
  {
    type: "configit",
    label: "Configit",
    category: "CPQ",
    description:
      "Load the Configit product-model BOM and review relationships in a focused view.",
    icon: <IconBox className="h-6 w-6" />,
  },
];

const categoryOrder: SourceCategory[] = ["PLM", "CPQ"];

const getSourceMeta = (type: SourceType) =>
  sourceDefinitions.find((item) => item.type === type)!;

const getGroupWidthStyle = (groupCount: number, share: number) => ({
  flexBasis: 0,
  flexGrow: share,
  flexShrink: 0,
  minWidth: 0,
  maxWidth: groupCount <= 1 ? "100%" : undefined,
});

const getCardWidthStyle = (cardCount: number) => {
  if (cardCount <= 1) {
    return {
      flex: "0 0 100%",
      maxWidth: "100%",
    };
  }

  const width = `calc((100% - ${(cardCount - 1) * 1.5}rem) / ${cardCount})`;
  return {
    flex: `0 0 ${width}`,
    maxWidth: width,
  };
};

export default function BomComparisonPage() {
  const [activeSources, setActiveSources] = useState<ActiveSource[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalView, setModalView] = useState<"categories" | "options">(
    "categories",
  );
  const [selectedCategory, setSelectedCategory] =
    useState<SourceCategory | null>(null);

  const [teamcenterJobId, setTeamcenterJobId] = useState<string | null>(null);
  const [teamcenterRunning, setTeamcenterRunning] = useState(false);

  const [configitActive, setConfigitActive] = useState(false);
  const [configitRunning, setConfigitRunning] = useState(false);
  const [configitPayload, setConfigitPayload] = useState<unknown>(null);
  const [configitProgress, setConfigitProgress] = useState(0);
  const [configitMessage, setConfigitMessage] = useState("Idle");
  const [configitProductId, setConfigitProductId] = useState<string | null>(
    null,
  );
  const [configitRefreshSignal, setConfigitRefreshSignal] = useState(0);

  const [windchillActive, setWindchillActive] = useState(false);
  const [windchillRunning, setWindchillRunning] = useState(false);
  const [windchillPartId, setWindchillPartId] = useState<string | null>(null);
  const [windchillRefreshSignal, setWindchillRefreshSignal] = useState(0);

  const [draggedSource, setDraggedSource] = useState<SourceType | null>(null);

  const openModal = () => {
    setShowModal(true);
    setModalView("categories");
    setSelectedCategory(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalView("categories");
    setSelectedCategory(null);
  };

  const handleOpenCategory = (category: string) => {
    setSelectedCategory(category as SourceCategory);
    setModalView("options");
  };

  const handleBack = () => {
    setModalView("categories");
    setSelectedCategory(null);
  };

  const handleSourceSelect = (value: SourceType) => {
    setActiveSources((current) => {
      if (current.some((item) => item.type === value)) {
        return current;
      }

      const sourceMeta = getSourceMeta(value);
      return [...current, { type: value, category: sourceMeta.category }];
    });

    closeModal();
    toast.success(`${getSourceMeta(value).label} card added`);
  };

  const handlePipelineSubmit = useCallback((jobId: string) => {
    if (!jobId.trim()) {
      setTeamcenterJobId(null);
      setTeamcenterRunning(false);
      toast.error("The backend did not return a Teamcenter job ID.");
      return;
    }

    setTeamcenterJobId(jobId);
    setTeamcenterRunning(true);
    toast.info("Teamcenter extraction started");
  }, []);

  const handleTeamcenterLoadComplete = useCallback(
    (status: "ready" | "error") => {
      setTeamcenterRunning(false);

      if (status === "ready") {
        toast.success("Teamcenter BOM loaded successfully");
      }
    },
    [],
  );

  const handleConfigitSubmit = (productId: string) => {
    setConfigitPayload(null);
    setConfigitActive(true);
    setConfigitRunning(true);
    setConfigitProgress(0);
    setConfigitMessage("Preparing Configit preview...");
    setConfigitProductId(productId);
    setConfigitRefreshSignal((signal) => signal + 1);
  };

  const handleConfigitLoadComplete = useCallback(
    (_status: "ready" | "error") => {
      setConfigitRunning(false);
    },
    [],
  );

  const handleWindchillSubmit = (partId: string) => {
    setWindchillActive(true);
    setWindchillRunning(true);
    setWindchillPartId(partId);
    setWindchillRefreshSignal((signal) => signal + 1);
  };

  const handleWindchillLoadComplete = useCallback(
    (_status: "ready" | "error") => {
      setWindchillRunning(false);
    },
    [],
  );

  const resetSource = (sourceType: SourceType) => {
    setActiveSources((current) =>
      current.filter((item) => item.type !== sourceType),
    );

    if (sourceType === "teamcenter") {
      setTeamcenterJobId(null);
      setTeamcenterRunning(false);
    }

    if (sourceType === "configit") {
      setConfigitActive(false);
      setConfigitRunning(false);
      setConfigitPayload(null);
      setConfigitProgress(0);
      setConfigitMessage("Idle");
      setConfigitProductId(null);
      setConfigitRefreshSignal(0);
    }

    if (sourceType === "windchill") {
      setWindchillActive(false);
      setWindchillRunning(false);
      setWindchillPartId(null);
      setWindchillRefreshSignal(0);
    }

    toast.info(`${getSourceMeta(sourceType).label} card removed`);
  };

  const handleDropOnCard = (
    targetType: SourceType,
    event: DragEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedSource || draggedSource === targetType) {
      setDraggedSource(null);
      return;
    }

    const draggedMeta = getSourceMeta(draggedSource);
    const targetMeta = getSourceMeta(targetType);

    if (draggedMeta.category !== targetMeta.category) {
      setDraggedSource(null);
      return;
    }

    setActiveSources((current) => {
      const sourceIndex = current.findIndex(
        (item) => item.type === draggedSource,
      );
      const targetIndex = current.findIndex(
        (item) => item.type === targetType,
      );

      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const updated = [...current];
      const [movedSource] = updated.splice(sourceIndex, 1);
      const adjustedTargetIndex =
        sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;

      updated.splice(adjustedTargetIndex, 0, movedSource);
      return updated;
    });

    setDraggedSource(null);
  };

  const groups = categoryOrder
    .map((category) => ({
      category,
      sources: activeSources.filter((item) => item.category === category),
    }))
    .filter((group) => group.sources.length > 0);

  const modalOptions = sourceDefinitions
    .filter(
      (definition) =>
        !activeSources.some((item) => item.type === definition.type),
    )
    .map((definition) => ({
      ...definition,
      value: definition.type,
      category: definition.category,
      disabled: false,
    }));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_46%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)] text-slate-50">
      <AnimatePresence>
        {showModal ? (
          <QuickStartModal
            open={showModal}
            onClose={closeModal}
            categories={sourceDefinitions
              .filter(
                (definition, index, list) =>
                  list.findIndex(
                    (item) => item.category === definition.category,
                  ) === index,
              )
              .map((definition) => ({
                label: definition.category,
                description:
                  definition.category === "PLM"
                    ? "Teamcenter and Windchill live here."
                    : "Configit lives here.",
                value: definition.category,
                icon:
                  definition.category === "PLM" ? (
                    <IconPlugConnected className="h-6 w-6" />
                  ) : (
                    <IconBox className="h-6 w-6" />
                  ),
              }))}
            options={modalOptions.map((option) => ({
              ...option,
              category: option.category,
            }))}
            currentView={modalView}
            selectedCategory={selectedCategory}
            onOpenCategory={handleOpenCategory}
            onBack={handleBack}
            onSelect={(value) => {
              const selectedSource = value as SourceType;

              if (
                sourceDefinitions.some(
                  (definition) => definition.type === selectedSource,
                )
              ) {
                handleSourceSelect(selectedSource);
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex min-h-screen w-full flex-col gap-8 px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="rounded-[36px] border border-slate-700/70 bg-slate-900/80 p-6 shadow-[0_24px_80px_-36px_rgba(2,6,23,0.95)] sm:p-8"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-5xl">
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">
                BOM orchestration
              </p>
              <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">
                Digital Thread Orchestration Platform
              </h1>
              <p className="mt-4 text-sm leading-8 text-slate-300 sm:text-base">
                Add one or more sources, run extraction in parallel, and inspect
                each BOM tree in its own polished card.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex cursor-pointer items-center gap-2 rounded-3xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-white"
              >
                <IconArrowLeft className="h-4 w-4" />
                Back to overview
              </Link>

              <motion.button
                type="button"
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={openModal}
                className="inline-flex cursor-pointer items-center gap-2 rounded-3xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"
              >
                <IconPlus className="h-4 w-4" />
                Add source
              </motion.button>
            </div>
          </div>
        </motion.div>

        {!activeSources.length ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="flex min-h-[calc(100vh-8rem)] flex-1 items-center justify-center rounded-[32px] border border-dashed border-slate-700/70 bg-slate-900/70 px-8 py-12 text-center shadow-lg shadow-slate-950/20 sm:px-10"
          >
            <div className="max-w-xl">
              <p className="text-2xl font-semibold text-white">
                Add your first source to begin
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Choose Teamcenter, Configit, or Windchill to start a focused
                extraction and BOM review.
              </p>
              <motion.button
                type="button"
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={openModal}
                className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full bg-cyan-500 p-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                <IconPlus className="h-4 w-4" />
              </motion.button>
            </div>
          </motion.div>
        ) : null}

        {activeSources.length ? (
          <div className="flex w-full flex-row flex-nowrap items-start gap-6 overflow-hidden pb-2">
            {groups.map((group) => (
              <motion.section
                key={group.category}
                layout
                style={getGroupWidthStyle(
                  groups.length,
                  group.sources.length / activeSources.length,
                )}
                className="min-w-0 flex-shrink-0 rounded-[32px] border border-slate-700/70 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20"
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.28em] text-cyan-400">
                      {group.category}
                    </p>
                  </div>
                  <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">
                    {group.sources.length} active
                  </div>
                </div>

                <motion.div
                  layout
                  className="flex flex-row flex-nowrap gap-6 overflow-hidden"
                >
                  <AnimatePresence mode="popLayout">
                    {group.sources.map((source) => {
                      const sourceMeta = getSourceMeta(source.type);

                      return (
                        <motion.div
                          key={source.type}
                          layout
                          style={getCardWidthStyle(group.sources.length)}
                          className="min-w-0 flex-shrink-0"
                          initial={{ opacity: 0, y: 14, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.97 }}
                          transition={{
                            type: "spring",
                            stiffness: 220,
                            damping: 24,
                          }}
                        >
                          <motion.article
                            layout
                            draggable
                            onDragStartCapture={(
                              event: DragEvent<HTMLElement>,
                            ) => {
                              event.dataTransfer.effectAllowed = "move";
                              setDraggedSource(source.type);
                            }}
                            onDragEnd={() => setDraggedSource(null)}
                            onDragOverCapture={(
                              event: DragEvent<HTMLElement>,
                            ) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDropCapture={(event) =>
                              handleDropOnCard(source.type, event)
                            }
                            className="h-full w-full rounded-[28px] border border-slate-700/70 bg-slate-950/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                          >
                            <div className="mb-6 flex items-start justify-between gap-3">
                              <div>
                                <h3 className="mt-3 text-2xl font-semibold text-white">
                                  {sourceMeta.label}
                                </h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="rounded-full border border-slate-700/80 bg-slate-900/80 p-2 text-slate-400">
                                  <IconGripVertical className="h-4 w-4" />
                                </div>
                                <motion.button
                                  type="button"
                                  whileHover={{ y: -1, scale: 1.01 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => resetSource(source.type)}
                                  className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-2.5 text-slate-300 transition hover:border-rose-400/50 hover:text-white"
                                  aria-label={`Remove ${sourceMeta.label}`}
                                >
                                  <IconX className="h-4 w-4" />
                                </motion.button>
                              </div>
                            </div>

                            {source.type === "teamcenter" ? (
                              <>
                                <PipelineForm
                                  onSubmit={handlePipelineSubmit}
                                  isLoading={teamcenterRunning}
                                />
                                <div className="mt-6">
                                  <SourceBomPanel
                                    title="PLM"
                                    endpoint={
                                      teamcenterJobId
                                        ? `${API_BASE}/pipeline/bom/${encodeURIComponent(
                                            teamcenterJobId,
                                          )}`
                                        : ""
                                    }
                                    transformPayload={getTeamcenterRoot}
                                    active={Boolean(teamcenterJobId)}
                                    loadingLabel="Teamcenter extraction is running. Waiting for the final BOM..."
                                    onLoadComplete={
                                      handleTeamcenterLoadComplete
                                    }
                                  />
                                </div>
                              </>
                            ) : null}

                            {source.type === "configit" ? (
                              <>
                                <ConfigitForm
                                  onSubmit={handleConfigitSubmit}
                                  isRunning={configitRunning}
                                />
                                <div className="mt-6">
                                  <SourceBomPanel
                                    title="CPQ"
                                    endpoint={
                                      configitProductId
                                        ? `/api/bom-configit?productId=${encodeURIComponent(
                                            configitProductId,
                                          )}`
                                        : "/api/bom-configit"
                                    }
                                    transformPayload={getConfigitRoot}
                                    payloadOverride={configitPayload}
                                    active={configitActive || configitRunning}
                                    refreshSignal={configitRefreshSignal}
                                    onLoadComplete={handleConfigitLoadComplete}
                                  />
                                </div>
                              </>
                            ) : null}

                            {source.type === "windchill" ? (
                              <>
                                <WindchillForm
                                  onSubmit={handleWindchillSubmit}
                                  isRunning={windchillRunning}
                                />
                                <div className="mt-6">
                                  <SourceBomPanel
                                    title="PLM"
                                    endpoint={
                                      windchillPartId
                                        ? `/api/bom-windchill?partId=${encodeURIComponent(
                                            windchillPartId,
                                          )}`
                                        : "/api/bom-windchill"
                                    }
                                    transformPayload={getWindchillRoot}
                                    active={windchillActive}
                                    refreshSignal={windchillRefreshSignal}
                                    onLoadComplete={handleWindchillLoadComplete}
                                  />
                                </div>
                              </>
                            ) : null}
                          </motion.article>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              </motion.section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
