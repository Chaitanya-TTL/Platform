import { NextResponse } from "next/server";
import {
  ImpactEvidenceAuthorizationError,
  authorizeImpactEvidenceRequest,
  loadImpactEvidenceAuthorizationConfiguration,
} from "@/features/lattice-next/plm-brain/universal/impact-evidence-authorization";
import { projectSourceEvidence } from "@/features/lattice-next/kernel/application/source-evidence-projection";
import { asInvestigationId } from "@/features/lattice-next/kernel/contracts/investigation-identity";
import { serverKernel } from "@/features/lattice-next/kernel/server/server-kernel-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ investigationId: string }> };

interface SourceEvidenceFilters {
  sourceApplications: readonly string[];
  relevantEntityIds: readonly string[];
  exactIdentifiers: readonly string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSourceEvidenceFilters(value: unknown): value is SourceEvidenceFilters {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return isStringArray(body.sourceApplications) &&
    isStringArray(body.relevantEntityIds) &&
    isStringArray(body.exactIdentifiers);
}

function matchesFilters(
  record: ReturnType<typeof projectSourceEvidence>["records"][number],
  filters: SourceEvidenceFilters,
): boolean {
  return (filters.sourceApplications.length === 0 ||
      filters.sourceApplications.some((application) =>
        application.toLocaleLowerCase("en-US") === record.sourceApplication.toLocaleLowerCase("en-US"),
      )) &&
    (filters.relevantEntityIds.length === 0 ||
      filters.relevantEntityIds.some((entityId) => record.canonicalEntityIds.includes(entityId))) &&
    (filters.exactIdentifiers.length === 0 ||
      filters.exactIdentifiers.some((identifier) =>
        record.sourceRecordId === identifier ||
        record.canonicalEntityIds.includes(identifier) ||
        record.searchableText.includes(identifier),
      ));
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
    if (!isSourceEvidenceFilters(body)) {
      return NextResponse.json({ message: "A source-evidence query with string-array filters is required." }, { status: 400 });
    }

    const snapshot = await serverKernel.load(asInvestigationId(investigationId));
    if (!snapshot) {
      return NextResponse.json({ message: "Investigation was not found." }, { status: 404 });
    }
    if (String(snapshot.identity.investigationId) !== investigationId) {
      return NextResponse.json({ message: "The snapshot belongs to another investigation." }, { status: 409 });
    }

    const projection = projectSourceEvidence(snapshot);
    const records = projection.records.filter((record) => matchesFilters(record, body));
    return NextResponse.json({
      contractVersion: "1.0",
      investigationId,
      snapshotRevision: projection.snapshotRevision,
      snapshotLifecycle: projection.snapshotLifecycle,
      snapshotCompleteness: projection.snapshotCompleteness,
      sourceVersion: String(projection.snapshotRevision),
      authorizationDecisionId: authorization.decisionId,
      requestId: authorization.requestId,
      traceId: authorization.traceId,
      records,
      diagnostics: {
        ...projection.diagnostics,
        returnedRecordCount: records.length,
      },
    });
  } catch (error) {
    if (error instanceof ImpactEvidenceAuthorizationError) {
      return NextResponse.json({ message: "The service request is not authorized." }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "The request body is invalid." }, { status: 400 });
    }
    console.error("The protected source-evidence service failed.", error);
    return NextResponse.json({ message: "The protected source-evidence service is unavailable." }, { status: 503 });
  }
}
