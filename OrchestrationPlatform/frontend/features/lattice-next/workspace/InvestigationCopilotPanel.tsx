"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconMessagePlus, IconX } from "@tabler/icons-react";
import { getCopilotThreads } from "../copilot/client";
import type { CopilotCitation } from "../copilot/contracts";
import type { CopilotThreadSummary } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationReviewCue } from "../copilot/review-cues";
import { CopilotKitChatSurface } from "./CopilotKitChatSurface";
import type { CopilotRunFailure } from "./CopilotKitChatSurface";
import { ThinkingOrb } from "thinking-orbs";

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
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
    closeButtonRef.current?.focus();

    const trapFocusAndClose = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", trapFocusAndClose);
    return () => {
      window.removeEventListener("keydown", trapFocusAndClose);
      previousFocus?.focus();
    };
  }, [onClose]);

  const handleRunStateChange = useCallback((nextIsRunning: boolean) => {
    const wasRunning = runningRef.current;
    runningRef.current = nextIsRunning;
    setIsRunning(nextIsRunning);
    if (wasRunning && !nextIsRunning) void refreshThreads();
  }, [refreshThreads]);

  const handleFailure = useCallback((failure: CopilotRunFailure | undefined) => {
    if (!failure) {
      setError(undefined);
      return;
    }
    const billingNotice = failure.requestMayHaveBeenBilled
      ? " The request may have been billed; check the usage ledger before retrying."
      : "";
    const validationIssue = failure.validationIssue;
    const validationNotice =
      typeof validationIssue === "string" &&
      validationIssue.length > 0 &&
      validationIssue.length <= 160 &&
      !/[\u0000-\u001f\u007f]/.test(validationIssue)
        ? ` Detail: ${validationIssue}`
        : "";
    setError(`${failure.message}${validationNotice}${billingNotice}`);
  }, []);

  const handleDismissCue = useCallback((cueId: string) => {
    setDismissedCueIds((current) => new Set([...current, cueId]));
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
  const visibleCues = useMemo(
    () => cues.filter((cue) => !dismissedCueIds.has(cue.id)),
    [cues, dismissedCueIds],
  );

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Close investigation copilot"
        className="absolute inset-0 cursor-default bg-slate-950/55"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-700 bg-[#08111d] text-slate-100 shadow-2xl sm:max-w-[min(100vw,520px)]"
        aria-label="Investigation copilot"
        aria-labelledby="investigation-copilot-title"
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
      >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 id="investigation-copilot-title" className="text-lg font-semibold tracking-tight">
            Investigation copilot
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Revision <span className="tabular-nums">{snapshotRevision}</span>
            {isArchived ? " · Archived, read only" : ""}
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close copilot"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          <IconX aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      {isArchived ? (
        <p className="border-b border-slate-800 px-4 py-2 text-xs text-amber-200">
          Restore this investigation before sending messages.
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-slate-800 px-5 py-3">
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
            aria-describedby="copilot-conversation-help"
            className="min-h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
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
          <p id="copilot-conversation-help" className="sr-only">
            Saved conversations are private to this investigation.
          </p>
        </div>
        <button
          type="button"
          aria-label="New conversation"
          disabled={loadingThreads || isRunning || isArchived}
          onClick={startNewConversation}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          <IconMessagePlus aria-hidden="true" className="h-4 w-4" />
          New conversation
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 sm:px-3">
        {loadingThreads ? (
          <div role="status" className="flex items-center gap-3 px-4 py-5 text-sm text-slate-200">
            <ThinkingOrb state="connecting" size={20} aria-hidden="true" />
            <span>Restoring saved conversations…</span>
          </div>
        ) : null}
        {!loadingThreads && !activeThreadId ? (
          <div className="px-4 py-4">
            <p role="alert" className="text-sm leading-6 text-rose-200">
              {error ?? "Conversation history could not be loaded."}
            </p>
            <button
              type="button"
              onClick={retryLoadingThreads}
              className="mt-3 min-h-11 rounded-md border border-slate-700 px-3 text-sm text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
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
            onDismissCue={handleDismissCue}
          />
        ) : null}
      </div>

      {error && activeThreadId ? (
        <p role="alert" className="mx-5 mb-2 rounded-md border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm leading-5 text-rose-100">
          {error}
        </p>
      ) : null}
      </aside>
    </div>
  );
}

export function InvestigationCopilotPanel(props: InvestigationCopilotPanelProps) {
  return <InvestigationCopilotPanelContent key={props.investigationId} {...props} />;
}
