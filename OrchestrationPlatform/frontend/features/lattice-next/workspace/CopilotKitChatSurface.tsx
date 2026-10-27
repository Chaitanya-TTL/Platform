"use client";

import {
  CopilotChat,
  CopilotChatMessageView,
  CopilotKitProvider,
  useAgent,
  useConfigureSuggestions,
  useCopilotKit,
} from "@copilotkit/react-core/v2";
import type {
  CopilotChatAssistantMessageProps,
  CopilotChatMessageViewProps,
} from "@copilotkit/react-core/v2";
import type { CopilotChatAssistantMessage } from "@copilotkit/react-core/v2";
import type { Message } from "@ag-ui/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { CopilotAnswer, CopilotCitation } from "../copilot/contracts";
import type { InvestigationReviewCue } from "../copilot/review-cues";

const MAX_MESSAGE_LENGTH = 2_000;
// The runner module also imports server-only storage, so the client mirrors its ID separator.
const THREAD_SEPARATOR = "--";
const ARCHIVED_MESSAGE = "This investigation is archived";
const SAFE_FAILURE_MESSAGE =
  "The assistant could not complete a validated response. Check the conversation state before trying again.";

export interface CopilotRunFailure {
  message: string;
  retryable: boolean;
  requestMayHaveBeenBilled: boolean;
  validationIssue?: string;
}

export interface CopilotAnswerContext {
  messageId: string;
  answer: CopilotAnswer;
}

export interface CopilotCitationSelection extends CopilotAnswerContext {
  citation: CopilotCitation;
}

export type SafeSubmitMessage = (value: string) => void;

export interface CopilotKitChatSurfaceProps {
  investigationId: string;
  snapshotRevision: number;
  threadId: string;
  isArchived: boolean;
  cues: readonly InvestigationReviewCue[];
  onAnswerContextAvailable(context: CopilotAnswerContext): void;
  onWhySelect(answerContext: CopilotAnswerContext): void;
  onCitationSelect(selection: CopilotCitationSelection): void;
  onSubmitMessageAvailable(submitMessage: SafeSubmitMessage | undefined): void;
  onRunStateChange(isRunning: boolean): void;
  onFailure(failure: CopilotRunFailure | undefined): void;
  onDismissCue(cueId: string): void;
}

interface ChatSurfaceContextValue {
  isArchived: boolean;
  isRunning: boolean;
  isConnecting: boolean;
  onAnswerContextAvailable: CopilotKitChatSurfaceProps["onAnswerContextAvailable"];
  onWhySelect: CopilotKitChatSurfaceProps["onWhySelect"];
  onCitationSelect: CopilotKitChatSurfaceProps["onCitationSelect"];
  cues: readonly InvestigationReviewCue[];
  onDismissCue: CopilotKitChatSurfaceProps["onDismissCue"];
  onSubmitMessageAvailable: CopilotKitChatSurfaceProps["onSubmitMessageAvailable"];
  onRunStateChange: CopilotKitChatSurfaceProps["onRunStateChange"];
  onFailure: CopilotKitChatSurfaceProps["onFailure"];
  submitMessage?: (value: string) => void;
  clearFailure(): void;
}

const ChatSurfaceContext = createContext<ChatSurfaceContextValue | null>(null);

const latestUserMessageFilter = (messages: Message[]): Message[] => {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return latestUserMessage ? [latestUserMessage] : [];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const citationKinds = new Set<CopilotCitation["kind"]>([
  "entity",
  "relationship",
  "evidence",
  "finding",
  "source",
  "evaluation",
]);

function isCitation(value: unknown): value is CopilotCitation {
  if (!isRecord(value) || typeof value.citationId !== "string" || typeof value.label !== "string")
    return false;
  if (typeof value.kind !== "string" || !citationKinds.has(value.kind as CopilotCitation["kind"]))
    return false;
  return ["source", "nativeId", "summary"].every((key) => value[key] === undefined || typeof value[key] === "string");
}

function isCopilotAnswer(value: unknown): value is CopilotAnswer {
  if (!isRecord(value) ||
      typeof value.answer !== "string" ||
      !Array.isArray(value.claims) ||
      !Array.isArray(value.recommendations) ||
      !isStringArray(value.uncertainties) ||
      !isStringArray(value.followUpQuestions) ||
      !Number.isSafeInteger(value.snapshotRevision) ||
      Number(value.snapshotRevision) < 1 ||
      (value.citations !== undefined &&
        (!Array.isArray(value.citations) || !value.citations.every(isCitation)))) {
    return false;
  }

  const validClaims = value.claims.every((claim) =>
    isRecord(claim) &&
    typeof claim.text === "string" &&
    (claim.kind === "fact" || claim.kind === "hypothesis") &&
    isStringArray(claim.citationIds));
  const validRecommendations = value.recommendations.every((recommendation) =>
    isRecord(recommendation) &&
    typeof recommendation.text === "string" &&
    typeof recommendation.rationale === "string" &&
    isStringArray(recommendation.citationIds) &&
    recommendation.approvalRequired === true);

  return validClaims && validRecommendations;
}

export function getValidatedAnswerContext(message: {
  id?: unknown;
  metadata?: unknown;
}): CopilotAnswerContext | undefined {
  if (typeof message.id !== "string" || message.id.length === 0) return undefined;
  const metadata = isRecord(message.metadata) ? message.metadata : undefined;
  const answer = isCopilotAnswer(metadata?.latticeAnswer) ? metadata.latticeAnswer : undefined;
  return answer ? { messageId: message.id, answer } : undefined;
}

export function reportLatestValidatedAnswerContext(
  messages: readonly Message[],
  onAnswerContextAvailable: CopilotKitChatSurfaceProps["onAnswerContextAvailable"],
): void {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    const answerContext = getValidatedAnswerContext(message);
    if (!answerContext) continue;
    onAnswerContextAvailable(answerContext);
    return;
  }
}

type LatticeAssistantMessageProps = CopilotChatAssistantMessageProps & {
  onWhySelect: CopilotKitChatSurfaceProps["onWhySelect"];
};

function LatticeAssistantMessage({
  message,
  onWhySelect,
  className,
}: LatticeAssistantMessageProps) {
  const answerContext = getValidatedAnswerContext(message);
  const answer = answerContext?.answer;
  const fallbackText = typeof message.content === "string" ? message.content : "";

  if (!answerContext || !answer) {
    return (
      <article className={`lattice-assistant-message ${className ?? ""}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 dark:text-slate-100">
          {fallbackText}
        </p>
      </article>
    );
  }

  return (
    <article className={`lattice-assistant-message ${className ?? ""}`}>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 dark:text-slate-100">
        {answer.answer}
      </p>
      <button
        type="button"
        className="mt-1 inline-flex min-h-11 items-center rounded-sm px-1 text-sm font-medium text-cyan-800 underline decoration-cyan-700/60 underline-offset-4 transition-colors hover:text-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:text-cyan-200 dark:decoration-cyan-300/60 dark:hover:text-cyan-100"
        aria-label="Why this answer?"
        onClick={() => onWhySelect(answerContext)}
      >
        Why?
      </button>
    </article>
  );
}

function ActiveRunCursor() {
  return (
    <div
      className="flex min-h-11 items-center gap-2 px-2 text-sm font-medium text-slate-700 dark:text-slate-300"
      role="status"
      aria-live="polite"
    >
      <ThinkingOrb state="working" size={20} aria-hidden="true" />
      <span>Thinking…</span>
    </div>
  );
}

function LatticeWelcomeScreen({
  input,
}: {
  input: ReactNode;
}) {
  return (
    <section className="lattice-copilot-welcome mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Grounded in this investigation
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600 dark:text-slate-300">
          Ask about the selected evidence, source coverage, or a relationship. Answers cite the saved snapshot.
        </p>
      </div>
      <div className="lattice-copilot-welcome-input w-full min-w-0">
        {input}
      </div>
    </section>
  );
}

function LatticeMessageView(props: CopilotChatMessageViewProps) {
  const context = useContext(ChatSurfaceContext);
  const assistantMessage = useMemo(() => {
    const onWhySelect = context?.onWhySelect ?? (() => undefined);
    return function AssistantMessageSlot(slotProps: CopilotChatAssistantMessageProps) {
      return (
        <LatticeAssistantMessage
          {...slotProps}
          onWhySelect={onWhySelect}
        />
      );
    };
  }, [context?.onWhySelect]);

  return (
    <div className="lattice-copilot-message-content flex min-h-0 flex-1 flex-col justify-end">
      <CopilotChatMessageView
        {...props}
        assistantMessage={assistantMessage as typeof CopilotChatAssistantMessage}
        cursor={ActiveRunCursor}
      />
    </div>
  );
}

type ChatViewProps = ComponentProps<typeof CopilotChat.View>;

function LatticeChatView(props: ChatViewProps) {
  const context = useContext(ChatSurfaceContext);
  const isRunning = Boolean(props.isRunning);
  const isConnecting = Boolean(props.isConnecting);
  const shouldSuppressSelectedThreadWelcome =
    Boolean(props.isConnecting) || (props.messages?.length ?? 0) > 0;
  const onSubmitMessage = props.onSubmitMessage;

  const onAnswerContextAvailable = context?.onAnswerContextAvailable;
  useEffect(() => {
    if (onAnswerContextAvailable) {
      reportLatestValidatedAnswerContext(props.messages ?? [], onAnswerContextAvailable);
    }
  }, [onAnswerContextAvailable, props.messages]);

  useEffect(() => {
    context?.onRunStateChange(isRunning);
    if (isRunning) {
      context?.clearFailure();
      context?.onFailure(undefined);
    }
  }, [context, isRunning]);

  const handleSubmit = useCallback((value: string) => {
    if (!context?.isArchived && value.length <= MAX_MESSAGE_LENGTH)
      onSubmitMessage?.(value);
  }, [context?.isArchived, onSubmitMessage]);
  const onSubmitMessageAvailable = context?.onSubmitMessageAvailable;
  useEffect(() => {
    onSubmitMessageAvailable?.(
      isRunning || isConnecting ? undefined : handleSubmit,
    );
    return () => onSubmitMessageAvailable?.(undefined);
  }, [handleSubmit, isConnecting, isRunning, onSubmitMessageAvailable]);
  const chatContext = useMemo(() => context ? {
    ...context,
    isRunning,
    isConnecting,
    submitMessage: handleSubmit,
  } : null, [context, handleSubmit, isConnecting, isRunning]);

  return (
    <ChatSurfaceContext.Provider value={chatContext}>
      <div className="flex h-full min-h-0 flex-col">
        {isConnecting ? (
          <div
            className="flex min-h-11 shrink-0 items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-200"
            role="status"
            aria-live="polite"
          >
            <ThinkingOrb state="connecting" size={20} aria-hidden="true" />
            <span>Restoring this conversation…</span>
          </div>
        ) : null}
        <CopilotChat.View
          {...props}
          className="min-h-0 flex-1"
          messageView={LatticeMessageView as typeof CopilotChatMessageView}
          onSubmitMessage={handleSubmit}
          input={{
            textArea: {
              disabled: (context?.isArchived ?? false) || isConnecting,
              maxLength: MAX_MESSAGE_LENGTH,
              "aria-label": "Ask about this investigation",
            },
            showDisclaimer: false,
          }}
          hasExplicitThreadId={Boolean(
            props.hasExplicitThreadId && shouldSuppressSelectedThreadWelcome,
          )}
          welcomeScreen={LatticeWelcomeScreen}
        />
        {(props.messages?.length ?? 0) > 0 &&
        !isConnecting &&
        !context?.isArchived &&
        context?.cues.length ? (
          <section
            aria-label="Review follow-up suggestions"
            className="shrink-0 border-t border-slate-200/70 px-3 py-1 dark:border-slate-700/70"
          >
            <ul className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
              {context.cues.map((cue) => (
                <li key={cue.id} className="flex min-h-11 items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    Follow-up · {cue.title}
                  </span>
                  <button
                    type="button"
                    disabled={isRunning || !context.submitMessage}
                    onClick={() => context.submitMessage?.(cue.prompt)}
                    className="min-h-11 shrink-0 rounded-sm px-2 text-xs font-medium text-cyan-800 underline underline-offset-4 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:text-cyan-200"
                  >
                    Ask
                  </button>
                  <button
                    type="button"
                    aria-label={`Dismiss ${cue.title}`}
                    onClick={() => context.onDismissCue(cue.id)}
                    className="min-h-11 shrink-0 rounded-sm px-2 text-xs text-slate-500 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:text-slate-400 dark:hover:text-white"
                  >
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </ChatSurfaceContext.Provider>
  );
}

function recordFailure(
  event: { error: Error; context: Record<string, unknown> },
): CopilotRunFailure {
  const runError = isRecord(event.context.event) ? event.context.event : {};
  const metadata = [
    runError.metadata,
    event.context.metadata,
    event.context.errorMetadata,
  ].find(isRecord) ?? {};
  const serverRetryable = metadata.retryable === true;
  const requestMayHaveBeenBilled = metadata.requestMayHaveBeenBilled !== false;
  const retryable = serverRetryable && !requestMayHaveBeenBilled;
  const validationIssue =
    typeof metadata.validationIssue === "string" &&
    metadata.validationIssue.length > 0 &&
    metadata.validationIssue.length <= 160
      ? metadata.validationIssue
      : undefined;

  return {
    message: SAFE_FAILURE_MESSAGE,
    retryable,
    requestMayHaveBeenBilled,
    ...(validationIssue ? { validationIssue } : {}),
  };
}

type RetryAgent = ReturnType<typeof useAgent>["agent"];
type CopilotKitClient = ReturnType<typeof useCopilotKit>["copilotkit"];

interface CopilotKitRetryControlProps {
  failure: CopilotRunFailure;
  agent: RetryAgent;
  copilotkit: CopilotKitClient;
  isAgentReady: boolean;
}

export function CopilotKitRetryControl({
  failure,
  agent,
  copilotkit,
  isAgentReady,
}: CopilotKitRetryControlProps) {
  if (failure.retryable !== true || failure.requestMayHaveBeenBilled !== false) return null;

  const hasPreviousUserMessage = [...agent.messages].reverse().some((message) => message.role === "user");
  if (!hasPreviousUserMessage) return null;

  return (
    <div className="flex justify-end px-3 py-2">
      <button
        type="button"
        className="min-h-11 rounded-md border border-cyan-800/60 px-3 py-2 text-sm font-medium text-cyan-800 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-800 dark:text-cyan-200 dark:hover:bg-cyan-950/50"
        disabled={!isAgentReady || agent.isRunning}
        onClick={() => {
          if (!isAgentReady || agent.isRunning) return;
          void copilotkit.runAgent({ agent });
        }}
      >
        Try again
      </button>
    </div>
  );
}

function CopilotKitChatContents(props: CopilotKitChatSurfaceProps) {
  const { agent, isReady: isAgentReady } = useAgent();
  const { copilotkit } = useCopilotKit();
  const { onFailure } = props;
  const [failure, setFailure] = useState<CopilotRunFailure>();
  useConfigureSuggestions(null, []);

  const context = useMemo<ChatSurfaceContextValue>(() => ({
    isArchived: props.isArchived,
    isRunning: false,
    isConnecting: false,
    onAnswerContextAvailable: props.onAnswerContextAvailable,
    onWhySelect: props.onWhySelect,
    onCitationSelect: props.onCitationSelect,
    cues: props.cues,
    onDismissCue: props.onDismissCue,
    onSubmitMessageAvailable: props.onSubmitMessageAvailable,
    onRunStateChange: props.onRunStateChange,
    onFailure: props.onFailure,
    clearFailure: () => setFailure(undefined),
  }), [
    props.isArchived,
    props.onAnswerContextAvailable,
    props.onWhySelect,
    props.onCitationSelect,
    props.cues,
    props.onDismissCue,
    props.onSubmitMessageAvailable,
    props.onFailure,
    props.onRunStateChange,
  ]);
  const handleError = useCallback((event: {
      error: Error;
      code: string;
      context: Record<string, unknown>;
    }) => {
    const nextFailure = recordFailure(event);
    setFailure(nextFailure);
    onFailure(nextFailure);
  }, [onFailure]);

  return (
    <ChatSurfaceContext.Provider value={context}>
      <div className="lattice-copilot-chat flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900 dark:bg-[#080d18] dark:text-slate-100">
        <CopilotChat
          className="h-full min-h-0 w-full"
          threadId={`${props.investigationId}${THREAD_SEPARATOR}${props.threadId}`}
          chatView={LatticeChatView}
          labels={{
            chatInputPlaceholder: props.isArchived
              ? ARCHIVED_MESSAGE
              : "Ask a question about this investigation",
          }}
          inspectorTools={false}
          onError={handleError as ComponentProps<typeof CopilotChat>["onError"]}
        />
        {failure ? (
          <CopilotKitRetryControl
            failure={failure}
            agent={agent}
            copilotkit={copilotkit}
            isAgentReady={isAgentReady}
          />
        ) : null}
      </div>
      <style>{`
        .lattice-copilot-chat [data-copilotkit] {
          --font-sans: var(--font-dm-sans), "DM Sans", sans-serif;
          --background: #ffffff;
          --foreground: #0f172a;
          --card: #ffffff;
          --card-foreground: #0f172a;
          --popover: #ffffff;
          --popover-foreground: #0f172a;
          --primary: #0e7490;
          --primary-foreground: #ffffff;
          --secondary: #f1f5f9;
          --secondary-foreground: #1e293b;
          --muted: #f1f5f9;
          --muted-foreground: #475569;
          --accent: #ecfeff;
          --accent-foreground: #164e63;
          --border: #dbe3ec;
          --input: #cbd5e1;
          --ring: #0891b2;
          --destructive: #b91c1c;
          --destructive-foreground: #ffffff;
          --radius: 0.5rem;
          color: #0f172a;
        }
        .dark .lattice-copilot-chat [data-copilotkit] {
          --background: #080d18;
          --foreground: #e5e7eb;
          --card: #0f172a;
          --card-foreground: #f8fafc;
          --popover: #0f172a;
          --popover-foreground: #f8fafc;
          --primary: #22d3ee;
          --primary-foreground: #042f35;
          --secondary: #0f172a;
          --secondary-foreground: #e2e8f0;
          --muted: #0f172a;
          --muted-foreground: #cbd5e1;
          --accent: #123044;
          --accent-foreground: #e6fbff;
          --border: #26384a;
          --input: #334155;
          --ring: #22d3ee;
          --destructive: #ef4444;
          --destructive-foreground: #ffffff;
          color: #e5e7eb;
        }
        .lattice-copilot-chat [data-copilotkit] :focus-visible {
          outline: 2px solid #06b6d4;
          outline-offset: 2px;
        }
        .lattice-copilot-chat [data-copilotkit] button {
          min-height: 2.75rem;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput {
          background: var(--background);
          border: 1px solid var(--input);
          border-radius: 0.75rem;
          box-shadow: none;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput:focus-within {
          border-color: #64748b;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput [data-testid="copilot-chat-textarea"] {
          min-height: 2.75rem;
          color: var(--foreground);
          padding-block: 0.65rem;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput [data-testid="copilot-chat-textarea"]:focus-visible {
          outline: none;
          box-shadow: none;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput [data-testid="copilot-add-menu-button"] {
          display: none;
        }
        .lattice-copilot-chat [data-copilotkit] .lattice-copilot-welcome {
          justify-content: safe center;
          overflow-y: auto;
        }
        .lattice-copilot-chat [data-copilotkit] .lattice-copilot-welcome-input [class*="max-w-3xl"] {
          width: 100%;
          min-width: 0;
        }
        .lattice-copilot-chat [data-testid="copilot-chat"] > div > div:has([data-testid="copilot-scroll-content"]) {
          display: flex;
          flex: 1 1 auto;
          flex-direction: column;
          min-height: 0;
        }
        .lattice-copilot-chat [data-testid="copilot-chat"] div:has(> [data-testid="copilot-scroll-content"]) {
          display: flex;
          flex: 1 0 auto;
          flex-direction: column;
        }
        .lattice-copilot-chat [data-testid="copilot-chat"] [data-testid="copilot-scroll-content"] {
          display: flex;
          flex: 1 0 auto;
          flex-direction: column;
        }
        .lattice-copilot-chat [data-testid="copilot-chat"] [data-testid="copilot-scroll-content"] > div:has(> .lattice-copilot-message-content) {
          display: flex;
          flex: 1 0 auto;
          flex-direction: column;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitUserMessage {
          background: transparent;
          padding: 0;
          border: 0;
          box-shadow: none;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitUserMessage > [class*="bg-muted"] {
          background: var(--muted);
          border: 1px solid var(--border);
          border-left: 2px solid var(--primary);
          border-radius: 0.375rem;
          color: var(--foreground);
          line-height: 1.55;
          padding: 0.75rem 1rem;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitMarkdown {
          color: var(--foreground);
          line-height: 1.65;
        }
        @media (prefers-reduced-motion: reduce) {
          .lattice-copilot-chat [data-copilotkit] *,
          .lattice-copilot-chat [data-copilotkit] *::before,
          .lattice-copilot-chat [data-copilotkit] *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </ChatSurfaceContext.Provider>
  );
}

export function CopilotKitChatSurface(props: CopilotKitChatSurfaceProps) {
  const { investigationId, snapshotRevision, ...chatProps } = props;

  return (
    <CopilotKitProvider
      runtimeUrl="/api/lattice/copilotkit"
      properties={{ snapshotRevision }}
      messageFilter={latestUserMessageFilter}
      enableInspector={false}
      showIntelligenceIndicator={false}
    >
      <CopilotKitChatContents
        {...chatProps}
        investigationId={investigationId}
        snapshotRevision={snapshotRevision}
      />
    </CopilotKitProvider>
  );
}
