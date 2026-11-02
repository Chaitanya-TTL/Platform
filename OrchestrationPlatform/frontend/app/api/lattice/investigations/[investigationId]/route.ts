import { NextResponse } from "next/server";
import type { InvestigationCommand } from "@/features/lattice-next/kernel/contracts/investigation-command";
import type { InvestigationId } from "@/features/lattice-next/kernel/contracts/investigation-identity";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";
import { isEngineeringIntelligenceInvestigationV1 } from "@/features/lattice-next/contracts/intelligence-v1";
import { loadRelationshipOntology } from "@/features/lattice-next/plm-brain/universal/relationship-ontology-runtime";
import { enrichInvestigationWithOntology } from "@/features/lattice-next/plm-brain/universal/ontology-evaluator";
import { ensureInvestigationKnowledgeGraph } from "@/features/lattice-next/plm-brain/universal/ensure-investigation-knowledge-graph";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ investigationId: string }> };

export async function GET(_: Request, context: Context) {
  const { investigationId } = await context.params;
  const snapshot = await serverKernel.load(investigationId as InvestigationId);
  return snapshot
    ? NextResponse.json(ensureInvestigationKnowledgeGraph(snapshot))
    : NextResponse.json({ message: "Investigation was not found." }, { status: 404 });
}

export async function POST(request: Request, context: Context) {
  try {
    const { investigationId } = await context.params;
    const value = await request.json() as { command?: InvestigationCommand };
    if (!value.command || value.command.type === "create") return NextResponse.json({ message: "A supported investigation command is required." }, { status: 400 });
    const commandId = "identity" in value.command ? value.command.identity.investigationId : "result" in value.command ? value.command.result.identity.investigationId : value.command.investigationId;
    if (String(commandId) !== investigationId) return NextResponse.json({ message: "The command does not belong to this investigation." }, { status: 409 });
    const command = value.command.type === "publish-canonical" && isEngineeringIntelligenceInvestigationV1(value.command.canonical)
      ? {
          ...value.command,
          canonical: enrichInvestigationWithOntology(
            value.command.canonical,
            loadRelationshipOntology(),
            value.command.revision,
          ),
        }
      : value.command;
    return NextResponse.json(await serverKernel.dispatch(command));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "The investigation command could not be completed." }, { status: 409 });
  }
}
