import { NextResponse } from "next/server";
import type { InvestigationId } from "../../../../../../features/lattice-next/kernel/contracts/investigation-identity";
import { toInvestigationListItem } from "../../../../../../features/lattice-next/kernel/application/investigation-list-item";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ investigationId: string }> };
type RefreshRequest = { expectedRevision?: unknown };

export async function POST(request: Request, context: Context) {
  const { investigationId } = await context.params;
  let body: RefreshRequest;
  try {
    body = await request.json() as RefreshRequest;
  } catch {
    return NextResponse.json({ message: "A valid JSON refresh request is required." }, { status: 400 });
  }

  if (!body || Object.keys(body).some((key) => key !== "expectedRevision") ||
      !Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) {
    return NextResponse.json({ message: "Refresh accepts only a positive expectedRevision." }, { status: 400 });
  }

  const id = investigationId as InvestigationId;
  const snapshot = await serverKernel.load(id);
  if (!snapshot) return NextResponse.json({ message: "Investigation was not found." }, { status: 404 });
  if (snapshot.archivedAt) return NextResponse.json({ message: "Restore the investigation before refreshing it." }, { status: 409 });
  if (snapshot.identity.revision !== body.expectedRevision)
    return NextResponse.json({ message: "The investigation changed before refresh could start.", revision: snapshot.identity.revision }, { status: 409 });

  try {
    const refreshed = await serverKernel.dispatch({
      type: "refresh",
      investigationId: id,
      expectedRevision: body.expectedRevision,
      occurredAt: new Date().toISOString(),
    });
    return NextResponse.json({
      snapshot: refreshed,
      previousRevision: snapshot.identity.revision,
      revision: refreshed.identity.revision,
      lifecycle: refreshed.lifecycle,
      sourceStatuses: toInvestigationListItem(refreshed).sourceStatuses,
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Refresh could not be started." }, { status: 409 });
  }
}