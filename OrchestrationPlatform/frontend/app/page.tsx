"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  IconBox,
  IconBuildingFactory,
  IconPlus,
  IconCircleCheck,
  IconRefresh,
} from "@tabler/icons-react";

import { PipelineForm } from "@/components/PipelineForm";
import { ConfigitForm } from "@/components/ConfigitForm";
import { QuickStartModal } from "@/components/QuickStartModal";
import { SourceBomPanel } from "@/components/SourceBomPanel";
import { ProgressTracker } from "@/components/ProgressTracker";
import { getBomStructure } from "@/lib/api";
import { getConfigitRoot, getTeamcenterRoot } from "@/components/BomStreamViewer";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5212/api";

export default function Home() {
  const [selection, setSelection] = useState<"teamcenter" | "configit" | null>(null);
  const [teamcenterJobId, setTeamcenterJobId] = useState<string | null>(null);
  const [teamcenterRunning, setTeamcenterRunning] = useState(false);
  const [teamcenterProgress, setTeamcenterProgress] = useState(0);
  const [teamcenterMessage, setTeamcenterMessage] = useState("Idle");
  const [teamcenterPayload, setTeamcenterPayload] = useState<unknown>(null);
  const [configitActive, setConfigitActive] = useState(false);
  const [configitRunning, setConfigitRunning] = useState(false);
  const [configitProgress, setConfigitProgress] = useState(0);
  const [configitMessage, setConfigitMessage] = useState("Idle");
  const [configitPayload, setConfigitPayload] = useState<unknown>(null);
  const [showModal, setShowModal] = useState(true);

  const handleSourceSelect = (value: "teamcenter" | "configit") => {
    setSelection(value);
    setShowModal(false);
  };

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

  const handlePipelineSubmit = async (jobId: string) => {
    setTeamcenterJobId(jobId);
    setTeamcenterPayload(null);
    setTeamcenterRunning(true);
    setTeamcenterProgress(0);
    setTeamcenterMessage("Extraction started...");
    showToast("info", "Teamcenter extraction started");
  };

  const handleTeamcenterComplete = async (jobId: string) => {
    try {
      const bomRoot = await getBomStructure(jobId);
      if (bomRoot) {
        setTeamcenterPayload(bomRoot);
        setTeamcenterMessage("Extraction completed successfully");
        showToast("success", "Teamcenter extraction completed");
      } else {
        setTeamcenterPayload(null);
        setTeamcenterMessage("Extraction completed, but BOM was unavailable");
        showToast("error", "Extraction completed but no BOM was found");
      }
    } catch (err) {
      setTeamcenterPayload(null);
      setTeamcenterMessage("Failed to load final BOM");
      showToast("error", err instanceof Error ? err.message : "Failed to load final BOM");
    } finally {
      setTeamcenterRunning(false);
      setTeamcenterProgress(100);
    }
  };

  const handleConfigitSubmit = async (jobId: string, payload?: unknown) => {
    setConfigitPayload(payload ?? null);
    setConfigitActive(true);
    setConfigitRunning(false);
    setConfigitProgress(100);
    setConfigitMessage("Extraction completed");
    showToast("success", "Configit extraction completed");
  };

  const resetFlow = () => {
    setSelection(null);
    setTeamcenterJobId(null);
    setTeamcenterRunning(false);
    setTeamcenterProgress(0);
    setTeamcenterMessage("Idle");
    setTeamcenterPayload(null);
    setConfigitActive(false);
    setConfigitRunning(false);
    setConfigitProgress(0);
    setConfigitMessage("Idle");
    setConfigitPayload(null);
    setShowModal(true);
  };

  const isAnyRunning = teamcenterRunning || configitRunning;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <AnimatePresence>
        {showModal && (
          <QuickStartModal
            open={showModal}
            onClose={() => setShowModal(false)}
            options={[
              {
                label: "Teamcenter",
                description: "Extracts the BOM from Teamcenter and renders it in a tree view.",
                value: "teamcenter",
                icon: <IconBuildingFactory className="h-6 w-6" />,
              },
              {
                label: "Configit",
                description: "Extracts the BOM from Configit and renders it in a tree view.",
                value: "configit",
                icon: <IconBox className="h-6 w-6" />,
              },
            ]}
            onSelect={handleSourceSelect}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto w-full p-20">
        <div className="mb-10 rounded-4xl border border-slate-700/80 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/20">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">Welcome</p>
              <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">BOM Orchestration Platform</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Choose a source, enter the extraction input, then compare both BOM outputs in a clean product-ready dashboard.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="cursor-pointer inline-flex items-center gap-3 rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"
            >
              <IconPlus className="h-4 w-4" />
              Select source
            </button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/80 p-5">
              <p className="text-sm text-slate-400">Active source</p>
              <div className="mt-3 flex items-center gap-3 text-lg font-semibold text-white">
                <span>{selection ? selection.toUpperCase() : "None selected"}</span>
                {selection && <IconCircleCheck className="h-5 w-5 text-emerald-400" />}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/80 p-5">
              <p className="text-sm text-slate-400">Status</p>
              <div className="mt-3 flex items-center gap-3 text-lg font-semibold text-white">
                <span>{isAnyRunning ? "Running" : "Ready"}</span>
                {isAnyRunning ? (
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                ) : (
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-slate-500" />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-4xl border border-slate-700/80 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Extraction</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">Enter input and run extraction</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-sm text-slate-300 transition hover:border-cyan-400 hover:text-white"
              >
                <IconRefresh className="h-4 w-4" />
                Change source
              </button>
            </div>

            <div className="mt-8">
              {!selection ? (
                <div className="rounded-4xl border border-dashed border-slate-700/70 bg-slate-900/70 p-10 text-center text-slate-400">
                  <p className="text-xl font-medium text-white">Pick a source first to start extraction</p>
                  <p className="mt-3 text-sm leading-7">The extraction form and status will appear here once you choose Teamcenter or Configit.</p>
                </div>
              ) : selection === "teamcenter" ? (
                <div className="space-y-6">
                  <div className="rounded-4xl border border-slate-700/70 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Teamcenter</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">BOM Extraction</h3>
                      </div>
                      <button
                        type="button"
                        onClick={resetFlow}
                        className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-white"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="mt-6">
                      <PipelineForm onSubmit={handlePipelineSubmit} isLoading={teamcenterRunning} />
                      {teamcenterJobId && teamcenterRunning && (
                        <div className="mt-4">
                          <ProgressTracker
                            jobId={teamcenterJobId}
                            onComplete={() => handleTeamcenterComplete(teamcenterJobId)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-4xl border border-slate-700/70 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Configit</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">BOM Extraction</h3>
                      </div>
                      <button
                        type="button"
                        onClick={resetFlow}
                        className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-white"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="mt-6">
                      <ConfigitForm onSubmit={handleConfigitSubmit} isRunning={configitRunning} />
                      {configitRunning && (
                        <div className="mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4">
                          <div className="mb-2 flex items-center justify-between text-sm text-cyan-100">
                            <span>Live progress</span>
                            <span>{configitProgress}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-800">
                            <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${configitProgress}%` }} />
                          </div>
                          <p className="mt-2 text-sm text-slate-300">{configitMessage}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-4xl border border-slate-700/80 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/20">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">BOM comparison</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Compare Teamcenter and Configit outputs in a cleaner, wider layout with better spacing and tree icons.
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SourceBomPanel
                title="PLM"
                subtitle="Teamcenter BOM"
                endpoint={teamcenterJobId ? `${API_BASE}/pipeline/bom/${teamcenterJobId}` : "/api/bom"}
                transformPayload={getTeamcenterRoot}
                payloadOverride={teamcenterPayload}
                emptyLabel="Run the Teamcenter extraction to render the BOM tree."
                active={Boolean(teamcenterJobId) || teamcenterRunning}
              />

              <SourceBomPanel
                title="CPQ"
                subtitle="Configit BOM"
                endpoint="/api/bom-configit"
                transformPayload={getConfigitRoot}
                payloadOverride={configitPayload}
                emptyLabel="Start Configit preview to load the extracted Configit BOM."
                active={configitActive || configitRunning}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
