import { NextResponse } from "next/server";
import type { InvestigationId } from "../../../../../../../../features/lattice-next/kernel/contracts/investigation-identity";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";
import { FileCopilotConversationStore } from "@/features/lattice-next/kernel/server/file-copilot-conversation-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ investigationId: string; threadId: string }> };
const store = new FileCopilotConversationStore();

export async function GET(_: Request, context: Context) {
  const { investigationId: rawId, threadId } = await context.params;
  const investigationId = rawId as InvestigationId;
  const snapshot = await serverKernel.load(investigationId);
  if (!snapshot) return NextResponse.json({ message: "Investigation was not found." }, { status: 404 });
  const thread = await store.loadThread(investigationId, threadId);
  return thread
    ? NextResponse.json({ investigationId, thread })
    : NextResponse.json({ message: "Copilot thread was not found." }, { status: 404 });
}
