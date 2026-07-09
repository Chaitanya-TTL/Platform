// "use client";

// import { useEffect, useState } from "react";
// import { getLogByJobId } from "@/lib/api";

// interface ProgressTrackerProps {
//   jobId: string;
//   onComplete?: () => void;
// }

// export function ProgressTracker({ jobId, onComplete }: ProgressTrackerProps) {
//   const [isComplete, setIsComplete] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [message, setMessage] = useState<string>("Starting pipeline...");

//   useEffect(() => {
//     let interval: NodeJS.Timeout | null = null;
//     let stopped = false;

//     const poll = async () => {
//       try {
//         const log = await getLogByJobId(jobId);
//         if (!log) return;

//         // Update a simple message from latest phase when available
//         if (log.phases && log.phases.length > 0) {
//           const latest = log.phases[log.phases.length - 1];
//           setMessage(latest.message || `${latest.phase}...`);
//         }

//         if (log.status === "success") {
//           setIsComplete(true);
//           stopped = true;
//           onComplete?.();
//         } else if (log.status === "failed") {
//           setError(log.error || "Pipeline failed");
//           setIsComplete(true);
//           stopped = true;
//           onComplete?.();
//         }
//       } catch {
//         // Ignore transient errors and keep the simple loader visible.
//       }
//     };

//     // Start immediate poll and then interval
//     poll();
//     interval = setInterval(() => {
//       if (!stopped) poll();
//     }, 1500);

//     return () => {
//       if (interval) clearInterval(interval);
//     };
//   }, [jobId, onComplete]);

//   return (
//     <div className="bg-slate-700/50 rounded-lg p-6 border border-slate-600">
//       {!isComplete && (
//         <div className="flex items-center gap-4">
//           <div className="w-8 h-8 border-4 border-t-transparent border-blue-400 rounded-full animate-spin" />
//           <div>
//             <h3 className="text-sm font-semibold text-white">Processing</h3>
//             <p className="text-xs text-gray-300">{message}</p>
//           </div>
//         </div>
//       )}

//       {isComplete && !error && (
//         <div className="text-sm text-emerald-300">Pipeline completed successfully. Fetching results...</div>
//       )}

//       {isComplete && error && (
//         <div className="text-sm text-red-300">{error}</div>
//       )}
//     </div>
//   );
// }
