"use client";

import { useEffect, useState } from "react";
import { subscribeToProgress, PipelineProgress } from "@/lib/api";

interface ProgressTrackerProps {
  jobId: string;
  onPhaseChange?: (phase: string) => void;
  onProgressChange?: (percent: number) => void;
  onComplete?: () => void;
}

const PHASES = [
  { name: "extract", label: "Extract", description: "Extracting data from TeamCenter" },
  { name: "transform", label: "Transform", description: "Transforming BOM to target format" },
  { name: "load", label: "Load", description: "Finalizing and storing results" },
];

export function ProgressTracker({
  jobId,
  onPhaseChange,
  onProgressChange,
  onComplete,
}: ProgressTrackerProps) {
  const [currentProgress, setCurrentProgress] = useState<PipelineProgress | null>(null);
  const [allProgress, setAllProgress] = useState<PipelineProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let unsubscribe: (() => void) | null = null;
    let receivedAnyProgress = false;

    const startPolling = () => {
      // If SSE doesn't send data within 2 seconds, start polling the logs endpoint
      pollInterval = setTimeout(async () => {
        if (!receivedAnyProgress) {
          console.log("No SSE progress received, switching to polling...");
          clearInterval(pollInterval!);
          
          // Poll the logs endpoint every 500ms
          const logPollInterval = setInterval(async () => {
            try {
              const response = await fetch(`http://localhost:5212/api/pipeline/logs/${jobId}`);
              if (!response.ok) {
                // Log not found yet, skip this poll
                return;
              }
              const log = await response.json();
              
              if (log && log.phases) {
                // Construct progress events from the log phases
                log.phases.forEach((phase: any) => {
                  setCurrentProgress({
                    jobId: log.jobId,
                    phase: phase.phase,
                    status: phase.status,
                    progressPercent: phase.progressPercent,
                    message: phase.message,
                    timestamp: new Date().toISOString()
                  });
                  
                  onProgressChange?.(phase.progressPercent);
                  onPhaseChange?.(phase.phase);
                });
                
                // If any phase shows complete or 100%, we're done
                if (log.status === "success" || log.status === "failed") {
                  setIsComplete(true);
                  clearInterval(logPollInterval);
                  onComplete?.();
                }
              }
            } catch (err) {
              console.error("Poll error:", err);
            }
          }, 500);
          
          return () => clearInterval(logPollInterval);
        }
      }, 2000);
    };

    unsubscribe = subscribeToProgress(
      jobId,
      (progress) => {
        receivedAnyProgress = true;
        if (pollInterval) clearTimeout(pollInterval);
        
        setCurrentProgress(progress);
        setAllProgress((prev) => [...prev, progress]);
        onProgressChange?.(progress.progressPercent);
        onPhaseChange?.(progress.phase);

        if (progress.status === "error") {
          setError(progress.message || progress.error);
          setIsComplete(true);
          onComplete?.();
        }
      },
      (errorMsg) => {
        setError(errorMsg);
        setIsComplete(true);
        onComplete?.();
      },
      () => {
        setIsComplete(true);
        onComplete?.();
      }
    );

    startPolling();

    return () => {
      if (pollInterval) clearTimeout(pollInterval);
      if (unsubscribe) unsubscribe();
    };
  }, [jobId, onPhaseChange, onProgressChange, onComplete]);

  const percent = currentProgress?.progressPercent || 0;
  const message = currentProgress?.message || "Initializing...";
  const currentPhase = currentProgress?.phase || "";
  const status = currentProgress?.status || "in_progress";

  const getPhaseStatus = (phaseName: string) => {
    const phaseProgress = allProgress.find((p) => p.phase === phaseName);
    if (!phaseProgress) return "pending";
    if (phaseProgress.status === "complete") return "complete";
    if (phaseProgress.status === "in_progress") return "in_progress";
    if (phaseProgress.status === "error") return "error";
    return "pending";
  };

  return (
    <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600 space-y-6">
      {/* Overall Progress Bar */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-100">Pipeline Progress</h3>
          <span className="text-sm font-bold text-blue-300">{percent}%</span>
        </div>
        <div className="w-full bg-slate-600 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              status === "error"
                ? "bg-red-500"
                : "bg-gradient-to-r from-blue-500 to-cyan-400"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Current Message */}
      {message && (
        <div className="bg-slate-600/50 rounded p-3 border border-slate-500">
          <p className="text-sm text-gray-200">{message}</p>
        </div>
      )}

      {/* Phase Progress */}
      <div>
        <h3 className="text-sm font-semibold text-gray-100 mb-3">Pipeline Stages</h3>
        <div className="space-y-2">
          {PHASES.map((phase) => {
            const phaseStatus = getPhaseStatus(phase.name);
            const isActive = phase.name === currentPhase;

            return (
              <div key={phase.name} className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {phaseStatus === "complete" && (
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                  {phaseStatus === "in_progress" && (
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-blue-200 rounded-full animate-spin" />
                  )}
                  {phaseStatus === "pending" && (
                    <div className="w-6 h-6 bg-slate-600 rounded-full" />
                  )}
                  {phaseStatus === "error" && (
                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">!</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-200">{phase.label}</p>
                  {isActive && (
                    <p className="text-xs text-gray-400">{phase.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded p-3">
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}

      {/* Completion Status */}
      {isComplete && !error && (
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 border border-emerald-500 rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-600 text-lg">✓</span>
            </div>
            <p className="text-sm font-bold text-white">Pipeline completed successfully!</p>
          </div>
          <p className="text-xs text-emerald-100 mt-2">BOM extraction and transformation complete. Scroll down to view the structure.</p>
        </div>
      )}

      {isComplete && error && (
        <div className="bg-gradient-to-r from-red-600 to-red-700 border border-red-500 rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-red-600 text-lg">✕</span>
            </div>
            <p className="text-sm font-bold text-white">Pipeline failed</p>
          </div>
        </div>
      )}

      {/* Activity Log */}
      {allProgress.length > 0 && (
        <details className="text-xs">
          <summary className="text-gray-400 cursor-pointer">Show Activity Log</summary>
          <div className="mt-2 bg-slate-800 rounded p-3 max-h-48 overflow-y-auto font-mono text-gray-400 space-y-1">
            {allProgress.map((p, i) => (
              <div key={i}>
                [{p.phase}] {p.message}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
