"use client";

import { useState } from "react";
import { PipelineForm } from "@/components/PipelineForm";
import { ProgressTracker } from "@/components/ProgressTracker";
import { BomViewer } from "@/components/BomViewer";

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">
            Orchestration Platform
          </h1>
          <p className="text-slate-300">
            BOM Flow: TeamCenter → Configit → SAP
          </p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Form */}
          <div className="lg:col-span-1">
            <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
              <h2 className="text-xl font-semibold text-white mb-4">
                Start Pipeline
              </h2>
              <PipelineForm
                onSubmit={handlePipelineSubmit}
                isLoading={isLoading}
              />
            </div>
          </div>

          {/* Right Column - Progress & Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Tracker */}
            {jobId && (
              <ProgressTracker
                jobId={jobId}
                onPhaseChange={setCurrentPhase}
                onProgressChange={setProgress}
                onComplete={handlePipelineComplete}
              />
            )}

            {/* BOM Viewer */}
            {jobId && !isLoading && (
              <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
                <h2 className="text-xl font-semibold text-white mb-4">
                  BOM Structure
                </h2>
                <BomViewer jobId={jobId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
