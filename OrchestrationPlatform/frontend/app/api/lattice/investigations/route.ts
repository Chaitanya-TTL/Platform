import { NextResponse } from "next/server";
import type { SourceSelection } from "@/features/lattice-next/kernel/contracts/source-operation";
import { serverClock, serverIds, serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const includeArchivedValue = parameters.get("includeArchived");
  if (includeArchivedValue !== null && includeArchivedValue !== "true" && includeArchivedValue !== "false")
    return NextResponse.json({ message: "includeArchived must be true or false." }, { status: 400 });

  const limitValue = parameters.get("limit");
  if (limitValue !== null && !/^\d+$/.test(limitValue))
    return NextResponse.json({ message: "limit must be a positive integer." }, { status: 400 });
  const requestedLimit = limitValue === null ? 20 : Number(limitValue);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 100;

  try {
    const items = await serverKernel.list({ includeArchived: includeArchivedValue === "true", limit });
    return NextResponse.json(items);
  } catch {
    return NextResponse.json({ message: "Investigations could not be listed." }, { status: 500 });
  }
}

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
