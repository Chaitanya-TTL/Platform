"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronLeft, IconHistory, IconMessagePlus, IconX } from "@tabler/icons-react";
import { getCopilotThreads } from "../copilot/client";
import type { CopilotCitation } from "../copilot/contracts";
import { parseNavigableCitationId } from "../copilot/citation-id";
import type { InvestigationGraph } from "../domain/model";
import { projectCitedGraph } from "../engines/project-cited-graph";
import type { InvestigationGraphCore } from "../engines/investigation-graph";
import type { CopilotThreadSummary } from "../kernel/ports/copilot-conversation-store";
import type { InvestigationReviewCue } from "../copilot/review-cues";
import { CopilotKitChatSurface } from "./CopilotKitChatSurface";
import type {
  CopilotAnswerContext,
  CopilotCitationSelection,
  CopilotRunFailure,
} from "./CopilotKitChatSurface";
import { ThinkingOrb } from "thinking-orbs";
import { CopilotCitedGraph } from "./CopilotCitedGraph";

type SidecarView = "explanation" | "graph";
type PhoneMode = "conversation" | "history" | "context";

export interface InvestigationCopilotPanelProps {
  investigationId: string;
  snapshotRevision: number;
  domain: InvestigationGraph;
  core: InvestigationGraphCore;
  isArchived?: boolean;
  cues?: readonly InvestigationReviewCue[];
  onClose: () => void;
}

function createClientThreadId(): string {
  return `new-${globalThis.crypto.randomUUID()}`;
}

function InvestigationCopilotPanelContent({
  investigationId,
  snapshotRevision,
  domain,
  core,
  isArchived = false,
  cues = [],
  onClose,
}: InvestigationCopilotPanelProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [threads, setThreads] = useState<readonly CopilotThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>();
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [dismissedCueIds, setDismissedCueIds] = useState<ReadonlySet<string>>(new Set());
  const [latestAnswerContext, setLatestAnswerContext] = useState<CopilotAnswerContext>();
  const [selectedAnswerContext, setSelectedAnswerContext] = useState<CopilotAnswerContext>();
  const [selectedCitedGraph, setSelectedCitedGraph] = useState<ReturnType<typeof projectCitedGraph>>();
  const [selectedCitation, setSelectedCitation] = useState<CopilotCitation>();
  const [contextExpanded, setContextExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [sidecarView, setSidecarView] = useState<SidecarView>("explanation");
  const [phoneMode, setPhoneMode] = useState<PhoneMode>("conversation");
  const requestSequence = useRef(0);
  const runningRef = useRef(false);
  const latestAnswerContextRef = useRef<CopilotAnswerContext | undefined>(undefined);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const conversationPaneRef = useRef<HTMLDivElement>(null);
  const sidecarHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusSidecarOnOpenRef = useRef(false);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const focusConversationOnBackRef = useRef(false);

  useEffect(() => {
    // Wait for hydration so the modal can escape the workspace stacking context.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPortalContainer(document.body);
  }, []);

  const clearAnswerContexts = useCallback(() => {
    latestAnswerContextRef.current = undefined;
    setLatestAnswerContext(undefined);
    setSelectedAnswerContext(undefined);
    setSelectedCitedGraph(undefined);
    setSelectedCitation(undefined);
    setContextExpanded(false);
    setSidecarView("explanation");
    setPhoneMode("conversation");
  }, []);

  const handleAnswerContextAvailable = useCallback((answerContext: CopilotAnswerContext) => {
    const previous = latestAnswerContextRef.current;
    if (previous?.messageId === answerContext.messageId) return;

    latestAnswerContextRef.current = answerContext;
    setLatestAnswerContext(answerContext);
    setSelectedAnswerContext(answerContext);
    setSelectedCitedGraph(undefined);
    setSelectedCitation(undefined);
    setSidecarView("explanation");
  }, []);

  const rememberFocusReturn = useCallback(() => {
    const activeElement = document.activeElement;
    focusReturnRef.current = activeElement instanceof HTMLElement ? activeElement : null;
  }, []);

  const handleWhySelect = useCallback((answerContext: CopilotAnswerContext) => {
    rememberFocusReturn();
    setSelectedAnswerContext(answerContext);
    setSelectedCitedGraph(projectCitedGraph(domain, core, answerContext.answer.citations ?? []));
    setSelectedCitation(undefined);
    setSidecarView("explanation");
    setContextExpanded(true);
    setPhoneMode("context");
    focusSidecarOnOpenRef.current = true;
  }, [core, domain, rememberFocusReturn]);

  const handleCitationSelect = useCallback((selection: CopilotCitationSelection) => {
    if (!contextExpanded) rememberFocusReturn();
    const answerContext = {
      messageId: selection.messageId,
      answer: selection.answer,
    };
    const citedGraph = projectCitedGraph(domain, core, selection.answer.citations ?? []);

    setSelectedAnswerContext(answerContext);
    setSelectedCitedGraph(citedGraph);
    setSelectedCitation(selection.citation);
    setSidecarView("explanation");
    setContextExpanded(true);
    setPhoneMode("context");
    focusSidecarOnOpenRef.current = !contextExpanded;
  }, [contextExpanded, core, domain, rememberFocusReturn]);

  const handleExploreRelationships = useCallback(() => {
    setSidecarView("graph");
  }, []);

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

    const trapFocusAndClose = (event: WindowEventMap["keydown"]) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const candidates = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const focusable = candidates
        ? Array.from(candidates).filter((element) => {
            let ancestor: HTMLElement | null = element;
            while (ancestor && ancestor !== panelRef.current) {
              if (ancestor.hidden || ancestor.inert || ancestor.getAttribute("aria-hidden") === "true")
                return false;
              const style = window.getComputedStyle?.(ancestor);
              if (style?.display === "none" || style?.visibility === "hidden") return false;
              ancestor = ancestor.parentElement;
            }
            return true;
          })
        : [];
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
  }, [onClose, portalContainer]);

  useEffect(() => {
    if (focusSidecarOnOpenRef.current && contextExpanded) {
      focusSidecarOnOpenRef.current = false;
      sidecarHeadingRef.current?.focus();
    }
    if (focusConversationOnBackRef.current && phoneMode === "conversation") {
      focusConversationOnBackRef.current = false;
      conversationPaneRef.current?.focus();
    }
  }, [contextExpanded, phoneMode]);

  const handleBackToAnswer = () => {
    focusConversationOnBackRef.current = true;
    setPhoneMode("conversation");
  };

  const closeSidecar = () => {
    setContextExpanded(false);
    setPhoneMode("conversation");
    setSidecarView("explanation");
    const focusTarget = focusReturnRef.current;
    focusReturnRef.current = null;
    if (focusTarget?.isConnected) focusTarget.focus();
    else conversationPaneRef.current?.focus();
  };

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
    clearAnswerContexts();
    setActiveThreadId(createClientThreadId());
    setError(undefined);
    setPhoneMode("conversation");
  };

  const handleThreadSelection = (threadId: string) => {
    if (threadId === activeThreadId) {
      setPhoneMode("conversation");
      return;
    }
    if (!threads.some((thread) => thread.threadId === threadId)) return;
    clearAnswerContexts();
    setActiveThreadId(threadId);
    setError(undefined);
    setPhoneMode("conversation");
  };

  const activeThreadIsSaved = activeThreadId && threads.some((thread) => thread.threadId === activeThreadId);
  const visibleCues = useMemo(
    () => isArchived ? [] : cues.filter((cue) => !dismissedCueIds.has(cue.id)),
    [cues, dismissedCueIds, isArchived],
  );
  const activeAnswer = selectedAnswerContext?.answer;
  const citations = [
    ...new Map((activeAnswer?.citations ?? []).map((citation) => [citation.citationId, citation])).values(),
  ];
  const focusedGraphTarget = selectedCitation ? parseNavigableCitationId(selectedCitation) : undefined;
  const canExploreRelationships = citations.some((citation) => parseNavigableCitationId(citation));

  const renderEvidenceCitation = (citation: CopilotCitation) => (
    <li key={citation.citationId} className="min-w-0 py-2">
      <button
        type="button"
        className={`min-h-11 max-w-full rounded-sm text-left text-sm font-medium text-cyan-200 underline decoration-cyan-300/60 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
          selectedCitation?.citationId === citation.citationId ? "rounded-sm bg-slate-800 px-2" : ""
        }`}
        aria-label={`Open ${citation.kind} reference: ${citation.label}`}
        onClick={() => {
          if (selectedAnswerContext)
            handleCitationSelect({ ...selectedAnswerContext, citation });
        }}
      >
        {citation.label}
      </button>
      <p className="text-xs text-slate-400">{citation.kind} reference</p>
      {citation.source || citation.nativeId || citation.summary ? (
        <dl className="mt-1 grid min-w-0 gap-x-3 gap-y-1 text-xs text-slate-300 sm:grid-cols-[auto_minmax(0,1fr)]">
          {citation.source ? (
            <>
              <dt className="text-slate-400">Source</dt>
              <dd className="break-words">{citation.source}</dd>
            </>
          ) : null}
          {citation.nativeId ? (
            <>
              <dt className="text-slate-400">Reference ID</dt>
              <dd className="break-words">{citation.nativeId}</dd>
            </>
          ) : null}
          {citation.summary ? (
            <>
              <dt className="text-slate-400">Details</dt>
              <dd className="break-words">{citation.summary}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </li>
  );

  const panel = (
    <div className="fixed inset-0 z-[400]">
      <button
        type="button"
        aria-label="Close investigation copilot"
        className="absolute inset-0 cursor-default bg-slate-950/55"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-700 bg-[#08111d] text-slate-100 shadow-2xl ${
          contextExpanded ? "md:w-[min(96vw,1180px)]" : "md:w-[min(96vw,1040px)]"
        }`}
        aria-label="Investigation copilot"
        aria-labelledby="investigation-copilot-title"
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
        data-context-open={contextExpanded}
        data-context-destination={sidecarView}
        data-context-answer-message-id={selectedAnswerContext?.messageId}
        data-phone-mode={phoneMode}
        data-latest-answer-message-id={latestAnswerContext?.messageId}
        data-selected-cited-graph-node-ids={selectedCitedGraph?.projection.nodes.map((node) => node.id).join(",")}
        data-selected-citation-id={selectedCitation?.citationId}
      >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 id="investigation-copilot-title" className="text-base font-semibold tracking-tight">
            Investigation copilot
          </h2>
          <p className="mt-0.5 text-sm text-slate-300">
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

      <div className={`relative grid min-h-0 flex-1 overflow-hidden ${
        contextExpanded ? "md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]" : "grid-cols-1"
      }`}>
      <div className={`grid min-h-0 min-w-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
        historyOpen ? "md:grid-cols-[220px_minmax(0,1fr)]" : "md:grid-cols-[0_minmax(0,1fr)]"
      }`}>
        <aside
          id="copilot-conversation-history"
          aria-label="Conversations in this investigation"
          aria-hidden={!historyOpen}
          inert={!historyOpen}
          className={`hidden min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-800 transition-opacity duration-200 ease-out motion-reduce:transition-none md:flex ${
            historyOpen ? "md:opacity-100" : "md:opacity-0"
          }`}
        >
          <div className="flex min-h-0 w-[220px] flex-1 flex-col overflow-y-auto p-3">
            <h3 className="px-2 pb-3 pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
              This investigation
            </h3>
            {loadingThreads ? (
              <p role="status" className="px-2 py-3 text-sm text-slate-300">
                Restoring saved conversations…
              </p>
            ) : null}
            {!loadingThreads && !threads.length && !activeThreadId ? (
              <p className="px-2 py-3 text-sm leading-6 text-slate-400">No conversations yet.</p>
            ) : null}
            {activeThreadId && !activeThreadIsSaved ? (
              <button
                type="button"
                aria-current="page"
                onClick={() => setPhoneMode("conversation")}
                className="mb-1 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-left text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                New conversation
                <span className="mt-0.5 block text-xs font-normal text-slate-400">Not saved yet</span>
              </button>
            ) : null}
            <ul className="space-y-1">
              {threads.map((thread) => {
                const isActive = thread.threadId === activeThreadId;
                return (
                  <li key={thread.threadId}>
                    <button
                      type="button"
                      aria-current={isActive ? "page" : undefined}
                      disabled={isRunning}
                      onClick={() => handleThreadSelection(thread.threadId)}
                      className={`min-h-12 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
                        isActive
                          ? "bg-slate-800 font-medium text-white"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                      }`}
                    >
                      <span className="block truncate">{thread.title}</span>
                      <span className="mt-0.5 block text-xs font-normal text-slate-400">
                        {thread.messageCount} {thread.messageCount === 1 ? "message" : "messages"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
        <div
          ref={conversationPaneRef}
          role="region"
          aria-label="Conversation and answer"
          tabIndex={-1}
          className={`flex min-h-0 min-w-0 flex-col overflow-hidden px-2 pb-2 sm:px-3 ${
            phoneMode === "context" || phoneMode === "history" ? "hidden md:flex" : ""
          }`}
        >
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-2 sm:px-1">
          <button
            type="button"
            aria-label="Toggle conversation history"
            aria-controls="copilot-conversation-history"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            className="hidden min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-slate-300 transition-colors duration-150 ease-out hover:bg-slate-800 hover:text-white md:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <IconHistory aria-hidden="true" className="h-4 w-4" />
            <span>Conversations</span>
          </button>
          <button
            type="button"
            aria-label="Open investigation conversations"
            onClick={() => setPhoneMode("history")}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-300 transition-colors duration-150 ease-out hover:bg-slate-800 hover:text-white md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <IconHistory aria-hidden="true" className="h-5 w-5" />
          </button>
          <div role="group" aria-label="Conversation controls" className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="New conversation"
              title="New conversation"
              disabled={loadingThreads || isRunning || isArchived}
              onClick={startNewConversation}
              className="group inline-flex h-11 w-11 shrink-0 items-center justify-start gap-2 overflow-hidden rounded-lg border border-slate-700 px-3 text-sm text-slate-200 [transition:width_260ms_cubic-bezier(0.2,0,0,1),background-color_150ms_ease-out] hover:w-[142px] hover:bg-slate-800 focus-visible:w-[142px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
            >
              <IconMessagePlus aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 ease-out group-hover:max-w-24 group-hover:opacity-100 group-focus-visible:max-w-24 group-focus-visible:opacity-100 motion-reduce:transition-none">
                New chat
              </span>
            </button>
          </div>
        </div>
        {loadingThreads ? (
          <div role="status" className="flex items-center gap-3 px-4 py-5 text-sm text-slate-200 md:hidden">
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
            onAnswerContextAvailable={handleAnswerContextAvailable}
            onWhySelect={handleWhySelect}
            onCitationSelect={handleCitationSelect}
            onSubmitMessageAvailable={() => undefined}
            onRunStateChange={handleRunStateChange}
            onFailure={handleFailure}
            onDismissCue={handleDismissCue}
          />
        ) : null}
        </div>
      </div>

        {contextExpanded ? (
          <section
            id="copilot-context-panel"
            aria-label="Answer explanation"
            className={`min-h-0 min-w-0 flex-col overflow-hidden border-l border-slate-800 ${
              phoneMode === "context" ? "flex" : "hidden md:flex"
            }`}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
              <div>
                <h3
                  ref={sidecarHeadingRef}
                  id="copilot-explanation-title"
                  tabIndex={-1}
                  className="text-sm font-semibold text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                >
                  Why this answer?
                </h3>
                <p className="text-xs text-slate-400">Supporting explanation and cited source path</p>
              </div>
              <button
                type="button"
                onClick={handleBackToAnswer}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 md:hidden"
              >
                Back to conversation
              </button>
              <button
                type="button"
                onClick={closeSidecar}
                className="hidden min-h-11 items-center rounded-md px-2 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 md:inline-flex"
              >
                Close explanation
              </button>
            </header>
            <div
              id="copilot-explanation-content"
              role="region"
              aria-labelledby="copilot-explanation-title"
              tabIndex={0}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-300"
            >
              {sidecarView === "explanation" ? (
                activeAnswer ? (
                  <div className="space-y-5 break-words">
                    {activeAnswer.claims.length ? (
                      <section aria-label="Supporting explanation">
                        <h3 className="text-sm font-semibold text-slate-100">Supporting explanation</h3>
                        <ul className="mt-2 divide-y divide-slate-800">
                          {activeAnswer.claims.map((claim, index) => (
                            <li key={`claim-${index}`} className="py-3">
                              <p className="text-xs font-medium text-slate-400">{claim.kind}</p>
                              <p className="text-sm leading-6 text-slate-200">{claim.text}</p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {activeAnswer.recommendations.length ? (
                      <section aria-label="Decision context">
                        <h3 className="text-sm font-semibold text-slate-100">Decision context</h3>
                        <ul className="mt-2 divide-y divide-slate-800">
                          {activeAnswer.recommendations.map((recommendation, index) => (
                            <li key={`recommendation-${index}`} className="py-3">
                              <p className="text-sm leading-6 text-slate-300">{recommendation.rationale}</p>
                              {recommendation.approvalRequired ? (
                                <p className="mt-2 text-xs font-medium text-amber-200">Approval required</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {citations.length ? (
                      <section aria-label="Cited sources">
                        <h3 className="text-sm font-semibold text-slate-100">Cited sources</h3>
                        <ul className="mt-1 divide-y divide-slate-800">
                          {citations.map(renderEvidenceCitation)}
                        </ul>
                      </section>
                    ) : null}
                    {!activeAnswer.claims.length && !activeAnswer.recommendations.length && !citations.length &&
                    !activeAnswer.uncertainties.length ? (
                      <p role="status" className="text-sm text-slate-300">No cited support is attached to this answer.</p>
                    ) : null}
                    {activeAnswer.uncertainties.length ? (
                      <section aria-label="What remains uncertain">
                        <h3 className="text-sm font-semibold text-slate-100">What remains uncertain</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-300">
                          {activeAnswer.uncertainties.map((uncertainty, index) => (
                            <li key={`uncertainty-${index}`}>{uncertainty}</li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {canExploreRelationships ? (
                      <button
                        type="button"
                        onClick={handleExploreRelationships}
                        className="min-h-11 rounded-md border border-slate-700 px-3 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                      >
                        Explore relationships
                      </button>
                    ) : null}
                  </div>

                ) : (
                  <p role="status" className="text-sm leading-6 text-slate-300">
                    No validated answer is available yet.
                  </p>
                )
              ) : null}
              {sidecarView === "graph" ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSidecarView("explanation")}
                    className="min-h-11 rounded-sm px-1 text-sm text-cyan-200 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                  >
                    Back to explanation
                  </button>
                  {selectedAnswerContext && selectedCitedGraph ? (
                    <CopilotCitedGraph
                      answerMessageId={selectedAnswerContext.messageId}
                      citedGraph={selectedCitedGraph}
                      focusTarget={focusedGraphTarget}
                      emptyMessage="This answer has no graph citations."
                      unavailableMessage="Some graph citations could not be resolved in this investigation."
                    />
                  ) : (
                    <p role="status" className="text-sm leading-6 text-slate-300">
                      A focused graph is unavailable until an answer cites Lattice entities or relationships.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      {phoneMode === "history" ? (
        <section
          aria-label="Investigation conversations"
          className="absolute inset-0 z-30 flex flex-col bg-[#08111d] md:hidden"
        >
          <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-800 px-4">
            <button
              type="button"
              aria-label="Back to conversation"
              onClick={() => setPhoneMode("conversation")}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <IconChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <h3 className="text-sm font-semibold text-slate-100">Conversations</h3>
            <button
              type="button"
              aria-label="New conversation"
              disabled={loadingThreads || isRunning || isArchived}
              onClick={startNewConversation}
              className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <IconMessagePlus aria-hidden="true" className="h-4 w-4" />
              New chat
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loadingThreads ? (
              <div role="status" className="flex items-center gap-3 py-4 text-sm text-slate-200">
                <ThinkingOrb state="connecting" size={20} aria-hidden="true" />
                <span>Restoring saved conversations…</span>
              </div>
            ) : null}
            {activeThreadId && !activeThreadIsSaved ? (
              <button
                type="button"
                aria-current="page"
                onClick={() => setPhoneMode("conversation")}
                className="mb-2 min-h-12 w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-left text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                New conversation
                <span className="mt-0.5 block text-xs font-normal text-slate-400">Not saved yet</span>
              </button>
            ) : null}
            <ul className="space-y-2">
              {threads.map((thread) => {
                const isActive = thread.threadId === activeThreadId;
                return (
                  <li key={thread.threadId}>
                    <button
                      type="button"
                      aria-current={isActive ? "page" : undefined}
                      disabled={isRunning}
                      onClick={() => handleThreadSelection(thread.threadId)}
                      className={`min-h-12 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ease-out disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
                        isActive ? "bg-slate-800 font-medium text-white" : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <span className="block truncate">{thread.title}</span>
                      <span className="mt-0.5 block text-xs font-normal text-slate-400">
                        {thread.messageCount} {thread.messageCount === 1 ? "message" : "messages"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!loadingThreads && !threads.length && !activeThreadId ? (
              <p className="py-4 text-sm leading-6 text-slate-400">No conversations yet.</p>
            ) : null}
            {!loadingThreads && !activeThreadId ? (
              <div className="pt-3">
                <p role="alert" className="text-sm leading-6 text-rose-200">
                  {error ?? "Conversation history could not be loaded."}
                </p>
                <button
                  type="button"
                  onClick={retryLoadingThreads}
                  className="mt-3 min-h-11 rounded-md border border-slate-700 px-3 text-sm text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                >
                  Retry loading conversations
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {error && activeThreadId ? (
        <p role="alert" className="mx-5 mb-2 rounded-md border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm leading-5 text-rose-100">
          {error}
        </p>
      ) : null}
      </aside>
    </div>
  );

  if (portalContainer) return createPortal(panel, portalContainer);
  return typeof document !== "undefined" && !document.body ? panel : null;
}

export function InvestigationCopilotPanel(props: InvestigationCopilotPanelProps) {
  return <InvestigationCopilotPanelContent key={props.investigationId} {...props} />;
}
