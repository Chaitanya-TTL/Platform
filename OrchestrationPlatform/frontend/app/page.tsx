"use client";

import { useState } from "react";
import { PipelineForm } from "@/components/PipelineForm";
import { ProgressTracker } from "@/components/ProgressTracker";
import { BomViewer } from "@/components/BomViewer";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [progress, setProgress] = useState(0);

  const handlePipelineSubmit = (newJobId: string) => {
    setJobId(newJobId);
    setIsLoading(true);
    setProgress(0);
    setCurrentPhase("Starting pipeline...");
  };

  const handlePipelineComplete = () => {
    setIsLoading(false);
  };

  const loaderStates = [
    { text: "Initializing TeamCenter pipeline request" },
    { text: "Connecting to TeamCenter extraction service" },
    { text: "Generating tc_extraction.json" },
    { text: "Transforming BOM into a navigable hierarchy" },
    { text: "Rendering live BOM stream" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <MultiStepLoader loading={isLoading} loadingStates={loaderStates} duration={1400} />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-12">
          <h1 className="mb-2 text-4xl font-bold text-white">Orchestration Platform</h1>
          <p className="text-slate-300">BOM Flow: TeamCenter → Configit → SAP</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-6">
              <h2 className="mb-2 text-xl font-semibold text-white">Enter TeamCenter ID</h2>
              <p className="mb-4 text-sm text-slate-400">Type the TeamCenter item ID and start the extraction pipeline.</p>
              <PipelineForm onSubmit={handlePipelineSubmit} isLoading={isLoading} />
            </div>
          </div>

          <div className="space-y-6 lg:col-span-2">
            {jobId && (
              <ProgressTracker
                jobId={jobId}
                onPhaseChange={setCurrentPhase}
                onProgressChange={setProgress}
                onComplete={handlePipelineComplete}
              />
            )}

            {jobId && !isLoading && (
              <div className="rounded-lg border border-slate-600 bg-slate-700/50 p-6">
                <h2 className="mb-4 text-xl font-semibold text-white">BOM Structure</h2>
                <BomViewer jobId={jobId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
