import { CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { CopilotKitConversationRunner } from "@/features/lattice-next/copilot/copilotkit-agent-runner";
import { CopilotKitAgentError, LatticeCopilotAgent } from "@/features/lattice-next/copilot/copilotkit-agent";
import { executeCopilotTurn } from "@/features/lattice-next/copilot/execute-copilot-turn";

export const dynamic = "force-dynamic";

const agent = new LatticeCopilotAgent(async (input, signal) => {
  const outcome = await executeCopilotTurn({ ...input, createIfMissing: true, signal });
  if (!outcome.ok) {
    const validationIssue = typeof outcome.body.validationIssue === "string" ? outcome.body.validationIssue : undefined;
    const billingWarning = outcome.body.requestMayHaveBeenBilled === true
      ? " The request may have been billed; check the usage ledger before retrying."
      : "";
    const message = `${String(outcome.body.message ?? "Copilot could not complete the request.")}${validationIssue ? ` Detail: ${validationIssue}` : ""}${billingWarning}`;
    const code = typeof outcome.body.failureCode === "string" ? outcome.body.failureCode : `http-${outcome.status}`;
    throw new CopilotKitAgentError(
      message,
      code,
      outcome.body.retryable === true,
      outcome.body.requestMayHaveBeenBilled === true,
      validationIssue,
    );
  }
  return outcome.answer;
});

const runtime = new CopilotRuntime({
  agents: { default: agent },
  runner: new CopilotKitConversationRunner(),
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/lattice/copilotkit",
  mode: "multi-route",
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
