import { NextResponse } from "next/server";
import {
  ImpactEvidenceAuthorizationError,
  authorizeImpactEvidenceRequest,
  loadImpactEvidenceAuthorizationConfiguration,
} from "@/features/lattice-next/plm-brain/universal/impact-evidence-authorization";
import {
  createFactualEvidenceService,
  FactualEvidenceServiceError,
  type FactEvidencePlanV1,
} from "@/features/lattice-next/copilot/factual-retrieval/factual-evidence-service";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ investigationId: string }> };

const service = createFactualEvidenceService((id) => serverKernel.load(id));

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFactEvidencePlan(value: unknown): value is FactEvidencePlanV1 {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<FactEvidencePlanV1>;
  return plan.requested === true &&
    isStringArray(plan.linkedEntityIds) &&
    isStringArray(plan.sourceApplications) &&
    isStringArray(plan.fieldIds) &&
    isStringArray(plan.exactIdentifiers) &&
    typeof plan.reasonCode === "string";
}

function isBoundFactEvidenceRequest(value: unknown): value is {
  plan: FactEvidencePlanV1;
  sourceVersion: string;
  ontologyVersion: string;
} {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return isFactEvidencePlan(body.plan) &&
    typeof body.sourceVersion === "string" &&
    typeof body.ontologyVersion === "string";
}

export async function POST(request: Request, context: Context) {
  try {
    const { investigationId } = await context.params;
    const authorization = await authorizeImpactEvidenceRequest(
      request,
      investigationId,
      "investigation:read-impact-evidence",
      { configuration: loadImpactEvidenceAuthorizationConfiguration() },
    );
    const body: unknown = await request.json();
    if (!isBoundFactEvidenceRequest(body)) {
      return NextResponse.json({ message: "A bound fact-evidence query is required." }, { status: 400 });
    }

    return NextResponse.json(await service.retrieveFacts(
      investigationId,
      body.plan,
      { sourceVersion: body.sourceVersion, ontologyVersion: body.ontologyVersion },
      authorization,
    ));
  } catch (error) {
    if (error instanceof ImpactEvidenceAuthorizationError) {
      return NextResponse.json({ message: "The service request is not authorized." }, { status: error.status });
    }
    if (error instanceof FactualEvidenceServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "The request body is invalid." }, { status: 400 });
    }
    console.error("The protected fact-evidence service failed.", error);
    return NextResponse.json({ message: "The protected fact-evidence service is unavailable." }, { status: 503 });
  }
}
