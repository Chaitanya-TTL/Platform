"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconBox,
  IconBuildingFactory,
  IconCircleCheck,
  IconPlus,
  IconPlugConnected,
  IconRefresh,
} from "@tabler/icons-react";

import { PipelineForm } from "@/components/PipelineForm";
import { ConfigitForm } from "@/components/ConfigitForm";
import { WindchillForm } from "@/components/WindchillForm";
import { QuickStartModal } from "@/components/QuickStartModal";
import { SourceBomPanel } from "@/components/SourceBomPanel";
import { ProgressTracker } from "@/components/ProgressTracker";
import { getBomStructure } from "@/lib/api";
import { getConfigitRoot, getTeamcenterRoot, getWindchillRoot } from "@/components/BomStreamViewer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";

type SourceType = "teamcenter" | "configit" | "windchill";

export default function BomComparisonPage() {
  const [activeSources, setActiveSources] = useState<SourceType[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [teamcenterJobId, setTeamcenterJobId] = useState<string | null>(null);
  const [teamcenterRunning, setTeamcenterRunning] = useState(false);
  const [teamcenterPayload, setTeamcenterPayload] = useState<unknown>(null);
  const [configitActive, setConfigitActive] = useState(false);
  const [configitRunning, setConfigitRunning] = useState(false);
  const [configitPayload, setConfigitPayload] = useState<unknown>(null);
  const [configitProgress, setConfigitProgress] = useState(0);
  const [configitMessage, setConfigitMessage] = useState("Idle");
  const [configitProductId, setConfigitProductId] = useState<string | null>(null);
  const [configitRefreshSignal, setConfigitRefreshSignal] = useState(0);
  const [windchillActive, setWindchillActive] = useState(false);
  const [windchillRunning, setWindchillRunning] = useState(false);
  const [windchillPartId, setWindchillPartId] = useState<string | null>(null);
  const [windchillRefreshSignal, setWindchillRefreshSignal] = useState(0);

  const showToast = (type: "success" | "error" | "info", message: string) => {
    if (type === "success") {
      toast.success(message);
      return;
    }

    if (type === "error") {
      toast.error(message);
      return;
    }

    toast.info(message);
  };

  const handleSourceSelect = (value: SourceType) => {
    setActiveSources((current) => {
      if (current.includes(value)) {
        return current;
      }
      return [...current, value];
    });
    setShowModal(false);
    toast.success(`${value.charAt(0).toUpperCase() + value.slice(1)} card added`);
  };

  const handlePipelineSubmit = async (jobId: string) => {
    setTeamcenterJobId(jobId);
    setTeamcenterPayload(null);
    setTeamcenterRunning(true);
    showToast("info", "Teamcenter extraction started");
  };

  const handleTeamcenterComplete = async (jobId: string) => {
    try {
      const bomRoot = await getBomStructure(jobId);
      if (bomRoot) {
        setTeamcenterPayload(bomRoot);
        showToast("success", "Teamcenter extraction completed");
      } else {
        setTeamcenterPayload(null);
        showToast("error", "Extraction completed but no BOM was found");
      }
    } catch (err) {
      setTeamcenterPayload(null);
      showToast("error", err instanceof Error ? err.message : "Failed to load final BOM");
    } finally {
      setTeamcenterRunning(false);
    }
  };

  const handleConfigitSubmit = (productId: string) => {
    setConfigitPayload(null);
    setConfigitActive(true);
    setConfigitRunning(true);
    setConfigitProgress(0);
    setConfigitMessage("Preparing Configit preview...");
    setConfigitProductId(productId);
    setConfigitRefreshSignal((signal) => signal + 1);
  };

  const handleWindchillSubmit = (partId: string) => {
    setWindchillActive(true);
    setWindchillRunning(true);
    setWindchillPartId(partId);
    setWindchillRefreshSignal((signal) => signal + 1);
  };

  const resetSource = (source: SourceType) => {
    if (source === "teamcenter") {
      setTeamcenterJobId(null);
      setTeamcenterPayload(null);
      setTeamcenterRunning(false);
    }

    if (source === "configit") {
      setConfigitActive(false);
      setConfigitRunning(false);
      setConfigitPayload(null);
      setConfigitProgress(0);
      setConfigitMessage("Idle");
      setConfigitProductId(null);
    }

    if (source === "windchill") {
      setWindchillActive(false);
      setWindchillRunning(false);
      setWindchillPartId(null);
    }

    toast.info(`${source.charAt(0).toUpperCase() + source.slice(1)} card reset`);
  };

  const isAnyRunning = teamcenterRunning || configitRunning || windchillRunning;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_46%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)] text-slate-50">
      <AnimatePresence>
        {showModal ? (
          <QuickStartModal
            open={showModal}
            onClose={() => setShowModal(false)}
            options={[
              {
                label: "Teamcenter",
                description: "Run the Teamcenter pipeline and inspect the BOM structure in a dedicated card.",
                value: "teamcenter",
                icon: <IconPlugConnected className="h-6 w-6" />,
              },
              {
                label: "Configit",
                description: "Load the Configit product-model BOM and review relationships in a focused view.",
                value: "configit",
                icon: <IconBox className="h-6 w-6" />,
              },
              {
                label: "Windchill",
                description: "Extract a Windchill part hierarchy and compare it with other sources in parallel.",
                value: "windchill",
                icon: <IconBuildingFactory className="h-6 w-6" />,
              },
            ]}
            onSelect={(value) => {
              if (value === "teamcenter" || value === "configit" || value === "windchill") {
                handleSourceSelect(value);
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="rounded-[36px] border border-slate-700/70 bg-slate-900/80 p-6 shadow-[0_24px_80px_-36px_rgba(2,6,23,0.95)] sm:p-8"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">Comparison workspace</p>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Build a multi-source BOM comparison without leaving the flow.</h1>
              <p className="mt-4 text-sm leading-8 text-slate-300 sm:text-base">
                Add one or more sources, run extraction in parallel, and inspect each BOM tree in its own polished card.
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
                onClick={() => setShowModal(true)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-3xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"
              >
                <IconPlus className="h-4 w-4" />
                Add source
              </motion.button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="rounded-[24px] border border-slate-700/70 bg-slate-950/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-sm text-slate-400">Active sources</p>
              <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-white">
                <span>{activeSources.length ? activeSources.join(", ") : "None"}</span>
                {activeSources.length ? <IconCircleCheck className="h-5 w-5 text-emerald-400" /> : null}
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-700/70 bg-slate-950/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-sm text-slate-400">Live status</p>
              <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-white">
                <span>{isAnyRunning ? "Running" : "Ready"}</span>
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isAnyRunning ? "bg-emerald-400" : "bg-slate-500"}`} />
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-700/70 bg-slate-950/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-sm text-slate-400">Workspace controls</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <IconRefresh className="h-4 w-4 text-cyan-300" />
                Reset any card independently from the panel header.
              </div>
            </div>
          </div>
        </motion.div>

        {!activeSources.length ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="rounded-[32px] border border-dashed border-slate-700/70 bg-slate-900/70 p-10 text-center shadow-lg shadow-slate-950/20"
          >
            <p className="text-2xl font-semibold text-white">Add your first source to begin</p>
            <p className="mt-3 text-sm leading-7 text-slate-400">Choose Teamcenter, Configit, or Windchill to start a focused extraction and BOM review.</p>
            <motion.button
              type="button"
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowModal(true)}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              <IconPlus className="h-4 w-4" />
              Add a source card
            </motion.button>
          </motion.div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          {activeSources.includes("teamcenter") ? (
            <motion.article
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="rounded-[32px] border border-slate-700/70 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-400">Teamcenter</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">BOM extraction</h2>
                </div>
                <motion.button
                  type="button"
                  whileHover={{ y: -1, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => resetSource("teamcenter")}
                  className="cursor-pointer rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-white"
                >
                  Reset
                </motion.button>
              </div>

              <PipelineForm onSubmit={handlePipelineSubmit} isLoading={teamcenterRunning} />
              {teamcenterJobId && teamcenterRunning ? (
                <div className="mt-5">
                  <ProgressTracker jobId={teamcenterJobId} onComplete={() => handleTeamcenterComplete(teamcenterJobId)} />
                </div>
              ) : null}

              <div className="mt-6">
                <SourceBomPanel
                  title="PLM"
                  subtitle="Teamcenter BOM"
                  endpoint={teamcenterJobId ? `${API_BASE}/pipeline/bom/${teamcenterJobId}` : "/api/bom"}
                  transformPayload={getTeamcenterRoot}
                  payloadOverride={teamcenterPayload}
                  emptyLabel="Run the Teamcenter extraction to render the BOM tree."
                  active={Boolean(teamcenterJobId) || teamcenterRunning}
                />
              </div>
            </motion.article>
          ) : null}

          {activeSources.includes("configit") ? (
            <motion.article
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="rounded-[32px] border border-slate-700/70 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-400">Configit</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Product model preview</h2>
                </div>
                <motion.button
                  type="button"
                  whileHover={{ y: -1, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => resetSource("configit")}
                  className="cursor-pointer rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-white"
                >
                  Reset
                </motion.button>
              </div>

              <ConfigitForm onSubmit={handleConfigitSubmit} isRunning={configitRunning} />
              {configitRunning ? (
                <div className="mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                  <div className="mb-2 flex items-center justify-between text-sm text-cyan-100">
                    <span>Live progress</span>
                    <span>{configitProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800">
                    <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${configitProgress}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{configitMessage}</p>
                </div>
              ) : null}

              <div className="mt-6">
                <SourceBomPanel
                  title="CPQ"
                  subtitle="Configit BOM"
                  endpoint={configitProductId ? `/api/bom-configit?productId=${encodeURIComponent(configitProductId)}` : "/api/bom-configit"}
                  transformPayload={getConfigitRoot}
                  payloadOverride={configitPayload}
                  emptyLabel="Start Configit preview to load the extracted BOM."
                  active={configitActive || configitRunning}
                  refreshSignal={configitRefreshSignal}
                  onLoadComplete={(status) => {
                    if (status === "ready" || status === "error") {
                      setConfigitRunning(false);
                    }
                  }}
                />
              </div>
            </motion.article>
          ) : null}

          {activeSources.includes("windchill") ? (
            <motion.article
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="rounded-[32px] border border-slate-700/70 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/20"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-400">Windchill</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Part hierarchy preview</h2>
                </div>
                <motion.button
                  type="button"
                  whileHover={{ y: -1, scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => resetSource("windchill")}
                  className="cursor-pointer rounded-2xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-white"
                >
                  Reset
                </motion.button>
              </div>

              <WindchillForm onSubmit={handleWindchillSubmit} isRunning={windchillRunning} />

              <div className="mt-6">
                <SourceBomPanel
                  title="PLM"
                  subtitle="Windchill BOM"
                  endpoint={windchillPartId ? `/api/bom-windchill?partId=${encodeURIComponent(windchillPartId)}` : "/api/bom-windchill"}
                  transformPayload={getWindchillRoot}
                  emptyLabel="Run the Windchill extraction to render the BOM tree."
                  active={windchillActive}
                  refreshSignal={windchillRefreshSignal}
                  onLoadComplete={(status) => {
                    if (status === "ready" || status === "error") {
                      setWindchillRunning(false);
                    }
                  }}
                />
              </div>
            </motion.article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
