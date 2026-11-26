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

function logInvestigationEvidenceDiagnostic(event: string, details: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "development") {
    console.info(`[lattice.investigation-evidence.${event}]`, details);
  }
}

export async function POST(request: Request, context: Context) {
  const requestId = request.headers.get("x-lattice-request-id");
  let investigationId: string | undefined;

  try {
    investigationId = (await context.params).investigationId;
    const requestPayload = await request.clone().text();
    logInvestigationEvidenceDiagnostic("request", {
      requestId,
      traceParent: request.headers.get("traceparent"),
      investigationId,
      requestPayload,
    });
    const authorization = await authorizeImpactEvidenceRequest(
      request,
      investigationId,
      "investigation:read-impact-evidence",
      { configuration: loadImpactEvidenceAuthorizationConfiguration() },
    );

    const body = {
      contractVersion: "1.0",
      evidence: await service.retrieveInvestigationEvidence(investigationId, authorization),
    };
    logInvestigationEvidenceDiagnostic("response", {
      requestId,
      investigationId,
      status: 200,
      relationshipCount: body.evidence.relationships.length,
      pathCount: body.evidence.paths.length,
      chainCount: body.evidence.chains.length,
      sourceCount: body.evidence.sources.length,
    });
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ImpactEvidenceAuthorizationError) {
      const body = { message: "The service request is not authorized." };
      logInvestigationEvidenceDiagnostic("response", {
        requestId,
        status: error.status,
        responseBody: body,
      });
      return NextResponse.json(body, { status: error.status });
    }
    if (error instanceof ImpactEvidenceServiceError) {
      const body = { message: error.message };
      logInvestigationEvidenceDiagnostic("response", {
        requestId,
        investigationId,
        status: error.status,
        responseBody: body,
      });
      return NextResponse.json(body, { status: error.status });
    }
    const body = { message: "The protected PLM service is unavailable." };
    logInvestigationEvidenceDiagnostic("response", {
      requestId,
      status: 503,
      error: error instanceof Error ? error.message : "unknown-error",
      responseBody: body,
    });
    return NextResponse.json(body, { status: 503 });
  }
}
