import { NextResponse } from "next/server";
import type { SourceSelection } from "@/features/lattice-next/kernel/contracts/source-operation";
import { serverClock, serverIds, serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";

export const dynamic = "force-dynamic";

type CreateInvestigationRequest = {
  subjectLabel?: unknown;
  query?: unknown;
  selections?: unknown;
};

function isSelection(value: unknown): value is SourceSelection {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.source === "string" && typeof item.nativeId === "string" && typeof item.displayName === "string";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateInvestigationRequest;
    const subjectLabel = typeof body.subjectLabel === "string" ? body.subjectLabel.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const selections = Array.isArray(body.selections) ? body.selections.filter(isSelection) : [];
    if (!subjectLabel) return NextResponse.json({ message: "An investigation subject is required." }, { status: 400 });
    if (!selections.length) return NextResponse.json({ message: "Select at least one source record before starting an investigation." }, { status: 400 });
    const snapshot = await serverKernel.dispatch({
      type: "create",
      investigationId: serverIds.investigationId(),
      subjectLabel,
      query,
      selections,
      occurredAt: serverClock.now(),
    });
    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "The investigation could not be created." }, { status: 409 });
  }
}
