"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconMessagePlus, IconX } from "@tabler/icons-react";
import { getCopilotThreads } from "../copilot/client";
import type { CopilotCitation } from "../copilot/contracts";
import type { CopilotThreadSummary } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationReviewCue } from "../copilot/review-cues";
import { CopilotKitChatSurface } from "./CopilotKitChatSurface";
import type { CopilotRunFailure } from "./CopilotKitChatSurface";

export interface InvestigationCopilotPanelProps {
  investigationId: string;
  snapshotRevision: number;
  isArchived?: boolean;
  cues?: readonly InvestigationReviewCue[];
  onClose: () => void;
  onCitationSelect: (citation: CopilotCitation) => void;
}

function createClientThreadId(): string {
  return `new-${globalThis.crypto.randomUUID()}`;
}

function InvestigationCopilotPanelContent({
  investigationId,
  snapshotRevision,
  isArchived = false,
  cues = [],
  onClose,
  onCitationSelect,
}: InvestigationCopilotPanelProps) {
  const [threads, setThreads] = useState<readonly CopilotThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>();
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [dismissedCueIds, setDismissedCueIds] = useState<ReadonlySet<string>>(new Set());
  const requestSequence = useRef(0);
  const runningRef = useRef(false);

  const refreshThreads = useCallback(async () => {
    const requestId = ++requestSequence.current;
    try {
      const response = await getCopilotThreads(investigationId);
      if (requestId !== requestSequence.current) return;
      setThreads(response.threads);
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Conversation history could not be loaded.");
    }
  }, [investigationId]);

  useEffect(() => {
    let active = true;
    const requestId = ++requestSequence.current;
    void getCopilotThreads(investigationId).then((response) => {
      if (!active || requestId !== requestSequence.current) return;
      setThreads(response.threads);
      const latest = response.latestThread?.threadId ?? response.threads[0]?.threadId;
      setActiveThreadId(latest ?? createClientThreadId());
      setError(undefined);
    }).catch((cause: unknown) => {
      if (!active || requestId !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Conversation history could not be loaded.");
    }).finally(() => {
      if (active && requestId === requestSequence.current) setLoadingThreads(false);
    });
    return () => {
      active = false;
      requestSequence.current += 1;
    };
  }, [investigationId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleRunStateChange = useCallback((nextIsRunning: boolean) => {
    const wasRunning = runningRef.current;
    runningRef.current = nextIsRunning;
    setIsRunning(nextIsRunning);
    if (wasRunning && !nextIsRunning) void refreshThreads();
  }, [refreshThreads]);

  const handleFailure = useCallback((failure: CopilotRunFailure | undefined) => {
    setError(failure?.message);
  }, []);

  const retryLoadingThreads = () => {
    setLoadingThreads(true);
    setError(undefined);
    const requestId = ++requestSequence.current;
    void getCopilotThreads(investigationId).then((response) => {
      if (requestId !== requestSequence.current) return;
      setThreads(response.threads);
      const latest = response.latestThread?.threadId ?? response.threads[0]?.threadId;
      setActiveThreadId(latest ?? createClientThreadId());
    }).catch((cause: unknown) => {
      if (requestId !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Conversation history could not be loaded.");
    }).finally(() => {
      if (requestId === requestSequence.current) setLoadingThreads(false);
    });
  };

  const startNewConversation = () => {
    setActiveThreadId(createClientThreadId());
    setError(undefined);
  };

  const handleThreadSelection = (threadId: string) => {
    if (threadId === activeThreadId) return;
    if (!threads.some((thread) => thread.threadId === threadId)) return;
    setActiveThreadId(threadId);
    setError(undefined);
  };

  const activeThreadIsSaved = activeThreadId && threads.some((thread) => thread.threadId === activeThreadId);
  const visibleCues = cues.filter((cue) => !dismissedCueIds.has(cue.id));

  return (
    <aside
      className="fixed inset-y-0 right-0 z-120 flex w-full max-w-[min(100vw,440px)] flex-col border-l border-slate-700 bg-[#08111d] text-slate-100 shadow-2xl"
      aria-label="Investigation copilot"
      role="complementary"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-4">
        <div>
          <h2 className="text-base font-semibold">Investigation copilot</h2>
          <p className="mt-1 text-xs text-slate-400">
            Snapshot revision {snapshotRevision}{isArchived ? " · Archived, read only" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close copilot"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <IconX aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      {isArchived ? (
        <p className="border-b border-slate-800 px-4 py-2 text-xs text-amber-200">
          Restore this investigation before sending messages.
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="copilot-conversation" className="mb-1 block text-xs font-medium text-slate-300">
            Conversation
          </label>
          <select
            id="copilot-conversation"
            aria-label="Conversations"
            value={activeThreadId ?? ""}
            onChange={(event) => handleThreadSelection(event.target.value)}
            disabled={loadingThreads || isRunning || !activeThreadId}
            className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {activeThreadId && !activeThreadIsSaved ? (
              <option value={activeThreadId}>New conversation (not yet saved)</option>
            ) : null}
            {threads.map((thread) => (
              <option key={thread.threadId} value={thread.threadId}>
                {thread.title}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-label="New conversation"
          disabled={loadingThreads || isRunning || isArchived}
          onClick={startNewConversation}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-200 disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <IconMessagePlus aria-hidden="true" className="h-4 w-4" />
          New conversation
        </button>
      </div>

      {visibleCues.length ? (
        <section className="shrink-0 border-b border-slate-800 px-4 py-3" aria-label="Review cues">
          <p className="mb-2 text-xs font-semibold text-amber-200">Evidence review</p>
          <ul className="grid gap-2">
            {visibleCues.map((cue) => (
              <li key={cue.id} className="flex items-start justify-between gap-2 rounded-md border border-amber-500/20 bg-amber-500/4 px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-slate-100">{cue.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{cue.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedCueIds((current) => new Set([...current, cue.id]))}
                  aria-label={`Dismiss ${cue.title}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <IconX aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">Suggestions are not executed.</p>
        </section>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {loadingThreads ? (
          <p role="status" className="px-4 py-4 text-sm text-slate-400">Loading conversations…</p>
        ) : null}
        {!loadingThreads && !activeThreadId ? (
          <div className="px-4 py-4">
            <p role="alert" className="text-sm text-rose-200">
              {error ?? "Conversation history could not be loaded."}
            </p>
            <button
              type="button"
              onClick={retryLoadingThreads}
              className="mt-3 min-h-10 rounded-md border border-slate-700 px-3 text-sm text-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Retry loading conversations
            </button>
          </div>
        ) : null}
        {!loadingThreads && activeThreadId ? (
          <CopilotKitChatSurface
            key={activeThreadId}
            investigationId={investigationId}
            snapshotRevision={snapshotRevision}
            threadId={activeThreadId}
            isArchived={isArchived}
            cues={visibleCues}
            onCitationSelect={onCitationSelect}
            onRunStateChange={handleRunStateChange}
            onFailure={handleFailure}
          />
        ) : null}
      </div>

      {error && activeThreadId ? (
        <p role="alert" className="mx-4 mb-2 rounded-md border border-rose-500/30 bg-rose-500/6 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
    </aside>
  );
}

export function InvestigationCopilotPanel(props: InvestigationCopilotPanelProps) {
  return <InvestigationCopilotPanelContent key={props.investigationId} {...props} />;
}
