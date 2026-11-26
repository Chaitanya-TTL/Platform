import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  load: vi.fn(),
  project: vi.fn(),
}));

vi.mock("@/features/lattice-next/plm-brain/universal/impact-evidence-authorization", () => ({
  ImpactEvidenceAuthorizationError: class extends Error {
    constructor(readonly status: 401 | 403, message: string) {
      super(message);
    }
  },
  authorizeImpactEvidenceRequest: mocks.authorize,
  loadImpactEvidenceAuthorizationConfiguration: () => ({}),
}));
vi.mock("@/features/lattice-next/kernel/server/server-kernel-runtime", () => ({
  serverKernel: { load: mocks.load },
}));
vi.mock("@/features/lattice-next/kernel/application/source-evidence-projection", () => ({
  projectSourceEvidence: mocks.project,
}));

import { ImpactEvidenceAuthorizationError } from "@/features/lattice-next/plm-brain/universal/impact-evidence-authorization";
import { POST } from "./route";

const authorization = {
  tenantId: "tenant-1",
  subjectId: "user-1",
  decisionId: "decision-1",
  requestId: "request-1",
  traceId: "a".repeat(32),
};
const snapshot = {
  identity: { investigationId: "investigation-1", revision: 5 },
};
const projection = {
  schemaVersion: "1.0",
  investigationId: "investigation-1",
  snapshotRevision: 5,
  snapshotLifecycle: "ready",
  snapshotCompleteness: "complete",
  records: [{ recordId: "record-1", sourceApplication: "sap" }],
  diagnostics: { projectedRecordCount: 1 },
};
const context = { params: Promise.resolve({ investigationId: "investigation-1" }) };

function request(body: unknown): Request {
  return new Request("https://lattice.example/internal/source-evidence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("internal source-evidence route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(authorization);
    mocks.load.mockResolvedValue(snapshot);
    mocks.project.mockReturnValue(projection);
  });

  it("authorizes before loading and returns every projected record with request binding", async () => {
    const response = await POST(request({
      sourceApplications: [],
      relevantEntityIds: [],
      exactIdentifiers: [],
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.any(Request),
      "investigation-1",
      "investigation:read-impact-evidence",
      expect.anything(),
    );
    expect(mocks.authorize.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.load.mock.invocationCallOrder[0]);
    expect(mocks.project).toHaveBeenCalledWith(snapshot);
    await expect(response.json()).resolves.toMatchObject({
      investigationId: "investigation-1",
      snapshotRevision: 5,
      snapshotLifecycle: "ready",
      snapshotCompleteness: "complete",
      authorizationDecisionId: "decision-1",
      requestId: "request-1",
      traceId: "a".repeat(32),
      records: projection.records,
    });
  });

  it("does not load the investigation when the Lattice decision is denied", async () => {
    mocks.authorize.mockRejectedValue(
      new ImpactEvidenceAuthorizationError(403, "denied"),
    );

    const response = await POST(request({
      sourceApplications: [],
      relevantEntityIds: [],
      exactIdentifiers: [],
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.project).not.toHaveBeenCalled();
  });

  it("rejects malformed source-evidence filters", async () => {
    const response = await POST(request({ sourceApplications: "sap" }), context);

    expect(response.status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.project).not.toHaveBeenCalled();
  });
});
