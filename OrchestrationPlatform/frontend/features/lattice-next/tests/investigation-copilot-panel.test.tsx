import { cloneElement, createElement, isValidElement } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CopilotThreadsResponse } from "../copilot/client";
import type {
  CopilotAnswerContext,
  CopilotKitChatSurfaceProps,
} from "../workspace/CopilotKitChatSurface";
import type { EngineeringEntity, InvestigationGraph } from "../domain/model";
import { createInvestigationGraphCore } from "../engines/investigation-graph";
import { InvestigationCopilotPanel } from "../workspace/InvestigationCopilotPanel";

interface StateSlot {
  kind: "state";
  value: unknown;
}

interface EffectSlot {
  kind: "effect";
  dependencies?: readonly unknown[];
  cleanup?: () => void;
}

interface RefSlot {
  kind: "ref";
  current: unknown;
}

interface CallbackSlot {
  kind: "callback";
  callback: unknown;
  dependencies: readonly unknown[];
}

interface MemoSlot {
  kind: "memo";
  value: unknown;
  dependencies: readonly unknown[];
}

type HookSlot = StateSlot | EffectSlot | RefSlot | CallbackSlot | MemoSlot;

interface HookInstance {
  slots: HookSlot[];
}

interface PendingEffect {
  slot: EffectSlot;
  run: () => void | (() => void);
  dependencies?: readonly unknown[];
}

const hookHarness = vi.hoisted(() => ({
  instances: new Map<string, HookInstance>(),
  currentPath: "",
  hookIndex: 0,
  usedInstances: new Set<string>(),
  pendingEffects: [] as PendingEffect[],
}));

const clientMocks = vi.hoisted(() => ({
  getCopilotThreads: vi.fn(),
  getCopilotThread: vi.fn(),
  postCopilotMessage: vi.fn(),
}));

const surfaceProbe = vi.hoisted(() => ({
  props: undefined as CopilotKitChatSurfaceProps | undefined,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useState: <T,>(initial: T | (() => T)) => {
      const instance = hookHarness.instances.get(hookHarness.currentPath);
      if (!instance) throw new Error("A component must be active before using state.");
      const index = hookHarness.hookIndex++;
      let slot = instance.slots[index];
      if (!slot) {
        slot = {
          kind: "state",
          value: typeof initial === "function" ? (initial as () => T)() : initial,
        };
        instance.slots[index] = slot;
      }
      if (slot.kind !== "state") throw new Error("Hook order changed in the panel test harness.");
      return [
        slot.value as T,
        (next: T | ((previous: T) => T)) => {
          slot.value = typeof next === "function"
            ? (next as (previous: T) => T)(slot.value as T)
            : next;
        },
      ];
    },
    useRef: <T,>(initial: T) => {
      const instance = hookHarness.instances.get(hookHarness.currentPath);
      if (!instance) throw new Error("A component must be active before using refs.");
      const index = hookHarness.hookIndex++;
      let slot = instance.slots[index];
      if (!slot) {
        slot = { kind: "ref", current: initial };
        instance.slots[index] = slot;
      }
      if (slot.kind !== "ref") throw new Error("Hook order changed in the panel test harness.");
      return slot as { current: T };
    },
    useCallback: <T extends (...arguments_: never[]) => unknown>(
      callback: T,
      dependencies: readonly unknown[],
    ) => {
      const instance = hookHarness.instances.get(hookHarness.currentPath);
      if (!instance) throw new Error("A component must be active before using callbacks.");
      const index = hookHarness.hookIndex++;
      let slot = instance.slots[index];
      if (!slot) {
        slot = { kind: "callback", callback, dependencies };
        instance.slots[index] = slot;
      } else {
        if (slot.kind !== "callback") throw new Error("Hook order changed in the panel test harness.");
        const callbackSlot = slot as CallbackSlot;
        const changed = dependencies.length !== callbackSlot.dependencies.length ||
          dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, callbackSlot.dependencies[dependencyIndex]));
        if (changed) {
          callbackSlot.callback = callback;
          callbackSlot.dependencies = dependencies;
        }
      }
      return (slot as CallbackSlot).callback as T;
    },
    useMemo: <T,>(create: () => T, dependencies: readonly unknown[]) => {
      const instance = hookHarness.instances.get(hookHarness.currentPath);
      if (!instance) throw new Error("A component must be active before memoizing values.");
      const index = hookHarness.hookIndex++;
      let slot = instance.slots[index];
      if (!slot) {
        slot = { kind: "memo", value: create(), dependencies };
        instance.slots[index] = slot;
      } else {
        if (slot.kind !== "memo") throw new Error("Hook order changed in the panel test harness.");
        const previousDependencies = slot.dependencies;
        const changed = dependencies.length !== previousDependencies.length ||
          dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, previousDependencies[dependencyIndex]));
        if (changed) {
          slot.value = create();
          slot.dependencies = dependencies;
        }
      }
      return (slot as MemoSlot).value as T;
    },
    useEffect: (run: () => void | (() => void), dependencies?: readonly unknown[]) => {
      const instance = hookHarness.instances.get(hookHarness.currentPath);
      if (!instance) throw new Error("A component must be active before using effects.");
      const index = hookHarness.hookIndex++;
      let slot = instance.slots[index];
      if (!slot) {
        slot = { kind: "effect" };
        instance.slots[index] = slot;
      }
      if (slot.kind !== "effect") throw new Error("Hook order changed in the panel test harness.");
      const changed = dependencies === undefined ||
        slot.dependencies === undefined ||
        dependencies.length !== slot.dependencies.length ||
        dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, slot.dependencies?.[dependencyIndex]));
      if (changed) hookHarness.pendingEffects.push({ slot, run, dependencies });
    },
  };
});

vi.mock("../copilot/client", () => clientMocks);

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    createPortal: (children: ReactNode) => children,
  };
});

vi.mock("../workspace/CopilotKitChatSurface", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    CopilotKitChatSurface: (props: CopilotKitChatSurfaceProps) => {
      surfaceProbe.props = props;
      return actual.createElement(
        "section",
        { "data-testid": "copilot-chat", "data-thread-id": props.threadId },
        actual.createElement(
          "button",
          { type: "button", "aria-label": "Simulate active run", onClick: () => props.onRunStateChange(true) },
          "Start run",
        ),
        actual.createElement(
          "button",
          { type: "button", "aria-label": "Simulate completed run", onClick: () => props.onRunStateChange(false) },
          "Complete run",
        ),
        actual.createElement("button", { type: "button", "aria-label": "Stop generating" }, "Stop"),
        actual.createElement(
          "button",
          {
            type: "button",
            "aria-label": "Simulate request failure",
            onClick: () => props.onFailure({
              message: "The validated answer could not be loaded.",
              retryable: false,
              requestMayHaveBeenBilled: false,
            }),
          },
          "Fail",
        ),
        actual.createElement(
          "button",
          {
            type: "button",
            "aria-label": "Simulate billed request failure",
            onClick: () => props.onFailure({
              message: "The assistant could not complete a validated response.",
              retryable: false,
              requestMayHaveBeenBilled: true,
            }),
          },
          "Fail with billing uncertainty",
        ),
        actual.createElement(
          "button",
          {
            type: "button",
            "aria-label": "Simulate validation failure",
            onClick: () => props.onFailure({
              message: "The assistant could not complete a validated response.",
              retryable: false,
              requestMayHaveBeenBilled: false,
              validationIssue: "A required citation was missing.",
            }),
          },
          "Fail with validation detail",
        ),
        actual.createElement(
          "button",
          {
            type: "button",
            "aria-label": "Simulate unsafe validation detail",
            onClick: () => props.onFailure({
              message: "The assistant could not complete a validated response.",
              retryable: false,
              requestMayHaveBeenBilled: false,
              validationIssue: `${"x".repeat(161)}\nprovider diagnostic`,
            }),
          },
          "Fail with unsafe validation detail",
        ),
      );
    },
  };
});

const latestThreadId = "thread-latest";
const cue = {
  id: "coverage:windchill",
  title: "Source coverage is incomplete",
  detail: "Evidence is partial for Windchill.",
  prompt: "Explain the incomplete Windchill coverage.",
  citationEntityIds: [],
};
const graphEntities: EngineeringEntity[] = [
  {
    id: "entity-one",
    sourceNodeId: "entity-one",
    source: "platform",
    name: "Entity one",
    kind: "component",
    level: 0,
    attributes: {},
    provenance: { sourceLabel: "test" },
  },
  {
    id: "entity-two",
    sourceNodeId: "entity-two",
    source: "platform",
    name: "Entity two",
    kind: "component",
    level: 0,
    attributes: {},
    provenance: { sourceLabel: "test" },
  },
];
const domain: InvestigationGraph = {
  entities: graphEntities,
  relationships: [],
  roots: graphEntities.map((entity) => entity.id),
  byId: Object.fromEntries(graphEntities.map((entity) => [entity.id, entity])),
  relationshipById: {},
};
const core = createInvestigationGraphCore(domain);

function answerContext(messageId: string, entityId: string): CopilotAnswerContext {
  return {
    messageId,
    answer: {
      answer: `Answer ${messageId}`,
      claims: [],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: 8,
      citations: [{
        citationId: `cite:entity:${encodeURIComponent(entityId)}`,
        kind: "entity",
        label: entityId,
      }],
    },
  };
}

function dialog(tree: ReactNode) {
  const found = findElements(tree, (element) => element.props.role === "dialog")[0];
  if (!found) throw new Error("Expected the investigation copilot dialog.");
  return found;
}

const summary = (threadId: string, title: string) => ({
  investigationId: "investigation-1" as CopilotThreadsResponse["threads"][number]["investigationId"],
  threadId,
  title,
  threadRevision: 3,
  createdAt: "2026-10-25T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
  messageCount: 2,
});

function threadResponse(
  threads: ReturnType<typeof summary>[],
  latestThreadIdValue?: string,
  investigationId = "investigation-1",
): CopilotThreadsResponse {
  const latestSummary = threads.find((thread) => thread.threadId === latestThreadIdValue);
  return {
    investigationId: investigationId as CopilotThreadsResponse["investigationId"],
    threads,
    ...(latestSummary
      ? {
          latestThread: {
            ...latestSummary,
            messages: [],
          },
        }
      : {}),
  } as CopilotThreadsResponse;
}

function renderComponents(node: ReactNode, path = "root"): ReactNode {
  if (Array.isArray(node)) return node.map((child, index) => renderComponents(child, `${path}/${index}`));
  if (
    typeof node === "object" &&
    node !== null &&
    "$$typeof" in node &&
    node.$$typeof === Symbol.for("react.portal")
  ) {
    return renderComponents((node as { children: ReactNode }).children, path);
  }
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown>>;
  if (typeof element.type === "function") {
    const name = element.type.name;
    if (!name.startsWith("InvestigationCopilot") && name !== "CopilotKitChatSurface") return element;
    const componentPath = `${path}/${name}:${String(element.key ?? "")}`;
    let instance = hookHarness.instances.get(componentPath);
    if (!instance) {
      instance = { slots: [] };
      hookHarness.instances.set(componentPath, instance);
    }
    hookHarness.usedInstances.add(componentPath);
    const previousPath = hookHarness.currentPath;
    const previousIndex = hookHarness.hookIndex;
    hookHarness.currentPath = componentPath;
    hookHarness.hookIndex = 0;
    const result = (element.type as (props: Record<string, unknown>) => ReactNode)(element.props);
    const rendered = renderComponents(result, componentPath);
    hookHarness.currentPath = previousPath;
    hookHarness.hookIndex = previousIndex;
    return rendered;
  }

  const children = element.props.children;
  if (children === undefined) return element;
  const renderedChildren = renderComponents(children as ReactNode, `${path}/${String(element.type)}`);
  return cloneElement(element, {}, renderedChildren);
}

function runEffects() {
  for (const pending of hookHarness.pendingEffects.splice(0)) {
    pending.slot.cleanup?.();
    pending.slot.dependencies = pending.dependencies;
    const cleanup = pending.run();
    pending.slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
  }

  for (const [path, instance] of hookHarness.instances) {
    if (hookHarness.usedInstances.has(path)) continue;
    for (const slot of instance.slots) {
      if (slot.kind === "effect") slot.cleanup?.();
    }
    hookHarness.instances.delete(path);
  }
  hookHarness.usedInstances.clear();
}

function renderPanel(props: Partial<ComponentProps<typeof InvestigationCopilotPanel>> = {}) {
  let tree: ReactNode = null;
  for (let render = 0; render < 5; render += 1) {
    hookHarness.pendingEffects = [];
    hookHarness.usedInstances.clear();
    tree = renderComponents(createElement(InvestigationCopilotPanel, {
      investigationId: "investigation-1",
      snapshotRevision: 8,
      domain,
      core,
      onClose: vi.fn(),
      ...props,
    }));
    const hasPendingEffects = hookHarness.pendingEffects.length > 0;
    runEffects();
    if (!hasPendingEffects) break;
  }
  return tree;
}

function findElements(tree: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean) {
  const matches: ReactElement<Record<string, unknown>>[] = [];
  const visit = (node: ReactNode) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isValidElement(node)) return;
    const element = node as ReactElement<Record<string, unknown>>;
    if (predicate(element)) matches.push(element);
    visit(element.props.children as ReactNode);
  };
  visit(tree);
  return matches;
}

function byLabel(tree: ReactNode, label: string) {
  const element = findElements(tree, (candidate) =>
    candidate.props["aria-label"] === label || candidate.props["aria-label"] === `Dismiss ${label}`,
  )[0];
  if (!element) throw new Error(`Expected an element labeled "${label}".`);
  return element;
}

function byText(tree: ReactNode, text: string) {
  const element = findElements(tree, (candidate) =>
    candidate.type === "button" && textContent(candidate) === text,
  )[0];
  if (!element) throw new Error(`Expected a button with text "${text}".`);
  return element;
}

function textContent(tree: ReactNode): string {
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (!isValidElement(tree)) return "";
  return textContent((tree as ReactElement<Record<string, unknown>>).props.children as ReactNode);
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function resolvedPanel(props: Partial<ComponentProps<typeof InvestigationCopilotPanel>> = {}) {
  renderPanel(props);
  return flushAsync().then(() => renderPanel(props));
}

describe("investigation copilot panel", () => {
  beforeEach(() => {
    hookHarness.instances.clear();
    hookHarness.pendingEffects = [];
    hookHarness.usedInstances.clear();
    hookHarness.currentPath = "";
    hookHarness.hookIndex = 0;
    surfaceProbe.props = undefined;
    clientMocks.getCopilotThreads.mockReset();
    clientMocks.getCopilotThread.mockReset();
    clientMocks.postCopilotMessage.mockReset();
    clientMocks.getCopilotThreads.mockResolvedValue(threadResponse([]));
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", { activeElement: null });
    vi.stubGlobal("HTMLElement", class {});
  });

  it("loads the latest saved Lattice thread into CopilotKit and offers accessible thread controls", async () => {
    clientMocks.getCopilotThreads.mockResolvedValue(threadResponse([
      summary("thread-older", "Older conversation"),
      summary(latestThreadId, "Latest conversation"),
    ], latestThreadId));

    await resolvedPanel();

    expect(clientMocks.getCopilotThreads).toHaveBeenCalledWith("investigation-1");
    expect(surfaceProbe.props?.threadId).toBe(latestThreadId);
    const selector = byLabel(renderPanel(), "Conversations");
    expect(selector.type).toBe("select");
    expect(selector.props.value).toBe(latestThreadId);
    expect(textContent(selector)).toContain("Latest conversation");
    expect(textContent(selector)).toContain("Older conversation");
    const conversationControls = findElements(renderPanel(), (element) =>
      element.props.role === "group" && element.props["aria-label"] === "Conversation controls",
    )[0];
    expect(conversationControls).toBeDefined();
    expect(findElements(conversationControls, (element) =>
      element.type === "select" || element.props["aria-label"] === "New conversation",
    )).toHaveLength(2);
  });

  it("restores the selected saved thread through the CopilotKit surface", async () => {
    clientMocks.getCopilotThreads.mockResolvedValue(threadResponse([
      summary("thread-older", "Older conversation"),
      summary(latestThreadId, "Latest conversation"),
    ], latestThreadId));

    await resolvedPanel();
    const selector = byLabel(renderPanel(), "Conversations");
    (selector.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "thread-older" },
    });
    renderPanel();

    expect(surfaceProbe.props?.threadId).toBe("thread-older");
    expect(clientMocks.getCopilotThread).not.toHaveBeenCalled();
  });

  it("creates a fresh client thread without persisting or posting a message", async () => {
    clientMocks.getCopilotThreads.mockResolvedValue(threadResponse([
      summary(latestThreadId, "Latest conversation"),
    ], latestThreadId));

    await resolvedPanel();
    const previousId = surfaceProbe.props?.threadId;
    const createButton = byLabel(renderPanel(), "New conversation");
    (createButton.props.onClick as () => void)();
    renderPanel();

    expect(surfaceProbe.props?.threadId).not.toBe(previousId);
    expect(surfaceProbe.props?.threadId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
    expect(clientMocks.postCopilotMessage).not.toHaveBeenCalled();
  });

  it("keeps_citations_routed_to_the_selected_answer_without_opening_relationships", async () => {
    const onClose = vi.fn();
    await resolvedPanel({ onClose });
    const latest = answerContext("assistant-latest", "entity-one");
    surfaceProbe.props?.onAnswerContextAvailable(latest);

    let tree = renderPanel({ onClose });
    expect(dialog(tree).props["data-context-open"]).toBe(false);
    expect(dialog(tree).props["data-latest-answer-message-id"]).toBe("assistant-latest");
    expect(dialog(tree).props["data-selected-cited-graph-node-ids"]).toBeUndefined();
    expect(textContent(tree)).not.toContain("Explore relationships");

    const older = answerContext("assistant-older", "entity-two");
    const olderCitation = older.answer.citations?.[0];
    if (!olderCitation) throw new Error("Expected the older answer's graph citation.");
    surfaceProbe.props?.onWhySelect(older);

    tree = renderPanel({ onClose });
    expect(dialog(tree).props["data-context-open"]).toBe(true);
    expect(dialog(tree).props["data-context-destination"]).toBe("explanation");
    expect(dialog(tree).props["data-context-answer-message-id"]).toBe("assistant-older");
    expect(dialog(tree).props["data-selected-cited-graph-node-ids"]).toBe("entity-two");
    expect(findElements(tree, (element) =>
      typeof element.type === "function" && element.type.name === "CopilotCitedGraph",
    )).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();

    (byLabel(tree, `Open entity reference: ${olderCitation.label}`).props.onClick as () => void)();
    tree = renderPanel({ onClose });
    expect(dialog(tree).props["data-context-destination"]).toBe("explanation");
    expect(dialog(tree).props["data-context-answer-message-id"]).toBe("assistant-older");
    expect(dialog(tree).props["data-selected-cited-graph-node-ids"]).toBe("entity-two");
    expect(dialog(tree).props["data-selected-citation-id"]).toBe(olderCitation.citationId);

    (byText(tree, "Explore relationships").props.onClick as () => void)();
    tree = renderPanel({ onClose });
    expect(dialog(tree).props["data-context-destination"]).toBe("graph");
    expect(findElements(tree, (element) =>
      typeof element.type === "function" && element.type.name === "CopilotCitedGraph",
    )).toHaveLength(1);
  });

  it("keeps_the_explanation_sidecar_closed_until_requested", async () => {
    await resolvedPanel();
    const selected = answerContext("assistant-why", "entity-one");
    surfaceProbe.props?.onAnswerContextAvailable(selected);
    let tree = renderPanel();

    expect(dialog(tree).props["data-context-open"]).toBe(false);
    expect(textContent(tree)).not.toContain("Explore relationships");
    expect(findElements(tree, (element) =>
      typeof element.type === "function" && element.type.name === "CopilotCitedGraph",
    )).toHaveLength(0);

    surfaceProbe.props?.onWhySelect(selected);
    tree = renderPanel();

    expect(dialog(tree).props["data-context-open"]).toBe(true);
    expect(dialog(tree).props["data-context-destination"]).toBe("explanation");
    expect(dialog(tree).props["data-context-answer-message-id"]).toBe("assistant-why");
    expect(dialog(tree).props["data-phone-mode"]).toBe("context");
  });

  it("returns_from_the_phone_sidecar_to_the_conversation", async () => {
    await resolvedPanel();
    const selected = answerContext("assistant-phone", "entity-one");
    surfaceProbe.props?.onAnswerContextAvailable(selected);
    surfaceProbe.props?.onWhySelect(selected);
    let tree = renderPanel();

    expect(dialog(tree).props["data-context-open"]).toBe(true);
    expect(dialog(tree).props["data-phone-mode"]).toBe("context");
    expect(findElements(tree, (element) =>
      element.props["data-testid"] === "copilot-chat",
    )).toHaveLength(1);

    (byText(tree, "Back to conversation").props.onClick as () => void)();
    tree = renderPanel();

    expect(dialog(tree).props["data-phone-mode"]).toBe("conversation");
    expect(dialog(tree).props["data-context-answer-message-id"]).toBe("assistant-phone");
    expect(findElements(tree, (element) =>
      element.props["data-testid"] === "copilot-chat",
    )).toHaveLength(1);
  });

    it("returns_focus_to_the_why_control_when_the_explanation_closes", async () => {
      await resolvedPanel();
      const focus = vi.fn();
      const trigger = Object.assign(new HTMLElement(), {
        isConnected: true,
        focus,
      }) as unknown as HTMLElement;
      (document as unknown as { activeElement: HTMLElement | null }).activeElement = trigger;

      surfaceProbe.props?.onWhySelect(answerContext("assistant-focus", "entity-one"));
      let tree = renderPanel();
      expect(dialog(tree).props["data-context-open"]).toBe(true);

      focus.mockClear();
      (byText(tree, "Close explanation").props.onClick as () => void)();
      expect(focus).toHaveBeenCalledOnce();
      tree = renderPanel();

      expect(dialog(tree).props["data-context-open"]).toBe(false);
    });

    it("does_not_repeat_the_answer_or_open_the_graph_by_default", async () => {
      const claimCitation = {
        citationId: "evidence-claim",
        kind: "evidence" as const,
        label: "Inspection record",
        source: "Teamcenter",
        nativeId: "IR-19",
        summary: "The assembly passed inspection.",
      };
      const recommendationCitation = {
        citationId: "source-recommendation",
        kind: "source" as const,
        label: "Release package",
        source: "Windchill",
      };
      const answer: CopilotAnswerContext = {
        messageId: "assistant-grouped",
        answer: {
          answer: "The assembly is ready for review.",
          claims: [{
            text: "The inspection passed.",
            kind: "fact",
            citationIds: [claimCitation.citationId],
          }],
          recommendations: [{
            text: "Review the release package.",
            rationale: "Approval remains.",
            citationIds: [recommendationCitation.citationId],
            approvalRequired: true,
          }],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision: 8,
          citations: [claimCitation, recommendationCitation],
        },
      };
      await resolvedPanel();
      surfaceProbe.props?.onAnswerContextAvailable(answer);
      let tree = renderPanel();
      expect(dialog(tree).props["data-context-open"]).toBe(false);
      surfaceProbe.props?.onWhySelect(answer);
      tree = renderPanel();

      const claimSection = findElements(tree, (element) =>
        element.type === "section" && element.props["aria-label"] === "Supporting explanation",
      )[0];
      const recommendationSection = findElements(tree, (element) =>
        element.type === "section" && element.props["aria-label"] === "Decision context",
      )[0];
      const citationSection = findElements(tree, (element) =>
        element.type === "section" && element.props["aria-label"] === "Cited sources",
      )[0];
      expect(textContent(claimSection)).toContain("The inspection passed.");
      expect(textContent(recommendationSection)).toContain("Approval remains.");
      expect(textContent(recommendationSection)).not.toContain("Review the release package.");
      expect(textContent(recommendationSection)).toContain("Approval required");
      expect(textContent(citationSection)).toContain("Inspection record");
      expect(textContent(citationSection)).toContain("Teamcenter");
      expect(textContent(citationSection)).toContain("IR-19");
      expect(textContent(tree)).not.toContain("The assembly is ready for review.");
      expect(textContent(tree)).not.toContain("Explore relationships");
    });

  it("keeps_review_cue_dismissal_available_as_a_quiet_follow_up", async () => {
    const props = { cues: [cue] };
    await resolvedPanel(props);
    const tree = renderPanel(props);

    expect(surfaceProbe.props?.cues).toEqual([cue]);
    expect(dialog(tree).props["data-context-open"]).toBe(false);
    expect(findElements(tree, (element) =>
      element.props.role === "tab" || element.props.role === "tablist",
    )).toHaveLength(0);
    expect(textContent(tree)).not.toContain(cue.title);

    const selected = answerContext("assistant-cue", "entity-one");
    surfaceProbe.props?.onAnswerContextAvailable(selected);
    surfaceProbe.props?.onWhySelect(selected);
    const explanationTree = renderPanel(props);
    expect(textContent(explanationTree)).not.toContain(cue.title);
    expect(textContent(explanationTree)).not.toContain("Review suggestions");
  });

  it("keeps_the_selected_answer_during_a_run_and_reveals_relationships_only_on_request", async () => {
    await resolvedPanel();
    const firstAnswer = answerContext("assistant-first", "entity-one");
    surfaceProbe.props?.onAnswerContextAvailable(firstAnswer);
    const firstCitation = firstAnswer.answer.citations?.[0];
    if (!firstCitation) throw new Error("Expected the first answer's graph citation.");
    surfaceProbe.props?.onCitationSelect({ ...firstAnswer, citation: firstCitation });

    let tree = renderPanel();
    expect(dialog(tree).props["data-context-destination"]).toBe("explanation");
    expect(findElements(tree, (element) =>
      typeof element.type === "function" && element.type.name === "CopilotCitedGraph",
    )).toHaveLength(0);
    (byText(tree, "Explore relationships").props.onClick as () => void)();
    tree = renderPanel();
    (byLabel(tree, "Simulate active run").props.onClick as () => void)();
    tree = renderPanel();
    expect(dialog(tree).props["data-context-destination"]).toBe("graph");
    expect(dialog(tree).props["data-context-answer-message-id"]).toBe("assistant-first");
    expect(dialog(tree).props["data-selected-cited-graph-node-ids"]).toBe("entity-one");

    const nextAnswer = answerContext("assistant-next", "entity-two");
    surfaceProbe.props?.onAnswerContextAvailable(nextAnswer);
    tree = renderPanel();
    expect(dialog(tree).props["data-latest-answer-message-id"]).toBe("assistant-next");
    expect(dialog(tree).props["data-context-answer-message-id"]).toBe("assistant-next");
    expect(dialog(tree).props["data-context-destination"]).toBe("explanation");
    expect(dialog(tree).props["data-selected-cited-graph-node-ids"]).toBeUndefined();
    expect(findElements(tree, (element) =>
      typeof element.type === "function" && element.type.name === "CopilotCitedGraph",
    )).toHaveLength(0);
  });

  it("clears answer contexts after switching conversations or starting a new one", async () => {
    clientMocks.getCopilotThreads.mockResolvedValue(threadResponse([
      summary("thread-older", "Older conversation"),
      summary(latestThreadId, "Latest conversation"),
    ], latestThreadId));
    await resolvedPanel();
    const context = answerContext("assistant-stale", "entity-one");
    surfaceProbe.props?.onAnswerContextAvailable(context);
    const citation = context.answer.citations?.[0];
    if (!citation) throw new Error("Expected a conversation citation.");
    surfaceProbe.props?.onCitationSelect({ ...context, citation });

    let tree = renderPanel();
    const selector = byLabel(tree, "Conversations");
    (selector.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "thread-older" },
    });
    tree = renderPanel();
    expect(dialog(tree).props["data-context-open"]).toBe(false);
    expect(dialog(tree).props["data-latest-answer-message-id"]).toBeUndefined();
    expect(dialog(tree).props["data-context-answer-message-id"]).toBeUndefined();

    const activeContext = answerContext("assistant-active", "entity-two");
    surfaceProbe.props?.onAnswerContextAvailable(activeContext);
    tree = renderPanel();
    expect(dialog(tree).props["data-latest-answer-message-id"]).toBe("assistant-active");
    (byLabel(tree, "New conversation").props.onClick as () => void)();
    tree = renderPanel();
    expect(dialog(tree).props["data-context-open"]).toBe(false);
    expect(dialog(tree).props["data-latest-answer-message-id"]).toBeUndefined();
    expect(dialog(tree).props["data-context-answer-message-id"]).toBeUndefined();
  });

  it("shows loading and Lattice history errors without rendering stale chat", async () => {
    let rejectLoad: (error: Error) => void = () => undefined;
    clientMocks.getCopilotThreads.mockImplementation(() => new Promise((_, reject) => {
      rejectLoad = reject;
    }));

    let tree = renderPanel();
    expect(textContent(tree)).toContain("Restoring saved conversations…");
    expect(surfaceProbe.props).toBeUndefined();

    rejectLoad(new Error("Conversation history is unavailable."));
    await flushAsync();
    tree = renderPanel();

    expect(findElements(tree, (element) => element.props.role === "alert")).toHaveLength(1);
    expect(textContent(tree)).toContain("Conversation history is unavailable.");
    expect(surfaceProbe.props).toBeUndefined();
  });

  it("ignores a prior investigation's delayed thread response after props change", async () => {
    let resolveOld: (response: CopilotThreadsResponse) => void = () => undefined;
    clientMocks.getCopilotThreads.mockImplementation((investigationId: string) => {
      if (investigationId === "investigation-old") {
        return new Promise((resolve) => { resolveOld = resolve; });
      }
      return Promise.resolve(threadResponse(
        [summary("thread-current", "Current investigation")],
        "thread-current",
        investigationId,
      ));
    });

    renderPanel({ investigationId: "investigation-old" });
    await flushAsync();
    await resolvedPanel({ investigationId: "investigation-current" });
    resolveOld(threadResponse([summary("thread-leaked", "Previous investigation")], "thread-leaked"));
    await flushAsync();
    const tree = renderPanel({ investigationId: "investigation-current" });

    expect(surfaceProbe.props?.investigationId).toBe("investigation-current");
    expect(surfaceProbe.props?.threadId).toBe("thread-current");
    expect(textContent(tree)).not.toContain("Previous investigation");
  });

  it("blocks selection and fresh threads during an active run but retains the stop affordance", async () => {
    clientMocks.getCopilotThreads
      .mockResolvedValueOnce(threadResponse([
        summary(latestThreadId, "Latest conversation"),
      ], latestThreadId))
      .mockResolvedValueOnce(threadResponse([
        summary(latestThreadId, "Latest conversation"),
        summary("thread-created-by-run", "Conversation after run"),
      ], "thread-created-by-run"));

    await resolvedPanel();
    let tree = renderPanel();
    const activeThreadId = surfaceProbe.props?.threadId;
    (byLabel(tree, "Simulate active run").props.onClick as () => void)();
    tree = renderPanel();

    expect(byLabel(tree, "Conversations").props.disabled).toBe(true);
    expect(byLabel(tree, "New conversation").props.disabled).toBe(true);
    expect(byLabel(tree, "Stop generating").props.disabled).not.toBe(true);

    (byLabel(tree, "Simulate completed run").props.onClick as () => void)();
    await flushAsync();
    tree = renderPanel();
    expect(clientMocks.getCopilotThreads).toHaveBeenCalledTimes(2);
    expect(surfaceProbe.props?.threadId).toBe(activeThreadId);
    expect(textContent(byLabel(tree, "Conversations"))).toContain("Conversation after run");
    expect(clientMocks.postCopilotMessage).not.toHaveBeenCalled();
  });

  it("keeps archived status, hidden review cues, close behavior, and CopilotKit failures", async () => {
    const cue = {
      id: "coverage:sap",
      title: "Source coverage is incomplete",
      detail: "SAP evidence is unavailable.",
      prompt: "Explain the SAP evidence gap.",
      citationEntityIds: [],
    };
    const onClose = vi.fn();
    const props = {
      isArchived: true,
      cues: [cue],
      onClose,
    };

    await resolvedPanel(props);
    let tree = renderPanel(props);
    expect(textContent(tree)).toContain("Archived, read only");
    expect(textContent(tree)).toContain("Restore this investigation before sending messages.");
    expect(surfaceProbe.props?.cues).toEqual([]);
    expect(textContent(tree)).not.toContain(cue.title);

    (byLabel(tree, "Simulate request failure").props.onClick as () => void)();
    tree = renderPanel(props);
    expect(textContent(tree)).toContain("The validated answer could not be loaded.");

    (byLabel(tree, "Simulate billed request failure").props.onClick as () => void)();
    tree = renderPanel(props);
    expect(textContent(tree)).toContain("The request may have been billed; check the usage ledger before retrying.");

    (byLabel(tree, "Simulate validation failure").props.onClick as () => void)();
    tree = renderPanel(props);
    expect(textContent(tree)).toContain("Detail: A required citation was missing.");

    (byLabel(tree, "Simulate unsafe validation detail").props.onClick as () => void)();
    tree = renderPanel(props);
    expect(textContent(tree)).not.toContain("provider diagnostic");
    expect(textContent(tree)).not.toContain("x".repeat(161));

    const registeredWindow = window as unknown as { addEventListener: ReturnType<typeof vi.fn> };
    const keyDown = registeredWindow.addEventListener.mock.calls.find(([name]) => name === "keydown")?.[1] as
      | ((event: { key: string }) => void)
      | undefined;
    keyDown?.({ key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
