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
      "investigation:read-impact-evidence",
      { configuration: loadImpactEvidenceAuthorizationConfiguration() },
    );

    return NextResponse.json({
      contractVersion: "1.0",
      evidence: await service.retrieveInvestigationEvidence(investigationId, authorization),
    });
  } catch (error) {
    if (error instanceof ImpactEvidenceAuthorizationError) {
      return NextResponse.json({ message: "The service request is not authorized." }, { status: error.status });
    }
    if (error instanceof ImpactEvidenceServiceError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "The protected PLM service is unavailable." }, { status: 503 });
  }
}
