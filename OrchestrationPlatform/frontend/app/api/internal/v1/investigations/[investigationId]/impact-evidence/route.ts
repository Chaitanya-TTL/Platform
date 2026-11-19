import { NextResponse } from "next/server";
import {
  ImpactEvidenceAuthorizationError,
  authorizeImpactEvidenceRequest,
  loadImpactEvidenceAuthorizationConfiguration,
} from "@/features/lattice-next/plm-brain/universal/impact-evidence-authorization";
import {
  ImpactEvidenceServiceError,
  createImpactEvidenceService,
} from "@/features/lattice-next/plm-brain/universal/impact-evidence-service";
import type { PlmBrainImpactEvidenceRequest } from "@/features/lattice-next/plm-brain/contracts/impact-evidence-service-v1";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ investigationId: string }> };

const service = createImpactEvidenceService((id) => serverKernel.load(id));

export async function POST(request: Request, context: Context) {
  try {
    const { investigationId } = await context.params;
    const authorization = await authorizeImpactEvidenceRequest(
      request,
      investigationId,
      "investigation:read-impact-evidence",
      { configuration: loadImpactEvidenceAuthorizationConfiguration() },
    );
    const body = await request.json() as Partial<PlmBrainImpactEvidenceRequest>;
    if (
      typeof body.subjectEntityId !== "string" ||
      !body.scope ||
      !Array.isArray(body.scope.relationshipTypes) ||
      body.scope.relationshipTypes.some((item) => typeof item !== "string") ||
      !Array.isArray(body.scope.sourceSystems) ||
      body.scope.sourceSystems.some((item) => typeof item !== "string") ||
      !(typeof body.scope.maxHops === "number" &&
        Number.isInteger(body.scope.maxHops) && body.scope.maxHops >= 0 && body.scope.maxHops <= 3) ||
      !(body.scope.asOf === null || typeof body.scope.asOf === "string")
    ) {
      return NextResponse.json({ message: "A valid scoped evidence query is required." }, { status: 400 });
    }

    return NextResponse.json({
      contractVersion: "1.0",
      evidence: await service.retrieveImpactEvidence(
        investigationId,
        body.subjectEntityId,
        body.scope,
        authorization,
      ),
    });
  } catch (error) {
    if (error instanceof ImpactEvidenceAuthorizationError) {
      return NextResponse.json({ message: "The service request is not authorized." }, { status: error.status });
    }
    if (error instanceof ImpactEvidenceServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "The request body is invalid." }, { status: 400 });
    }
    return NextResponse.json({ message: "The protected PLM service is unavailable." }, { status: 503 });
  }
}
