import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import {
  authorizeImpactEvidenceRequest,
  loadImpactEvidenceAuthorizationConfiguration,
  type ImpactEvidenceAuthorizationConfiguration,
} from "../plm-brain/universal/impact-evidence-authorization";

vi.mock("server-only", () => ({}));

const now = Math.floor(Date.now() / 1000);
const serviceIssuer = "https://identity.example.test/service";
const serviceAudience = "api://plm-service";
const decisionIssuer = "https://runtime.example.test";
const decisionAudience = "lattice-plm";
const investigationId = "investigation-1";
const requestId = "request-1";

async function setup() {
  const serviceKeys = await generateKeyPair("RS256");
  const decisionKeys = await generateKeyPair("RS256");
  const serviceJwk = await exportJWK(serviceKeys.publicKey);
  const decisionJwk = await exportJWK(decisionKeys.publicKey);
  serviceJwk.kid = "service-key";
  decisionJwk.kid = "decision-key";
  const configuration: ImpactEvidenceAuthorizationConfiguration = {
    serviceIssuer,
    serviceAudience,
    serviceJwksUrl: "https://identity.example.test/keys",
    requiredServiceRole: "lattice.plm.read",
    decisionIssuer,
    decisionAudience,
    trustedDecisionJwks: { keys: [decisionJwk] },
    maximumTicketLifetimeSeconds: 60,
  };
  const serviceToken = await new SignJWT({ roles: ["lattice.plm.read"] })
    .setProtectedHeader({ alg: "RS256", kid: "service-key" })
    .setIssuer(serviceIssuer)
    .setAudience(serviceAudience)
    .setIssuedAt()
    .setExpirationTime(now + 600)
    .sign(serviceKeys.privateKey);

  async function ticket(
    overrides: Record<string, unknown> = {},
    ticketIssuer = decisionIssuer,
    ticketAudience = decisionAudience,
  ) {
    const claims = {
      tid: "tenant-1",
      sub: "subject-1",
      investigation_id: investigationId,
      operation: "engineering-impact-answer",
      grants: ["investigation:resolve-entity", "investigation:read-impact-evidence"],
      policy_version: "policy-v1",
      decision_id: "decision-1",
      request_id: requestId,
      ...overrides,
    };
    const builder = new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "decision-key" })
      .setIssuer(ticketIssuer)
      .setAudience(ticketAudience)
      .setIssuedAt(now)
      .setJti("token-1");
    return builder.setExpirationTime(now + 30).sign(decisionKeys.privateKey);
  }

  function request(ticketValue: string, serviceValue = serviceToken) {
    return new Request("https://plm.example.test/api/internal", {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceValue}`,
        "x-lattice-authorization-decision": ticketValue,
        "x-lattice-request-id": requestId,
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      },
    });
  }

  const dependencies = {
    configuration,
    serviceJwks: createLocalJWKSet({ keys: [serviceJwk] }),
    decisionJwks: createLocalJWKSet(configuration.trustedDecisionJwks as Parameters<typeof createLocalJWKSet>[0]),
    now: () => now * 1000,
  };

  return { configuration, dependencies, ticket, request, decisionKeys };
}

describe("PLM internal service authorization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed, scoped decision and returns only sanitized metadata", async () => {
    const test = await setup();
    const decisionTicket = await test.ticket();

    const result = await authorizeImpactEvidenceRequest(
      test.request(decisionTicket),
      investigationId,
      "investigation:read-impact-evidence",
      test.dependencies,
    );

    expect(result).toEqual({
      tenantId: "tenant-1",
      subjectId: "subject-1",
      decisionId: "decision-1",
      requestId,
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    });
    expect(JSON.stringify(result)).not.toContain(decisionTicket);
  });

  it("rejects an invalid workload JWT before accepting the decision ticket", async () => {
    const test = await setup();
    const decisionTicket = await test.ticket();
    await expect(authorizeImpactEvidenceRequest(
      test.request(decisionTicket, "not-a-jwt"),
      investigationId,
      "investigation:read-impact-evidence",
      test.dependencies,
    )).rejects.toMatchObject({ status: 401 });
  });

  it.each([
    ["wrong investigation", { investigation_id: "investigation-2" }],
    ["wrong operation", { operation: "other-operation" }],
    ["wrong request", { request_id: "request-2" }],
    ["missing required grant", { grants: ["investigation:resolve-entity"] }],
  ])("rejects a decision with %s", async (_label, claims) => {
    const test = await setup();
    const decisionTicket = await test.ticket(claims);
    await expect(authorizeImpactEvidenceRequest(
      test.request(decisionTicket),
      investigationId,
      "investigation:read-impact-evidence",
      test.dependencies,
    )).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a wrong-audience ticket and an invalid ticket signature", async () => {
    const test = await setup();
    const wrongAudience = await test.ticket({}, decisionIssuer, "api://other-service");
    const validTicket = await test.ticket();
    const invalidSignatureParts = validTicket.split(".");
    invalidSignatureParts[2] = `${invalidSignatureParts[2][0] === "A" ? "B" : "A"}${invalidSignatureParts[2].slice(1)}`;
    const invalidSignature = invalidSignatureParts.join(".");

    await expect(authorizeImpactEvidenceRequest(
      test.request(wrongAudience),
      investigationId,
      "investigation:read-impact-evidence",
      test.dependencies,
    )).rejects.toMatchObject({ status: 403 });
    await expect(authorizeImpactEvidenceRequest(
      test.request(invalidSignature),
      investigationId,
      "investigation:read-impact-evidence",
      test.dependencies,
    )).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an expired decision with strict expiry comparison", async () => {
    const test = await setup();
    const ticketValue = await new SignJWT({
      tid: "tenant-1",
      sub: "subject-1",
      investigation_id: investigationId,
      operation: "engineering-impact-answer",
      grants: ["investigation:read-impact-evidence"],
      policy_version: "policy-v1",
      decision_id: "decision-1",
      request_id: requestId,
    })
      .setProtectedHeader({ alg: "RS256", kid: "decision-key" })
      .setIssuer(decisionIssuer)
      .setAudience(decisionAudience)
      .setIssuedAt(now - 30)
      .setExpirationTime(now + 10)
      .setJti("token-expiring")
      .sign(test.decisionKeys.privateKey);
    const atExpiration = {
      ...test.dependencies,
      now: () => (now + 10) * 1000,
    };

    await expect(authorizeImpactEvidenceRequest(
      test.request(ticketValue),
      investigationId,
      "investigation:read-impact-evidence",
      atExpiration,
    )).rejects.toMatchObject({ status: 403 });
  });

  it("fails closed when a configured revocation checker is absent or unavailable", async () => {
    const test = await setup();
    const ticketValue = await test.ticket();
    const required = {
      ...test.dependencies,
      configuration: { ...test.configuration, requireRevocationCheck: true },
    };
    await expect(authorizeImpactEvidenceRequest(
      test.request(ticketValue),
      investigationId,
      "investigation:read-impact-evidence",
      required,
    )).rejects.toMatchObject({ status: 403 });

    const revoked = {
      ...required,
      revocationChecker: { isRevoked: async () => true },
    };
    await expect(authorizeImpactEvidenceRequest(
      test.request(ticketValue),
      investigationId,
      "investigation:read-impact-evidence",
      revoked,
    )).rejects.toMatchObject({ status: 403 });

    const failing = {
      ...required,
      revocationChecker: { isRevoked: async () => { throw new Error("offline"); } },
    };
    await expect(authorizeImpactEvidenceRequest(
      test.request(ticketValue),
      investigationId,
      "investigation:read-impact-evidence",
      failing,
    )).rejects.toMatchObject({ status: 403 });
  });

  it("rejects missing deployment trust configuration", () => {
    expect(() => loadImpactEvidenceAuthorizationConfiguration({} as NodeJS.ProcessEnv)).toThrow();
  });

  it("accepts the local development runtime identity without production signing configuration", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const configuration = loadImpactEvidenceAuthorizationConfiguration({
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    const localRequest = new Request("http://localhost/api/internal", {
      method: "POST",
      headers: {
        authorization: "Bearer lattice-local-development",
        "x-lattice-authorization-decision": "lattice-local-development",
        "x-lattice-request-id": requestId,
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      },
    });

    await expect(authorizeImpactEvidenceRequest(
      localRequest,
      investigationId,
      "investigation:read-impact-evidence",
      { configuration },
    )).resolves.toEqual({
      tenantId: "local-development",
      subjectId: "local-development",
      decisionId: "local-development",
      requestId,
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    });
  });
});
