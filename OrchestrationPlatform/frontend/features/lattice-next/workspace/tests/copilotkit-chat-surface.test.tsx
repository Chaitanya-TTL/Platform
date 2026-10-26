import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CopilotCitation, CopilotAnswer } from "../../copilot/contracts";
import type { InvestigationReviewCue } from "../../copilot/review-cues";

const mocks = vi.hoisted(() => ({
  providerProps: undefined as Record<string, unknown> | undefined,
  chatProps: undefined as Record<string, unknown> | undefined,
  suggestions: undefined as Record<string, unknown> | null | undefined,
  messages: [] as Array<Record<string, unknown>>,
  isRunning: false,
  isConnecting: false,
  inputProps: undefined as Record<string, unknown> | undefined,
  cursorProps: undefined as Record<string, unknown> | undefined,
  assistantMessage: undefined as React.ComponentType<{ message: Record<string, unknown> }> | undefined,
  agent: undefined as { messages: Array<{ id: string; role: string }>; isRunning?: boolean } | undefined,
  copilotkit: undefined as { runAgent: ReturnType<typeof vi.fn> } | undefined,
}));

vi.mock("@copilotkit/react-core/v2", () => {
  const MockCopilotKitProvider = ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    mocks.providerProps = props;
    return <div>{children}</div>;
  };

  const MockMessageView = ({
    assistantMessage: AssistantMessage,
    cursor: Cursor,
    messages,
    isRunning,
  }: {
    assistantMessage?: React.ComponentType<{ message: Record<string, unknown> }>;
    cursor?: React.ComponentType<Record<string, unknown>>;
    messages?: Array<Record<string, unknown>>;
    isRunning?: boolean;
  }) => {
    mocks.assistantMessage = AssistantMessage;
    return (
      <div>
        {messages?.map((message, index) => {
          if (message.role === "assistant" && AssistantMessage)
            return <AssistantMessage key={index} message={message} />;
          if (message.role === "user" && typeof message.content === "string")
            return <p key={index}>{message.content}</p>;
          return null;
        })}
        {isRunning && Cursor ? <Cursor /> : null}
      </div>
    );
  };

  const MockChatView = ({
    input,
    messageView,
    messages,
    isRunning,
    isConnecting,
    hasExplicitThreadId,
    welcomeScreen,
    ...props
  }: Record<string, unknown>) => {
    const inputProps = input && typeof input === "object" ? input as Record<string, unknown> : {};
    mocks.inputProps = inputProps;
    const textAreaProps = inputProps.textArea as Record<string, unknown> | undefined;
    const Disclaimer = inputProps.disclaimer as React.ComponentType<Record<string, unknown>> | undefined;
    const MessageView = messageView as React.ComponentType<Record<string, unknown>> | undefined;
    const shouldShowWelcome = Array.isArray(messages) &&
      messages.length === 0 &&
      welcomeScreen !== false &&
      !isConnecting &&
      !hasExplicitThreadId;
    const WelcomeScreen = typeof welcomeScreen === "function"
      ? welcomeScreen as React.ComponentType<{ input: React.ReactNode; suggestionView: React.ReactNode }>
      : undefined;
    const inputElement = (
      <textarea
        aria-label="Ask about this investigation"
        disabled={Boolean(textAreaProps?.disabled)}
        maxLength={Number(textAreaProps?.maxLength)}
      />
    );
    const welcomeInput = (
      <>
        {inputElement}
        {inputProps.showDisclaimer && Disclaimer ? <Disclaimer /> : null}
      </>
    );
    return (
      <div>
        {shouldShowWelcome && WelcomeScreen ? (
          <WelcomeScreen input={welcomeInput} suggestionView={null} />
        ) : (
          <>
            {MessageView ? (
              <MessageView
                {...props}
                messages={messages}
                isRunning={isRunning}
              />
            ) : null}
            {inputElement}
            {inputProps.showDisclaimer && Disclaimer ? <Disclaimer /> : null}
          </>
        )}
      </div>
    );
  };

  const MockCopilotChat = (props: Record<string, unknown>) => {
    mocks.chatProps = props;
    const ChatView = props.chatView as React.ComponentType<Record<string, unknown>> | undefined;
    return ChatView ? (
      <ChatView
        messages={mocks.messages}
        isRunning={mocks.isRunning}
        isConnecting={mocks.isConnecting}
        hasExplicitThreadId={Boolean(props.threadId)}
      />
    ) : null;
  };
  Object.assign(MockCopilotChat, { View: MockChatView });

  return {
    CopilotKitProvider: MockCopilotKitProvider,
    CopilotChat: MockCopilotChat,
    CopilotChatMessageView: MockMessageView,
    useAgent: () => ({ agent: mocks.agent, isReady: true }),
    useCopilotKit: () => ({ copilotkit: mocks.copilotkit }),
    useConfigureSuggestions: (config: Record<string, unknown> | null) => {
      mocks.suggestions = config;
    },
  };
});

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: (props: Record<string, unknown>) => {
    mocks.cursorProps = props;
    return <span data-testid="thinking-orb" />;
  },
}));

import { CopilotKitChatSurface, CopilotKitRetryControl } from "../CopilotKitChatSurface";

const citation: CopilotCitation = {
  citationId: "evidence-42",
  kind: "evidence",
  label: "Gearbox inspection record",
  source: "Teamcenter",
  summary: "Inspection completed with no critical findings.",
};

const entityCitation: CopilotCitation = {
  citationId: "cite:entity:entity%3A1",
  kind: "entity",
  label: "Housing",
};

const answer: CopilotAnswer = {
  answer: "The assembly is ready for review.",
  claims: [{ text: "The inspection passed.", kind: "fact", citationIds: [citation.citationId] }],
  recommendations: [{
    text: "Review the release package.",
    rationale: "The package is the remaining approval step.",
    citationIds: [citation.citationId],
    approvalRequired: true,
  }],
  uncertainties: ["The latest supplier certificate is not available."],
  followUpQuestions: ["Would you like a release-readiness checklist?"],
  snapshotRevision: 42,
  citations: [entityCitation, citation, citation],
};

const cue: InvestigationReviewCue = {
  id: "coverage:Windchill",
  title: "Source coverage is incomplete",
  detail: "Evidence is partial for Windchill.",
  prompt: "Explain the incomplete Windchill coverage.",
  citationEntityIds: [],
};

const defaultProps = {
  investigationId: "investigation-1",
  snapshotRevision: 42,
  threadId: "thread-7",
  isArchived: false,
  cues: [cue],
  onCitationSelect: vi.fn(),
  onRunStateChange: vi.fn(),
  onFailure: vi.fn(),
};

function renderSurface(props: Partial<typeof defaultProps> = {}) {
  return renderToStaticMarkup(<CopilotKitChatSurface {...defaultProps} {...props} />);
}

describe("CopilotKit investigation chat surface", () => {
  beforeEach(() => {
    mocks.providerProps = undefined;
    mocks.chatProps = undefined;
    mocks.suggestions = undefined;
    mocks.messages = [];
    mocks.isRunning = false;
    mocks.isConnecting = false;
    mocks.inputProps = undefined;
    mocks.cursorProps = undefined;
    mocks.assistantMessage = undefined;
    mocks.agent = {
      messages: [{ id: "user-current", role: "user" }],
    };
    mocks.copilotkit = { runAgent: vi.fn().mockResolvedValue(undefined) };
    defaultProps.onCitationSelect.mockClear();
    defaultProps.onRunStateChange.mockClear();
    defaultProps.onFailure.mockClear();
  });

  it("scopes the V2 provider, binds the composite thread, and filters to the latest user turn", () => {
    renderSurface();

    expect(mocks.providerProps).toMatchObject({
      runtimeUrl: "/api/lattice/copilotkit",
      properties: { snapshotRevision: 42 },
      enableInspector: false,
      showIntelligenceIndicator: false,
    });
    expect(mocks.chatProps?.threadId).toBe("investigation-1--thread-7");

    const messageFilter = mocks.providerProps?.messageFilter as (
      messages: Array<{ id: string; role: string }>,
    ) => Array<{ id: string; role: string }>;
    const messages = [
      { id: "user-old", role: "user" },
      { id: "assistant-old", role: "assistant" },
      { id: "user-latest", role: "user" },
    ];
    expect(messageFilter(messages)).toEqual([messages[2]]);
  });

  it("shows the Lattice welcome for an empty selected thread after its initial connection", () => {
    const markup = renderSurface();

    expect(markup).toContain("Grounded in this investigation");
    expect(markup).toContain("Ask about the current evidence");
  });

  it("keeps the Lattice welcome hidden while an empty selected thread is connecting", () => {
    mocks.isConnecting = true;

    const markup = renderSurface();

    expect(markup).not.toContain("Grounded in this investigation");
  });

  it("keeps the Lattice welcome hidden when the selected thread has restored messages", () => {
    mocks.messages = [{
      id: "restored-user",
      role: "user",
      content: "What changed?",
    }];

    const markup = renderSurface();

    expect(markup).toContain("What changed?");
    expect(markup).not.toContain("Grounded in this investigation");
  });

  it("renders validated answer details and unique clickable Lattice citations", () => {
    mocks.messages = [{
      id: "assistant-1",
      role: "assistant",
      content: answer.answer,
      metadata: { latticeAnswer: answer },
    }];
    const markup = renderSurface();

    expect(markup).toContain(answer.answer);
    expect(markup).toContain("The inspection passed.");
    expect(markup).toContain("Review the release package.");
    expect(markup).toContain("The latest supplier certificate is not available.");
    expect(markup).toContain("Would you like a release-readiness checklist?");
    expect(markup).toContain("Gearbox inspection record");
    expect(markup).toContain("evidence reference");
    expect(markup.match(/<button/g)).toHaveLength(1);

    const AssistantMessage = mocks.assistantMessage as React.FunctionComponent<{ message: Record<string, unknown> }>;
    const renderedMessage = AssistantMessage({
      message: {
        id: "assistant-1",
        role: "assistant",
        content: answer.answer,
        metadata: { latticeAnswer: answer },
      },
    }) as unknown as React.ReactNode;
    const findButton = (node: React.ReactNode): React.ReactElement<{ onClick?: () => void }> | undefined => {
      if (Array.isArray(node)) {
        for (const child of node) {
          const button = findButton(child);
          if (button) return button;
        }
        return undefined;
      }
      if (!React.isValidElement(node)) return undefined;
      if (node.type === "button")
        return node as React.ReactElement<{ onClick?: () => void }>;
      if (
        typeof node.type === "function" &&
        (node.type.name === "LatticeAssistantMessage" ||
          node.type.name === "CitationView" ||
          node.type.name === "CitationButton")
      ) {
        const Component = node.type as React.FunctionComponent<Record<string, unknown>>;
        return findButton(Component(node.props as Record<string, unknown>) as unknown as React.ReactNode);
      }
      return findButton((node.props as { children?: React.ReactNode }).children);
    };
    const citationButton = findButton(renderedMessage);
    expect(citationButton).toBeDefined();
    citationButton?.props.onClick?.();
    expect(defaultProps.onCitationSelect).toHaveBeenCalledWith(entityCitation);
  });

  it("falls back to safe plain text when restored answer metadata is missing", () => {
    mocks.messages = [{
      id: "assistant-legacy",
      role: "assistant",
      content: "A restored answer without structured metadata.",
    }];

    const markup = renderSurface();

    expect(markup).toContain("A restored answer without structured metadata.");
    expect(markup).not.toContain("Evidence details");
  });

  it("configures review cues as user-triggered suggestions before the first message", () => {
    renderSurface();

    expect(mocks.suggestions).toMatchObject({
      available: "before-first-message",
      suggestions: [{ title: cue.title, message: cue.prompt }],
    });
  });

  it("disables the archived composer and review suggestions while explaining read-only state", () => {
    const markup = renderSurface({ isArchived: true });

    expect(markup).toContain("disabled");
    expect(mocks.inputProps?.textArea).toMatchObject({ disabled: true, maxLength: 2000 });
    expect(markup).toContain("This investigation is archived");
    expect(mocks.suggestions).toBeNull();
  });

  it("shows an accessible working orb only while a run is active", () => {
    mocks.isRunning = true;
    mocks.messages = [{ id: "active-user", role: "user", content: "What changed?" }];
    const markup = renderSurface();

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Thinking");
    expect(mocks.cursorProps).toMatchObject({ state: "working", size: 20 });
  });

  it("reads server failure metadata from the V2 RUN_ERROR event and exposes only a safe message", async () => {
    renderSurface();
    const onError = mocks.chatProps?.onError as (event: {
      error: Error;
      code: string;
      context: Record<string, unknown>;
    }) => void;

    onError({
      error: new Error("provider diagnostic: subscription token"),
      code: "agent_run_error_event",
      context: {
        event: {
          type: "RUN_ERROR",
          message: "provider diagnostic: subscription token",
          metadata: {
            retryable: true,
            requestMayHaveBeenBilled: false,
            validationIssue: "A required citation was missing.",
          },
        },
      },
    });

    expect(defaultProps.onFailure).toHaveBeenCalledWith({
      message: "The assistant could not complete a validated response. Check the conversation state before trying again.",
      retryable: true,
      requestMayHaveBeenBilled: false,
      validationIssue: "A required citation was missing.",
    });
    expect(JSON.stringify(defaultProps.onFailure.mock.calls)).not.toContain("subscription token");
  });

  it.each([
    ["ambiguous metadata", { retryable: false, requestMayHaveBeenBilled: false }, false, false],
    ["potentially billed error", { retryable: true, requestMayHaveBeenBilled: true }, false, true],
    ["missing billing classification", { retryable: true }, false, true],
  ])("does not permit retry for %s", (_label, metadata, retryable, requestMayHaveBeenBilled) => {
    renderSurface();
    const onError = mocks.chatProps?.onError as (event: {
      error: Error;
      code: string;
      context: Record<string, unknown>;
    }) => void;

    onError({
      error: new Error("diagnostic detail"),
      code: "agent_run_error_event",
      context: { event: { metadata } },
    });

    expect(defaultProps.onFailure).toHaveBeenCalledWith(expect.objectContaining({
      retryable,
      requestMayHaveBeenBilled,
    }));
    expect(JSON.stringify(defaultProps.onFailure.mock.calls)).not.toContain("diagnostic detail");
  });

  it("renders the retry control only for server-approved, not-billed failures and reruns the existing user message", () => {
    const failure = {
      message: "A sanitized failure.",
      retryable: true,
      requestMayHaveBeenBilled: false,
    };
    const agent = {
      messages: [
        { id: "older-user", role: "user" },
        { id: "assistant-before", role: "assistant" },
        { id: "same-user-message-id", role: "user" },
      ],
      isRunning: false,
    };
    const copilotkit = { runAgent: vi.fn().mockResolvedValue(undefined) };
    const markup = renderToStaticMarkup(
      <CopilotKitRetryControl
        failure={failure}
        agent={agent as never}
        copilotkit={copilotkit as never}
        isAgentReady
      />,
    );
    const control = CopilotKitRetryControl({
      failure,
      agent: agent as never,
      copilotkit: copilotkit as never,
      isAgentReady: true,
    });
    const retryButton = React.Children.toArray(
      (control as React.ReactElement<{ children: React.ReactNode }>).props.children,
    ).find((child) => React.isValidElement(child) && child.type === "button") as
      React.ReactElement<{ onClick?: () => void }> | undefined;

    expect(markup).toContain("Try again");
    retryButton?.props.onClick?.();
    expect(copilotkit.runAgent).toHaveBeenCalledWith({ agent });
    expect(agent.messages.map((message) => message.id)).toEqual([
      "older-user",
      "assistant-before",
      "same-user-message-id",
    ]);
    expect(agent.messages.at(-1)?.id).toBe("same-user-message-id");
  });

  it.each([
    ["ambiguous", { retryable: false, requestMayHaveBeenBilled: false }],
    ["potentially billed", { retryable: true, requestMayHaveBeenBilled: true }],
    ["billing status missing", { retryable: true, requestMayHaveBeenBilled: undefined }],
  ])("does not render a retry control for %s failures", (_label, failure) => {
    const control = CopilotKitRetryControl({
      failure: { message: "Safe failure", ...failure } as never,
      agent: mocks.agent as never,
      copilotkit: mocks.copilotkit as never,
      isAgentReady: true,
    });

    expect(control).toBeNull();
    expect(mocks.copilotkit?.runAgent).not.toHaveBeenCalled();
  });
});
