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

export interface CopilotKitChatSurfaceProps {
  investigationId: string;
  snapshotRevision: number;
  threadId: string;
  isArchived: boolean;
  cues: readonly InvestigationReviewCue[];
  onCitationSelect(citation: CopilotCitation): void;
  onRunStateChange(isRunning: boolean): void;
  onFailure(failure: CopilotRunFailure | undefined): void;
  onDismissCue(cueId: string): void;
}

interface ChatSurfaceContextValue {
  isArchived: boolean;
  isRunning: boolean;
  isConnecting: boolean;
  onCitationSelect: CopilotKitChatSurfaceProps["onCitationSelect"];
  onRunStateChange: CopilotKitChatSurfaceProps["onRunStateChange"];
  onFailure: CopilotKitChatSurfaceProps["onFailure"];
  cues: CopilotKitChatSurfaceProps["cues"];
  onDismissCue: CopilotKitChatSurfaceProps["onDismissCue"];
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

function uniqueCitations(citations: readonly CopilotCitation[] | undefined): CopilotCitation[] {
  const seen = new Set<string>();
  return (citations ?? []).filter((citation) => {
    if (seen.has(citation.citationId)) return false;
    seen.add(citation.citationId);
    return true;
  });
}

function isNavigableCitation(citation: CopilotCitation): boolean {
  if (citation.kind !== "entity" && citation.kind !== "relationship") return false;

  const prefix = `cite:${citation.kind}:`;
  if (!citation.citationId.startsWith(prefix)) return false;
  const encodedId = citation.citationId.slice(prefix.length);
  if (!encodedId) return false;

  try {
    const decodedId = decodeURIComponent(encodedId);
    return decodedId.length > 0 && encodeURIComponent(decodedId) === encodedId;
  } catch {
    return false;
  }
}

type CitationButtonProps = {
  citation: CopilotCitation;
  onCitationSelect: CopilotKitChatSurfaceProps["onCitationSelect"];
};

function CitationButton({ citation, onCitationSelect }: CitationButtonProps) {
  return (
    <button
      type="button"
      className="min-h-11 rounded-sm px-1 text-left text-sm font-medium text-cyan-800 underline decoration-cyan-700/60 decoration-1 underline-offset-4 transition-colors hover:text-cyan-600 hover:decoration-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:text-cyan-200 dark:decoration-cyan-300/60 dark:hover:text-cyan-100 dark:hover:decoration-cyan-200"
      aria-label={`Open ${citation.kind}: ${citation.label}`}
      onClick={() => onCitationSelect(citation)}
    >
      {citation.label}
    </button>
  );
}

function CitationReference({ citation }: { citation: CopilotCitation }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm text-slate-700 dark:text-slate-300">
      <span className="text-slate-500 dark:text-slate-400">{citation.kind} reference</span>
      <span>{citation.label}</span>
    </span>
  );
}

function CitationView({
  citation,
  onCitationSelect,
}: CitationButtonProps) {
  return isNavigableCitation(citation)
    ? <CitationButton citation={citation} onCitationSelect={onCitationSelect} />
    : <CitationReference citation={citation} />;
}

type LatticeAssistantMessageProps = CopilotChatAssistantMessageProps & {
  onCitationSelect: CopilotKitChatSurfaceProps["onCitationSelect"];
};

function LatticeAssistantMessage({
  message,
  onCitationSelect,
  className,
}: LatticeAssistantMessageProps) {
  const metadata = isRecord(message.metadata) ? message.metadata : undefined;
  const answer = isCopilotAnswer(metadata?.latticeAnswer) ? metadata.latticeAnswer : undefined;
  const fallbackText = typeof message.content === "string" ? message.content : "";

  if (!answer) {
    return (
      <article className={`lattice-assistant-message ${className ?? ""}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 dark:text-slate-100">
          {fallbackText}
        </p>
      </article>
    );
  }

  const citations = uniqueCitations(answer.citations);
  const citationById = new Map(citations.map((citation) => [citation.citationId, citation]));
  const citedIds = new Set([
    ...answer.claims.flatMap((claim) => claim.citationIds),
    ...answer.recommendations.flatMap((recommendation) => recommendation.citationIds),
  ]);
  const uncitedReferences = citations.filter((citation) => !citedIds.has(citation.citationId));
  const hasDetails =
    answer.claims.length > 0 ||
    uncitedReferences.length > 0 ||
    answer.recommendations.length > 0 ||
    answer.uncertainties.length > 0 ||
    answer.followUpQuestions.length > 0;

  return (
    <article className={`lattice-assistant-message ${className ?? ""}`}>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800 dark:text-slate-100">
        {answer.answer}
      </p>
      {hasDetails ? (
        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 text-sm dark:border-slate-700 dark:bg-slate-900/70">
          <summary className="min-h-11 cursor-pointer px-3 py-2 font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:text-slate-200">
            Evidence and details
          </summary>
          <div className="space-y-4 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
            {answer.claims.length ? (
              <section aria-label="Claims">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Claims</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                  {answer.claims.map((claim, index) => (
                    <li key={`${claim.kind}-${index}`}>
                      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {claim.kind}
                      </span>
                      <span>{claim.text}</span>
                      {claim.citationIds.some((id) => citationById.has(id)) ? (
                        <span className="mt-1 flex flex-wrap items-center gap-x-2">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Supported by</span>
                          {claim.citationIds.flatMap((id) => {
                            const citation = citationById.get(id);
                            return citation
                              ? [<CitationView key={id} citation={citation} onCitationSelect={onCitationSelect} />]
                              : [];
                          })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {uncitedReferences.length ? (
              <section aria-label="Citations">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Additional sources</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {uncitedReferences.map((citation) => (
                    <li key={citation.citationId}>
                      <CitationView citation={citation} onCitationSelect={onCitationSelect} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {answer.recommendations.length ? (
              <section aria-label="Recommendations">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Recommendations</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-700 dark:text-slate-300">
                  {answer.recommendations.map((recommendation, index) => (
                    <li key={`recommendation-${index}`}>
                      <p>{recommendation.text}</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-400">{recommendation.rationale}</p>
                      {recommendation.citationIds.some((id) => citationById.has(id)) ? (
                        <span className="mt-1 flex flex-wrap items-center gap-x-2">
                          <span className="text-xs text-slate-600 dark:text-slate-400">Based on</span>
                          {recommendation.citationIds.flatMap((id) => {
                            const citation = citationById.get(id);
                            return citation
                              ? [<CitationView key={id} citation={citation} onCitationSelect={onCitationSelect} />]
                              : [];
                          })}
                        </span>
                      ) : null}
                      <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                        Approval required
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {answer.uncertainties.length ? (
              <section aria-label="Uncertainties">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Uncertainties</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                  {answer.uncertainties.map((uncertainty, index) => (
                    <li key={`uncertainty-${index}`}>{uncertainty}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {answer.followUpQuestions.length ? (
              <section aria-label="Follow-up questions">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Follow-up questions</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                  {answer.followUpQuestions.map((question, index) => (
                    <li key={`follow-up-${index}`}>{question}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p className="border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
              Based on investigation revision {answer.snapshotRevision}
            </p>
          </div>
        </details>
      ) : null}
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

function LatticeReviewSuggestions() {
  const context = useContext(ChatSurfaceContext);
  if (!context?.cues.length || context.isArchived) return null;

  return (
    <details className="shrink-0 rounded-md border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-500 dark:text-slate-100">
        <span>Review suggestions</span>
        <span className="tabular-nums text-slate-600 dark:text-slate-300">
          {context.cues.length}
        </span>
      </summary>
      <ul className="grid max-h-48 gap-1 overflow-y-auto px-3 pb-2">
        {context.cues.map((cue) => (
          <li
            key={cue.id}
            className="flex flex-wrap items-center justify-between gap-2 border-l border-cyan-700 py-2 pl-3 dark:border-cyan-400"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{cue.title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-700 dark:text-slate-300">{cue.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={
                  context.isArchived ||
                  context.isRunning ||
                  context.isConnecting ||
                  !context.submitMessage
                }
                onClick={() => context.submitMessage?.(cue.prompt)}
                className="min-h-11 rounded-sm px-2 text-sm font-medium text-cyan-800 underline decoration-cyan-700/60 underline-offset-4 transition-colors hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-cyan-200 dark:hover:text-cyan-100"
              >
                Ask about this
              </button>
              <button
                type="button"
                aria-label={`Dismiss ${cue.title}`}
                onClick={() => context.onDismissCue(cue.id)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function LatticeWelcomeScreen({
  input,
}: {
  input: ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Grounded in this investigation
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600 dark:text-slate-300">
          Ask about the selected evidence, source coverage, or a relationship. Answers cite the saved snapshot.
        </p>
      </div>
      <LatticeReviewSuggestions />
      {input}
    </section>
  );
}

function LatticeMessageView(props: CopilotChatMessageViewProps) {
  const context = useContext(ChatSurfaceContext);
  const assistantMessage = useMemo(() => {
    const onCitationSelect = context?.onCitationSelect ?? (() => undefined);
    return function AssistantMessageSlot(slotProps: CopilotChatAssistantMessageProps) {
      return <LatticeAssistantMessage {...slotProps} onCitationSelect={onCitationSelect} />;
    };
  }, [context?.onCitationSelect]);

  return (
    <CopilotChatMessageView
      {...props}
      assistantMessage={assistantMessage as typeof CopilotChatAssistantMessage}
      cursor={ActiveRunCursor}
    />
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
  const hasMessages = (props.messages?.length ?? 0) > 0;
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
        {hasMessages ? (
          <div className="mx-3 mb-2 shrink-0">
            <LatticeReviewSuggestions />
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
    onCitationSelect: props.onCitationSelect,
    onRunStateChange: props.onRunStateChange,
    onFailure: props.onFailure,
    cues: props.cues,
    onDismissCue: props.onDismissCue,
    clearFailure: () => setFailure(undefined),
  }), [
    props.isArchived,
    props.onCitationSelect,
    props.onFailure,
    props.cues,
    props.onDismissCue,
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
