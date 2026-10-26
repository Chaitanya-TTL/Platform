import { cloneElement, createElement, isValidElement } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CopilotThreadsResponse } from "../copilot/client";
import type { CopilotKitChatSurfaceProps } from "../workspace/CopilotKitChatSurface";
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

type HookSlot = StateSlot | EffectSlot | RefSlot | CallbackSlot;

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
      );
    },
  };
});

const latestThreadId = "thread-latest";
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
  hookHarness.pendingEffects = [];
  hookHarness.usedInstances.clear();
  const tree = renderComponents(createElement(InvestigationCopilotPanel, {
    investigationId: "investigation-1",
    snapshotRevision: 8,
    onClose: vi.fn(),
    onCitationSelect: vi.fn(),
    ...props,
  }));
  runEffects();
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

  it("shows loading and Lattice history errors without rendering stale chat", async () => {
    let rejectLoad: (error: Error) => void = () => undefined;
    clientMocks.getCopilotThreads.mockImplementation(() => new Promise((_, reject) => {
      rejectLoad = reject;
    }));

    let tree = renderPanel();
    expect(textContent(tree)).toContain("Loading conversations…");
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

  it("keeps archived status, review cue dismissal, close behavior, and CopilotKit failures", async () => {
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
      onCitationSelect: vi.fn(),
    };

    await resolvedPanel(props);
    let tree = renderPanel(props);
    expect(textContent(tree)).toContain("Archived, read only");
    expect(textContent(tree)).toContain("Restore this investigation before sending messages.");
    expect(surfaceProbe.props?.cues).toEqual([cue]);
    expect(textContent(tree)).toContain(cue.title);

    (byLabel(tree, `Dismiss ${cue.title}`).props.onClick as () => void)();
    tree = renderPanel(props);
    expect(textContent(tree)).not.toContain(cue.title);

    (byLabel(tree, "Simulate request failure").props.onClick as () => void)();
    tree = renderPanel(props);
    expect(textContent(tree)).toContain("The validated answer could not be loaded.");

    const registeredWindow = window as unknown as { addEventListener: ReturnType<typeof vi.fn> };
    const keyDown = registeredWindow.addEventListener.mock.calls.find(([name]) => name === "keydown")?.[1] as
      | ((event: { key: string }) => void)
      | undefined;
    keyDown?.({ key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
