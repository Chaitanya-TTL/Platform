"use client";

import {
  CopilotChat,
  CopilotChatMessageView,
  CopilotKitProvider,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import type {
  CopilotChatAssistantMessageProps,
  CopilotChatMessageViewProps,
} from "@copilotkit/react-core/v2";
import type { CopilotChatAssistantMessage } from "@copilotkit/react-core/v2";
import type { Message } from "@ag-ui/client";
import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
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
}

interface ChatSurfaceContextValue {
  isArchived: boolean;
  onCitationSelect: CopilotKitChatSurfaceProps["onCitationSelect"];
  onRunStateChange: CopilotKitChatSurfaceProps["onRunStateChange"];
  onFailure: CopilotKitChatSurfaceProps["onFailure"];
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
      className="min-h-11 rounded-md border border-cyan-800/60 bg-cyan-950/40 px-3 py-2 text-left text-sm font-medium text-cyan-800 transition-colors hover:border-cyan-600 hover:bg-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200 dark:hover:border-cyan-700 dark:hover:bg-cyan-950"
      aria-label={`Open ${citation.kind}: ${citation.label}`}
      onClick={() => onCitationSelect(citation)}
    >
      {citation.label}
    </button>
  );
}

function CitationReference({ citation }: { citation: CopilotCitation }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      aria-label={`${citation.kind} reference: ${citation.label}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {citation.kind} reference
      </span>
      {citation.label}
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
  const hasDetails =
    answer.claims.length > 0 ||
    citations.length > 0 ||
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
                      {claim.text}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {citations.length ? (
              <section aria-label="Citations">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Citations</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {citations.map((citation) => (
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

function ArchivedComposerNotice(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <p {...props} className="px-3 pb-2 text-sm text-amber-800 dark:text-amber-200">
      {ARCHIVED_MESSAGE}. The conversation is available for reading only.
    </p>
  );
}

function LatticeWelcomeScreen({
  input,
  suggestionView,
}: {
  input: ReactNode;
  suggestionView: ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
          Investigation assistant
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Grounded in this investigation
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-slate-600 dark:text-slate-300">
          Ask about the current evidence, source coverage, or items that need review.
        </p>
      </div>
      {suggestionView}
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
  const shouldSuppressSelectedThreadWelcome =
    Boolean(props.isConnecting) || (props.messages?.length ?? 0) > 0;
  const onSubmitMessage = props.onSubmitMessage;

  useEffect(() => {
    context?.onRunStateChange(isRunning);
    if (isRunning) context?.onFailure(undefined);
  }, [context, isRunning]);

  const handleSubmit = useCallback((value: string) => {
    if (!context?.isArchived && value.length <= MAX_MESSAGE_LENGTH)
      onSubmitMessage?.(value);
  }, [context?.isArchived, onSubmitMessage]);

  return (
    <CopilotChat.View
      {...props}
      messageView={LatticeMessageView as typeof CopilotChatMessageView}
      onSubmitMessage={handleSubmit}
      input={{
        textArea: {
          disabled: context?.isArchived ?? false,
          maxLength: MAX_MESSAGE_LENGTH,
          "aria-label": "Ask about this investigation",
          className: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500",
        },
        ...(context?.isArchived
          ? { disclaimer: ArchivedComposerNotice, showDisclaimer: true }
          : {}),
      }}
      hasExplicitThreadId={Boolean(
        props.hasExplicitThreadId && shouldSuppressSelectedThreadWelcome,
      )}
      welcomeScreen={LatticeWelcomeScreen}
    />
  );
}

function recordFailure(
  event: { error: Error; context: Record<string, unknown> },
  onFailure: CopilotKitChatSurfaceProps["onFailure"],
) {
  const metadata = isRecord(event.context.metadata)
    ? event.context.metadata
    : isRecord(event.context.errorMetadata)
      ? event.context.errorMetadata
      : {};
  const serverRetryable = metadata.retryable === true;
  const requestMayHaveBeenBilled = metadata.requestMayHaveBeenBilled !== false;
  const retryable = serverRetryable && !requestMayHaveBeenBilled;
  const validationIssue =
    typeof metadata.validationIssue === "string" && metadata.validationIssue.length <= 160
      ? metadata.validationIssue
      : undefined;

  onFailure({
    message: SAFE_FAILURE_MESSAGE,
    retryable,
    requestMayHaveBeenBilled,
    ...(validationIssue ? { validationIssue } : {}),
  });
}

function CopilotKitChatContents(props: CopilotKitChatSurfaceProps) {
  const suggestions = useMemo(() => props.isArchived || props.cues.length === 0
    ? null
    : {
        available: "before-first-message" as const,
        suggestions: props.cues.map((cue) => ({
          title: cue.title,
          message: cue.prompt,
        })),
      }, [props.cues, props.isArchived]);

  useConfigureSuggestions(suggestions, [suggestions]);

  const context = useMemo<ChatSurfaceContextValue>(() => ({
    isArchived: props.isArchived,
    onCitationSelect: props.onCitationSelect,
    onRunStateChange: props.onRunStateChange,
    onFailure: props.onFailure,
  }), [
    props.isArchived,
    props.onCitationSelect,
    props.onFailure,
    props.onRunStateChange,
  ]);
  const handleError = useCallback((event: {
      error: Error;
      code: string;
      context: Record<string, unknown>;
    }) => recordFailure(event, props.onFailure), [props.onFailure]);

  return (
    <ChatSurfaceContext.Provider value={context}>
      <div className="lattice-copilot-chat flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
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
      </div>
      <style>{`
        .lattice-copilot-chat [data-copilotkit] {
          --cpk-font-sans: var(--font-dm-sans), "DM Sans", sans-serif;
          --cpk-color-white: var(--surface);
          --cpk-color-gray-50: var(--background);
          --cpk-color-gray-100: var(--surface-subtle);
          --cpk-color-gray-200: var(--border);
          --cpk-color-gray-400: #64748b;
          --cpk-color-gray-500: #475569;
          --cpk-color-gray-600: #334155;
          --cpk-color-gray-700: #1e293b;
          --cpk-color-gray-800: #0f172a;
          --cpk-color-gray-900: #020617;
          color: var(--foreground);
        }
        .dark .lattice-copilot-chat [data-copilotkit] {
          --cpk-color-gray-400: #94a3b8;
          --cpk-color-gray-500: #94a3b8;
          --cpk-color-gray-600: #cbd5e1;
          --cpk-color-gray-700: #e2e8f0;
          --cpk-color-gray-800: #f1f5f9;
          --cpk-color-gray-900: #f8fafc;
        }
        .lattice-copilot-chat [data-copilotkit] :focus-visible {
          outline: 2px solid #06b6d4;
          outline-offset: 2px;
        }
        .lattice-copilot-chat [data-copilotkit] button {
          min-height: 2.75rem;
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
