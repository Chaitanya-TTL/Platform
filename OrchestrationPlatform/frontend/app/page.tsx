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
  IconPlugConnected,
} from "@tabler/icons-react";

import { PipelineForm } from "@/components/PipelineForm";
import { ConfigitForm } from "@/components/ConfigitForm";
import { WindchillForm } from "@/components/WindchillForm";
import { QuickStartModal } from "@/components/QuickStartModal";
import { SourceBomPanel } from "@/components/SourceBomPanel";
import { getConfigitRoot, getTeamcenterRoot, getWindchillRoot } from "@/components/BomStreamViewer";

export default function Home() {
  const [category, setCategory] = useState<"plm" | "cpq" | null>(null);
  const [selection, setSelection] = useState<"teamcenter" | "configit" | "windchill" | null>(null);
  const [teamcenterJobId, setTeamcenterJobId] = useState<string | null>(null);
  const [teamcenterRunning, setTeamcenterRunning] = useState(false);
  const [configitActive, setConfigitActive] = useState(false);
  const [configitRunning, setConfigitRunning] = useState(false);
  const [configitProductId, setConfigitProductId] = useState<string | null>(null);
  const [configitRefreshSignal, setConfigitRefreshSignal] = useState(0);
  const [windchillActive, setWindchillActive] = useState(false);
  const [windchillRunning, setWindchillRunning] = useState(false);
  const [windchillPartId, setWindchillPartId] = useState<string | null>(null);
  const [windchillRefreshSignal, setWindchillRefreshSignal] = useState(0);
  const [showModal, setShowModal] = useState(true);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const handleCategorySelect = (value: "plm" | "cpq") => {
    setCategory(value);
    setShowCategoryModal(true);
    setShowModal(false);
  };

  const handleSourceSelect = (value: "teamcenter" | "configit" | "windchill") => {
    setSelection(value);
    setShowCategoryModal(false);
  };

  const handlePipelineSubmit = (jobId: string) => {
    setTeamcenterJobId(jobId);
    setTeamcenterRunning(true);
  };

  const handleConfigitSubmit = (productId: string) => {
    setConfigitActive(true);
    setConfigitRunning(true);
    setConfigitProductId(productId);
    setConfigitRefreshSignal((signal) => signal + 1);
  };

  const handleWindchillSubmit = (partId: string) => {
    setWindchillActive(true);
    setWindchillRunning(true);
    setWindchillPartId(partId);
    setWindchillRefreshSignal((signal) => signal + 1);
  };

  const resetFlow = () => {
    setSelection(null);
    setCategory(null);
    setTeamcenterJobId(null);
    setTeamcenterRunning(false);
    setConfigitActive(false);
    setConfigitRunning(false);
    setWindchillActive(false);
    setWindchillRunning(false);
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
                label: "PLM extraction",
                description: "Extract BOM structure from product lifecycle management systems (Teamcenter or Windchill).",
                value: "plm",
                icon: <IconBuildingFactory className="h-6 w-6" />,
              },
              {
                label: "CPQ extraction",
                description: "Load the Configit extraction JSON and validate the family/feature configuration.",
                value: "cpq",
                icon: <IconBox className="h-6 w-6" />,
              },
            ]}
            onSelect={(val) => {
              if (val === "plm" || val === "cpq") {
                handleCategorySelect(val);
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategoryModal && category === "plm" && (
          <QuickStartModal
            open={showCategoryModal}
            onClose={() => setShowCategoryModal(false)}
            options={[
              {
                label: "Teamcenter extraction",
                description: "Run the Teamcenter BOM pipeline and show the structure manager-style hierarchy.",
                value: "teamcenter",
                icon: <IconPlugConnected className="h-6 w-6" />,
              },
              {
                label: "Windchill extraction",
                description: "Extract BOM structure from Windchill and display the part hierarchy in real-time.",
                value: "windchill",
                icon: <IconBuildingFactory className="h-6 w-6" />,
              },
            ]}
            onSelect={(val) => {
              if (val === "teamcenter" || val === "windchill") {
                handleSourceSelect(val);
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategoryModal && category === "cpq" && (
          <QuickStartModal
            open={showCategoryModal}
            onClose={() => setShowCategoryModal(false)}
            options={[
              {
                label: "Configit preview",
                description: "Load the Configit extraction JSON and validate the family/feature BOM.",
                value: "configit",
                icon: <IconBox className="h-6 w-6" />,
              },
            ]}
            onSelect={(val) => {
              if (val === "configit") {
                handleSourceSelect(val);
              }
            }}
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
                <span>{teamcenterRunning || configitRunning || windchillRunning ? "Running" : "Ready"}</span>
                {teamcenterRunning || configitRunning || windchillRunning ? (
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
                  <p className="mt-3 text-sm leading-7">The extraction form and status will appear here once you choose a PLM or CPQ source.</p>
                </div>
              ) : selection === "teamcenter" ? (
                <div className="space-y-6">
                  <div className="rounded-4xl border border-slate-700/70 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">PLM extraction</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">Run the Teamcenter pipeline</h3>
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
              ) : selection === "windchill" ? (
                <div className="space-y-6">
                  <div className="rounded-4xl border border-slate-700/70 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">PLM extraction</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">Run the Windchill extraction</h3>
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
                      <WindchillForm onSubmit={handleWindchillSubmit} isRunning={windchillRunning} />
                    </div>
                  </div>
                </div>
              ) : selection === "configit" ? (
                <div className="space-y-6">
                  <div className="rounded-4xl border border-slate-700/70 bg-slate-950/80 p-6 shadow-lg shadow-slate-950/10">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">CPQ extraction</p>
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
              ) : null}
            </div>
          </div>

          <div className="rounded-4xl border border-slate-700/80 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/20">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">BOM preview</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">
                  {selection === "teamcenter"
                    ? "TeamCenter BOM Structure"
                    : selection === "windchill"
                    ? "Windchill BOM Structure"
                    : selection === "configit"
                    ? "Configit BOM Structure"
                    : "BOM Preview"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {selection === "configit"
                    ? "View the Configit family/feature BOM hierarchy."
                    : "Explore the bill of materials tree structure with expandable nodes."}
                </p>
              </div>
            </div>

            <div className="grid gap-6" style={{ gridTemplateColumns: selection === "configit" ? "1fr" : "1fr 1fr" }}>
              {selection === "teamcenter" ? (
                <>
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
                    emptyLabel="Load the Configit BOM for comparison."
                    active={true}
                  />
                </>
              ) : selection === "windchill" ? (
                <>
                  <SourceBomPanel
                    title="Windchill source"
                    subtitle="Windchill BOM"
                    endpoint={
                      windchillPartId
                        ? `/api/bom-windchill?partId=${encodeURIComponent(windchillPartId)}`
                        : "/api/bom-windchill"
                    }
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
                  <SourceBomPanel
                    title="Configit source"
                    subtitle="Family & Feature BOM"
                    endpoint="/api/bom-configit"
                    transformPayload={getConfigitRoot}
                    emptyLabel="Load the Configit BOM for comparison."
                    active={true}
                  />
                </>
              ) : selection === "configit" ? (
                <SourceBomPanel
                  title="Configit source"
                  subtitle="Family & Feature BOM"
                  endpoint={
                    configitProductId
                      ? `/api/bom-configit?productId=${encodeURIComponent(configitProductId)}`
                      : "/api/bom-configit"
                  }
                  transformPayload={getConfigitRoot}
                  emptyLabel="Start Configit preview to load the extracted Configit BOM."
                  active={configitActive}
                  refreshSignal={configitRefreshSignal}
                  onLoadComplete={(status) => {
                    if (status === "ready" || status === "error") {
                      setConfigitRunning(false);
                    }
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
