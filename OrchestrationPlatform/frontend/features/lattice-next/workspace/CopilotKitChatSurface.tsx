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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { CopilotAnswer, CopilotCitation } from "../copilot/contracts";
import type { InvestigationReviewCue } from "../copilot/review-cues";
import { CopilotAnswerContent } from "./CopilotAnswerContent";
import ThoughtLine from "./ThoughtLine";

const MAX_MESSAGE_LENGTH = 2_000;
// The runner module also imports server-only storage, so the client mirrors its ID separator.
const THREAD_SEPARATOR = "--";
const EMPTY_MESSAGE_ID_SET: ReadonlySet<string> = new Set();
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
  requestPending: boolean;
  suppressUnparsedAssistantMessages: boolean;
  previousAssistantMessageIds: ReadonlySet<string>;
  threadToken: string;
  submitMessage?: (value: string) => void;
  typewriterMessageId?: string;
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

export function filterUnparsedAssistantMessages<T extends {
  id?: unknown;
  role: string;
  metadata?: unknown;
}>(
  messages: readonly T[],
  previousAssistantMessageIds: ReadonlySet<string>,
  suppressUnparsedAssistantMessages: boolean,
): T[] {
  if (!suppressUnparsedAssistantMessages) return [...messages];

  return messages.filter((message) => {
    if (message.role !== "assistant" || typeof message.id !== "string") return true;
    return previousAssistantMessageIds.has(message.id) || getValidatedAnswerContext(message) !== undefined;
  });
}

type LatticeAssistantMessageProps = CopilotChatAssistantMessageProps & {
  onWhySelect: CopilotKitChatSurfaceProps["onWhySelect"];
  onCitationSelect: CopilotKitChatSurfaceProps["onCitationSelect"];
  typewriter: boolean;
};

export function LatticeAssistantMessage({
  message,
  onWhySelect,
  onCitationSelect,
  typewriter,
  className,
}: LatticeAssistantMessageProps) {
  const answerContext = getValidatedAnswerContext(message);
  const answer = answerContext?.answer;
  const fallbackText = typeof message.content === "string" ? message.content : "";

  if (!answerContext || !answer) {
    return (
      <article className={`lattice-assistant-message ${className ?? ""}`}>
        <CopilotAnswerContent
          content={fallbackText}
          onCitationSelect={onCitationSelect}
        />
      </article>
    );
  }

  return (
    <article className={`lattice-assistant-message ${className ?? ""}`}>
      <CopilotAnswerContent
        content={answer.answer}
        answerContext={answerContext}
        onCitationSelect={onCitationSelect}
        typewriter={typewriter}
      />
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

function LatticeAssistantMessageSlot(props: CopilotChatAssistantMessageProps) {
  const context = useContext(ChatSurfaceContext);
  return (
    <LatticeAssistantMessage
      {...props}
      onWhySelect={context?.onWhySelect ?? (() => undefined)}
      onCitationSelect={context?.onCitationSelect ?? (() => undefined)}
      typewriter={props.message.id === context?.typewriterMessageId}
    />
  );
}

function NoChatCursor() {
  return <span className="hidden" aria-hidden="true" />;
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
  const isRunning = Boolean(props.isRunning && context?.requestPending);
  const [thoughtDuration, setThoughtDuration] = useState<number>();
  const runStartedAt = useRef<number | undefined>(undefined);
  const renderedThread = useRef(context?.threadToken);
  const visibleMessages = useMemo(
    () => filterUnparsedAssistantMessages(
      props.messages ?? [],
      context?.previousAssistantMessageIds ?? EMPTY_MESSAGE_ID_SET,
      context?.suppressUnparsedAssistantMessages ?? false,
    ),
    [
      context?.previousAssistantMessageIds,
      context?.suppressUnparsedAssistantMessages,
      props.messages,
    ],
  );

  useEffect(() => {
    if (renderedThread.current === context?.threadToken) return;
    renderedThread.current = context?.threadToken;
    runStartedAt.current = undefined;
    setThoughtDuration(undefined);
  }, [context?.threadToken]);

  useEffect(() => {
    if (isRunning) {
      if (runStartedAt.current === undefined) {
        runStartedAt.current = performance.now();
        setThoughtDuration(undefined);
      }
      return;
    }

    if (runStartedAt.current !== undefined) {
      setThoughtDuration((performance.now() - runStartedAt.current) / 1_000);
      runStartedAt.current = undefined;
    }
  }, [isRunning]);

  return (
    <div className="lattice-copilot-message-content flex min-h-0 flex-1 flex-col justify-end">
      <CopilotChatMessageView
        {...props}
        messages={visibleMessages}
        assistantMessage={LatticeAssistantMessageSlot as typeof CopilotChatAssistantMessage}
        cursor={NoChatCursor}
      />
      {isRunning || thoughtDuration !== undefined ? (
        <ThoughtLine
          className="lattice-thought-line"
          label="Thinking…"
          doneLabel="Thought for"
          glyph={<ThinkingOrb state="working" size={20} aria-hidden="true" />}
          steps={[]}
          collapsible={false}
          working={isRunning}
          elapsed={isRunning ? undefined : thoughtDuration}
          color="var(--foreground)"
          glyphColor="#67e8f9"
          fontSize={14}
          showTimer
          shimmer
        />
      ) : null}
    </div>
  );
}

type ChatViewProps = ComponentProps<typeof CopilotChat.View>;

function LatticeChatView(props: ChatViewProps) {
  const context = useContext(ChatSurfaceContext);
  const isRunning = Boolean(props.isRunning);
  const isConnecting = Boolean(props.isConnecting);
  const [requestPending, setRequestPending] = useState(false);
  const [typewriterMessageId, setTypewriterMessageId] = useState<string>();
  const [suppressUnparsedAssistantMessages, setSuppressUnparsedAssistantMessages] = useState(false);
  const [previousAssistantMessageIds, setPreviousAssistantMessageIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const messagesRef = useRef(props.messages ?? []);
  const submittedAssistantIds = useRef(new Set<string>());
  const awaitingAnswerReveal = useRef(false);
  const runStarted = useRef(false);
  const renderedThread = useRef(context?.threadToken);
  useEffect(() => {
    messagesRef.current = props.messages ?? [];
  }, [props.messages]);
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

  useEffect(() => {
    if (renderedThread.current === context?.threadToken) return;
    renderedThread.current = context?.threadToken;
    setTypewriterMessageId(undefined);
    setRequestPending(false);
    setSuppressUnparsedAssistantMessages(false);
    setPreviousAssistantMessageIds(new Set());
    submittedAssistantIds.current.clear();
    awaitingAnswerReveal.current = false;
    runStarted.current = false;
  }, [context?.threadToken]);

  useEffect(() => {
    if (isRunning) runStarted.current = true;
    if (!awaitingAnswerReveal.current || isRunning || !runStarted.current) return;

    const answerMessage = [...(props.messages ?? [])].reverse().find((message) =>
      message.role === "assistant" &&
      typeof message.id === "string" &&
      !submittedAssistantIds.current.has(message.id) &&
      getValidatedAnswerContext(message) !== undefined,
    );

    if (answerMessage && typeof answerMessage.id === "string") {
      setTypewriterMessageId(answerMessage.id);
    }
    setRequestPending(false);
    setSuppressUnparsedAssistantMessages(true);
    awaitingAnswerReveal.current = false;
    submittedAssistantIds.current.clear();
    runStarted.current = false;
  }, [isRunning, props.messages]);

  const handleSubmit = useCallback((value: string) => {
    if (!context?.isArchived && value.length <= MAX_MESSAGE_LENGTH) {
      submittedAssistantIds.current = new Set(
        messagesRef.current
          .filter((message) => message.role === "assistant" && typeof message.id === "string")
          .map((message) => message.id),
      );
      setPreviousAssistantMessageIds(new Set(submittedAssistantIds.current));
      setSuppressUnparsedAssistantMessages(true);
      awaitingAnswerReveal.current = true;
      runStarted.current = false;
      setRequestPending(true);
      setTypewriterMessageId(undefined);
      onSubmitMessage?.(value);
    }
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
    requestPending,
    suppressUnparsedAssistantMessages,
    previousAssistantMessageIds,
    typewriterMessageId,
    submitMessage: handleSubmit,
  } : null, [
    context,
    handleSubmit,
    isConnecting,
    isRunning,
    previousAssistantMessageIds,
    requestPending,
    suppressUnparsedAssistantMessages,
    typewriterMessageId,
  ]);

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
    requestPending: false,
    suppressUnparsedAssistantMessages: false,
    previousAssistantMessageIds: EMPTY_MESSAGE_ID_SET,
    threadToken: `${props.investigationId}${THREAD_SEPARATOR}${props.threadId}`,
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
    props.investigationId,
    props.threadId,
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
          border-radius: 1.15rem;
          box-shadow: 0 2px 6px rgb(15 23 42 / 0.08);
          transition: border-color 180ms ease-out, box-shadow 180ms ease-out;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput:focus-within {
          border-color: #64748b;
          box-shadow: 0 0 0 3px rgb(100 116 139 / 0.16);
        }
        .lattice-copilot-chat [data-testid="copilot-chat-input"] > div[data-layout="compact"] {
          grid-template-columns: 0 minmax(0, 1fr) auto;
          gap: 0.4rem;
          padding: 0.5rem 0.5rem 0.5rem 0.85rem;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput [data-testid="copilot-chat-textarea"] {
          min-height: 3rem;
          color: var(--foreground);
          padding-block: 0.7rem;
          line-height: 1.5;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput [data-testid="copilot-chat-textarea"]:focus-visible {
          outline: none;
          box-shadow: none;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitInput [data-testid="copilot-add-menu-button"] {
          display: none;
        }
        .lattice-copilot-chat [data-copilotkit] [aria-label="Send message"],
        .lattice-copilot-chat [data-copilotkit] [aria-label="Stop generating"] {
          width: 2.75rem;
          min-width: 2.75rem;
          height: 2.75rem;
          border-radius: 0.8rem;
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
          align-items: stretch;
          padding-top: 1.25rem;
        }
        .lattice-copilot-chat [data-testid="copilot-chat"] [data-testid="copilot-scroll-content"] > div:has(> .lattice-copilot-message-content) {
          display: flex;
          flex: 1 0 auto;
          flex-direction: column;
          width: 100%;
          max-width: none;
          margin-inline: 0;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitUserMessage {
          background: transparent;
          display: flex !important;
          width: 100%;
          max-width: 100%;
          align-items: flex-end !important;
          margin: 0.75rem 0 1.5rem;
          padding: 0 !important;
          border: 0;
          box-shadow: none;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitAssistantMessage {
          width: 100%;
          max-width: 100%;
          align-items: flex-start !important;
          margin: 0 0 1.5rem;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitUserMessage > [class*="bg-muted"] {
          align-self: flex-end;
          width: fit-content;
          max-width: min(82%, 40rem);
          background: color-mix(in srgb, var(--foreground) 5%, var(--background));
          border: 1px solid color-mix(in srgb, var(--foreground) 13%, transparent);
          border-radius: 1rem 1rem 0.25rem 1rem;
          color: var(--foreground);
          line-height: 1.65;
          padding: 0.8rem 1rem;
        }
        .lattice-copilot-chat .lattice-assistant-message {
          width: 85%;
          max-width: none;
          align-self: flex-start;
          margin: 0;
          text-align: left;
        }
        .lattice-copilot-chat .copilot-answer-content {
          width: 100%;
          max-width: none;
          text-align: justify;
          text-justify: inter-word;
        }
        .lattice-copilot-chat .lattice-thought-line {
          width: 100%;
          max-width: none;
          align-self: flex-start;
          margin: 0.25rem 0 0.75rem;
          padding-inline: 0.25rem;
        }
        .lattice-copilot-chat [data-copilotkit] .copilotKitMarkdown {
          color: var(--foreground);
          line-height: 1.75;
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
