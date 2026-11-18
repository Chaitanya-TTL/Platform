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
      "investigation:resolve-entity",
      { configuration: loadImpactEvidenceAuthorizationConfiguration() },
    );
    const body = await request.json() as { candidateEntityId?: unknown };
    if (typeof body.candidateEntityId !== "string") {
      return NextResponse.json({ message: "A candidate entity ID is required." }, { status: 400 });
    }

    return NextResponse.json(await service.resolveEntity(
      investigationId,
      body.candidateEntityId,
      authorization,
    ));
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
