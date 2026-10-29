import { describe, expect, it, vi } from "vitest";
import { EventType, type RunAgentInput } from "@ag-ui/client";
import { asInvestigationId } from "../../kernel/contracts/investigation-identity";
import { toCopilotKitThreadId } from "../copilotkit-agent-runner";
vi.mock("server-only", () => ({}));

import { CopilotKitAgentError, LatticeCopilotAgent } from "../copilotkit-agent";

const investigationId = asInvestigationId("investigation-one");
const answer = {
  answer: "The selected record is current.",
  claims: [{ text: "The record is current.", kind: "fact" as const, citationIds: ["cite:entity:part%3A1"] }],
  recommendations: [],
  uncertainties: [],
  followUpQuestions: [],
  snapshotRevision: 3,
  citations: [{ citationId: "cite:entity:part%3A1", kind: "entity" as const, label: "Part 1" }],
};

function collect(run: ReturnType<LatticeCopilotAgent["run"]>) {
  return new Promise<unknown[]>((resolve, reject) => {
    const events: unknown[] = [];
    run.subscribe({ next: (event) => events.push(event), error: reject, complete: () => resolve(events) });
  });
}

const input: RunAgentInput = {
  threadId: toCopilotKitThreadId(investigationId, "thread-1"),
  runId: "run-1",
  messages: [{ id: "question-1", role: "user", content: "Explain the source status" }],
  tools: [],
  context: [],
  forwardedProps: { snapshotRevision: 3 },
};

describe("Lattice CopilotKit agent", () => {
  it("runs the approved server turn service and emits only its validated answer", async () => {
    const executeTurn = vi.fn().mockResolvedValue(answer);
    const agent = new LatticeCopilotAgent(executeTurn);

    const events = await collect(agent.run(input));

    expect(executeTurn).toHaveBeenCalledWith(expect.objectContaining({
      investigationId,
      threadId: "thread-1",
      expectedSnapshotRevision: 3,
      idempotencyKey: "question-1",
      message: "Explain the source status",
    }), expect.any(AbortSignal));
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(events[1]).toMatchObject({ metadata: { latticeAnswer: answer } });
    expect((events[1] as { metadata: { latticeAnswer: typeof answer } }).metadata.latticeAnswer.snapshotRevision)
      .toBe(3);
    expect(events.some((event) => (event as { type: string }).type === EventType.TEXT_MESSAGE_CONTENT))
      .toBe(false);
  });

  it("preserves investigation configuration when CopilotKit clones the agent", async () => {
    const executeTurn = vi.fn().mockResolvedValue(answer);
    const clone = new LatticeCopilotAgent(executeTurn).clone() as LatticeCopilotAgent;

    await collect(clone.run(input));

    expect(executeTurn).toHaveBeenCalledWith(expect.objectContaining({ investigationId }), expect.any(AbortSignal));
  });

  it("emits only the safe failure classification, never provider diagnostics", async () => {
    const executeTurn = vi.fn().mockRejectedValue(new CopilotKitAgentError(
      "The provider request may have been billed. Check the usage ledger before retrying.",
      "provider-failure",
      false,
      true,
    ));
    const events = await collect(new LatticeCopilotAgent(executeTurn).run(input));
    const runError = events.at(-1);

    expect(runError).toMatchObject({
      type: EventType.RUN_ERROR,
      code: "provider-failure",
      message: "The provider request may have been billed. Check the usage ledger before retrying.",
      metadata: { retryable: false, requestMayHaveBeenBilled: true },
    });
    expect(JSON.stringify(events)).not.toContain("proxy diagnostic secret");
  });

  it("forwards only the safe validation failure classification", async () => {
    const executeTurn = vi.fn().mockRejectedValue(new CopilotKitAgentError(
      "The response did not pass answer validation.",
      "answer-validation-failed",
      true,
      false,
      "The response omitted a required citation.",
    ));

    const events = await collect(new LatticeCopilotAgent(executeTurn).run(input));
    const runError = events.at(-1);

    expect(runError).toMatchObject({
      type: EventType.RUN_ERROR,
      message: "The response did not pass answer validation.",
      metadata: {
        retryable: true,
        requestMayHaveBeenBilled: false,
        validationIssue: "The response omitted a required citation.",
      },
    });
    expect(JSON.stringify(events)).not.toContain("raw provider response");
  });

  it("reuses the existing user-message ID as the idempotency key for a second run", async () => {
    const executeTurn = vi.fn().mockRejectedValueOnce(new CopilotKitAgentError(
      "A safe retryable error.",
      "transient-error",
      true,
      false,
    )).mockResolvedValueOnce(answer);
    const agent = new LatticeCopilotAgent(executeTurn);

    await collect(agent.run(input));
    await collect(agent.run(input));

    expect(executeTurn.mock.calls.map(([turn]) => turn.idempotencyKey)).toEqual([
      "question-1",
      "question-1",
    ]);
  });

  it("replaces unexpected provider diagnostics with a safe fallback RUN_ERROR", async () => {
    const executeTurn = vi.fn().mockRejectedValue(
      new Error("https://provider.invalid/deployments/secret?api-key=provider-secret"),
    );

    const events = await collect(new LatticeCopilotAgent(executeTurn).run(input));

    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: "Copilot could not complete a validated answer. Check the conversation state before retrying.",
      metadata: { retryable: false, requestMayHaveBeenBilled: true },
    });
    expect(JSON.stringify(events)).not.toContain("provider-secret");
  });

  it("does not emit an assistant answer after cancellation", async () => {
    let resolveTurn: ((value: typeof answer) => void) | undefined;
    let receivedSignal: AbortSignal | undefined;
    const executeTurn = vi.fn((...args: [unknown, AbortSignal]) => new Promise<typeof answer>((resolve) => {
      receivedSignal = args[1];
      resolveTurn = resolve;
    }));
    const events: unknown[] = [];
    const subscription = new LatticeCopilotAgent(executeTurn).run(input).subscribe((event) => {
      events.push(event);
    });
    subscription.unsubscribe();
    resolveTurn?.(answer);
    await Promise.resolve();

    expect(receivedSignal?.aborted).toBe(true);
    expect(events.map((event) => (event as { type: string }).type)).toEqual([EventType.RUN_STARTED]);
    const assistantEvents = new Set<string>([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
    ]);
    expect(events.some((event) => assistantEvents.has((event as { type: string }).type))).toBe(false);
  });
});
