"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconBox,
  IconBuildingFactory,
  IconPlus,
  IconChevronRight,
  IconCircleCheck,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";

import { PipelineForm } from "@/components/PipelineForm";
import { ConfigitForm } from "@/components/ConfigitForm";
import { QuickStartModal } from "@/components/QuickStartModal";
import { SourceBomPanel } from "@/components/SourceBomPanel";
import { getConfigitRoot, getTeamcenterRoot } from "@/components/BomStreamViewer";

export default function Home() {
  const [selection, setSelection] = useState<"teamcenter" | "configit" | null>(null);
  const [teamcenterJobId, setTeamcenterJobId] = useState<string | null>(null);
  const [teamcenterRunning, setTeamcenterRunning] = useState(false);
  const [configitActive, setConfigitActive] = useState(false);
  const [configitRunning, setConfigitRunning] = useState(false);
  const [configitWorkItemId, setConfigitWorkItemId] = useState<string | null>(null);
  const [configitProductModel, setConfigitProductModel] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(true);

  const handleSourceSelect = (value: "teamcenter" | "configit") => {
    setSelection(value);
    setShowModal(false);
  };

  const handlePipelineSubmit = (jobId: string) => {
    setTeamcenterJobId(jobId);
    setTeamcenterRunning(true);
  };

  const handleConfigitSubmit = (workItemId: string, productModel: string) => {
    setConfigitActive(true);
    setConfigitRunning(true);
    setConfigitWorkItemId(workItemId);
    setConfigitProductModel(productModel);
  };

  const resetFlow = () => {
    setSelection(null);
    setTeamcenterJobId(null);
    setTeamcenterRunning(false);
    setConfigitActive(false);
    setConfigitRunning(false);
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <AnimatePresence>
        {showModal && (
          <QuickStartModal
            open={showModal}
            onClose={() => setShowModal(false)}
            options={[
              {
                label: "TeamCenter extraction",
                description: "Run the TeamCenter BOM pipeline and show the structure manager-style hierarchy.",
                value: "teamcenter",
                icon: <IconBuildingFactory className="h-6 w-6" />,
              },
              {
                label: "Configit preview",
                description: "Load the Configit extraction JSON and validate the family/feature BOM.",
                value: "configit",
                icon: <IconBox className="h-6 w-6" />,
              },
            ]}
            onSelect={handleSourceSelect}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-7xl px-4 py-10">
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
                <span>{teamcenterRunning || configitRunning ? "Running" : "Ready"}</span>
                {teamcenterRunning || configitRunning ? (
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
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Extraction input</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">Step 1: Enter input and run extraction</h2>
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
                  <p className="mt-3 text-sm leading-7">The extraction form and status will appear here once you choose TeamCenter or Configit.</p>
                </div>
              ) : selection === "teamcenter" ? (
                <div className="space-y-6">
                  <div className="rounded-4xl border border-slate-700/70 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">TeamCenter extraction</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">Run the TeamCenter pipeline</h3>
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
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-4xl border border-slate-700/70 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">Configit preview</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">Load the Configit extraction JSON</h3>
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
                <h2 className="mt-2 text-3xl font-semibold text-white">Side-by-side BOM preview</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Compare TeamCenter and Configit outputs in a cleaner, wider layout with better spacing and tree icons.
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SourceBomPanel
                title="TeamCenter source"
                subtitle="Structure Manager BOM"
                endpoint="/api/bom"
                transformPayload={getTeamcenterRoot}
                emptyLabel="Run the TeamCenter extraction to render the BOM tree."
                active={Boolean(teamcenterJobId) || teamcenterRunning}
              />

              <SourceBomPanel
                title="Configit source"
                subtitle="Family & Feature BOM"
                endpoint="/api/bom-configit"
                transformPayload={getConfigitRoot}
                emptyLabel="Start Configit preview to load the extracted Configit BOM."
                active={configitActive}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
