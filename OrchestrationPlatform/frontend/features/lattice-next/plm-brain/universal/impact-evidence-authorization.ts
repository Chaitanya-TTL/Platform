import "server-only";

import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

export type ImpactEvidenceGrant =
  | "investigation:resolve-entity"
  | "investigation:read-impact-evidence";

export interface ImpactEvidenceAuthorization {
  tenantId: string;
  subjectId: string;
  decisionId: string;
  requestId: string;
  traceId: string;
}

export interface DecisionRevocationChecker {
  isRevoked(input: {
    tokenId: string;
    decisionId: string;
    investigationId: string;
  }): Promise<boolean>;
}

export interface ImpactEvidenceAuthorizationConfiguration {
  localDevelopmentMode?: boolean;
  serviceIssuer: string;
  serviceAudience: string;
  serviceJwksUrl: string;
  requiredServiceRole: string;
  decisionIssuer: string;
  decisionAudience: string;
  trustedDecisionJwks: JsonWebKeySet;
  maximumTicketLifetimeSeconds: number;
  requireRevocationCheck?: boolean;
}

export interface JsonWebKeySet {
  keys: JsonWebKey[];
}

export interface ImpactEvidenceAuthorizationDependencies {
  configuration: ImpactEvidenceAuthorizationConfiguration;
  revocationChecker?: DecisionRevocationChecker;
  now?: () => number;
  serviceJwks?: JWTVerifyGetKey;
  decisionJwks?: JWTVerifyGetKey;
}

export class ImpactEvidenceAuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "ImpactEvidenceAuthorizationError";
  }
}

export async function authorizeImpactEvidenceRequest(
  request: Request,
  investigationId: string,
  requiredGrant: ImpactEvidenceGrant,
  dependencies: ImpactEvidenceAuthorizationDependencies,
): Promise<ImpactEvidenceAuthorization> {
  const { configuration } = dependencies;
  const authorizationHeader = request.headers.get("authorization");
  const serviceToken = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!serviceToken) {
    throw new ImpactEvidenceAuthorizationError(401, "Service identity is required.");
  }

  const decisionToken = request.headers.get("x-lattice-authorization-decision");
  const requestId = request.headers.get("x-lattice-request-id");
  const traceParent = request.headers.get("traceparent");
  const traceId = traceParent?.match(/^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i)?.[1];
  if (!decisionToken || !requestId || !traceId || /^0+$/.test(traceId)) {
    throw new ImpactEvidenceAuthorizationError(403, "An authorization decision is required.");
  }

  if (configuration.localDevelopmentMode) {
    if (serviceToken !== "lattice-local-development") {
      throw new ImpactEvidenceAuthorizationError(401, "Service identity is invalid.");
    }
    if (decisionToken !== "lattice-local-development") {
      throw new ImpactEvidenceAuthorizationError(403, "Authorization decision is invalid.");
    }
    return {
      tenantId: "local-development",
      subjectId: "local-development",
      decisionId: "local-development",
      requestId,
      traceId,
    };
  }

  let serviceClaims: JWTPayload;
  try {
    const keySet = dependencies.serviceJwks ?? createRemoteJWKSet(new URL(configuration.serviceJwksUrl));
    const result = await jwtVerify(serviceToken, keySet, {
      issuer: configuration.serviceIssuer,
      audience: configuration.serviceAudience,
      algorithms: ["RS256"],
      clockTolerance: 0,
    });
    serviceClaims = result.payload;
  } catch {
    throw new ImpactEvidenceAuthorizationError(401, "Service identity is invalid.");
  }

  const serviceRoles = Array.isArray(serviceClaims.roles) ? serviceClaims.roles : [];
  const serviceScopes = typeof serviceClaims.scp === "string" ? serviceClaims.scp.split(/\s+/) : [];
  if (!serviceRoles.includes(configuration.requiredServiceRole) &&
      !serviceScopes.includes(configuration.requiredServiceRole)) {
    throw new ImpactEvidenceAuthorizationError(403, "Service identity is not authorized.");
  }

  let ticket: JWTPayload;
  try {
    const keySet = dependencies.decisionJwks ??
      createLocalJWKSet(configuration.trustedDecisionJwks as Parameters<typeof createLocalJWKSet>[0]);
    const result = await jwtVerify(decisionToken, keySet, {
      issuer: configuration.decisionIssuer,
      audience: configuration.decisionAudience,
      algorithms: ["RS256"],
      clockTolerance: 0,
    });
    ticket = result.payload;
  } catch {
    throw new ImpactEvidenceAuthorizationError(403, "Authorization decision is invalid.");
  }

  const nowSeconds = (dependencies.now?.() ?? Date.now()) / 1000;
  const grants = Array.isArray(ticket.grants) ? ticket.grants : [];
  const issuedAt = ticket.iat;
  const expiresAt = ticket.exp;
  if (
    typeof ticket.tid !== "string" ||
    !ticket.tid ||
    typeof ticket.sub !== "string" ||
    !ticket.sub ||
    typeof ticket.investigation_id !== "string" ||
    typeof ticket.operation !== "string" ||
    typeof ticket.policy_version !== "string" ||
    typeof ticket.decision_id !== "string" ||
    typeof ticket.jti !== "string" ||
    typeof issuedAt !== "number" ||
    typeof expiresAt !== "number" ||
    issuedAt > nowSeconds ||
    nowSeconds >= expiresAt ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > configuration.maximumTicketLifetimeSeconds ||
    ticket.investigation_id !== investigationId ||
    ticket.operation !== "engineering-impact-answer" ||
    ticket.request_id !== requestId ||
    !grants.includes(requiredGrant)
  ) {
    throw new ImpactEvidenceAuthorizationError(403, "Authorization decision does not permit this operation.");
  }

  if (configuration.requireRevocationCheck && !dependencies.revocationChecker) {
    throw new ImpactEvidenceAuthorizationError(403, "Authorization revocation status is unavailable.");
  }
  if (dependencies.revocationChecker) {
    try {
      const revoked = await dependencies.revocationChecker.isRevoked({
        tokenId: ticket.jti,
        decisionId: ticket.decision_id,
        investigationId,
      });
      if (revoked) {
        throw new ImpactEvidenceAuthorizationError(403, "Authorization decision has been revoked.");
      }
    } catch (error) {
      if (error instanceof ImpactEvidenceAuthorizationError) throw error;
      throw new ImpactEvidenceAuthorizationError(403, "Authorization revocation status is unavailable.");
    }
  }

  return {
    tenantId: ticket.tid,
    subjectId: ticket.sub,
    decisionId: ticket.decision_id,
    requestId,
    traceId,
  };
}

export function loadImpactEvidenceAuthorizationConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ImpactEvidenceAuthorizationConfiguration {
  if (environment.NODE_ENV === "development") {
    return {
      localDevelopmentMode: true,
      serviceIssuer: "local-development",
      serviceAudience: "local-development",
      serviceJwksUrl: "http://localhost",
      requiredServiceRole: "local-development",
      decisionIssuer: "local-development",
      decisionAudience: "local-development",
      trustedDecisionJwks: { keys: [] },
      maximumTicketLifetimeSeconds: 60,
    };
  }

  const required = (name: string) => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`Missing protected PLM service configuration: ${name}`);
    return value;
  };
  let trustedDecisionJwks: JsonWebKeySet;
  try {
    trustedDecisionJwks = JSON.parse(required("LATTICE_DECISION_TRUSTED_JWKS")) as JsonWebKeySet;
    if (!Array.isArray(trustedDecisionJwks.keys) || trustedDecisionJwks.keys.length === 0) {
      throw new Error("Trusted signing key set is empty.");
    }
  } catch {
    throw new Error("The trusted PLM decision signing keys are missing or invalid.");
  }

  const maximumTicketLifetimeSeconds = Number(environment.LATTICE_DECISION_MAX_LIFETIME_SECONDS ?? "60");
  if (!Number.isInteger(maximumTicketLifetimeSeconds) ||
      maximumTicketLifetimeSeconds < 1 ||
      maximumTicketLifetimeSeconds > 60) {
    throw new Error("The PLM decision ticket maximum lifetime must be between 1 and 60 seconds.");
  }

  return {
    serviceIssuer: required("LATTICE_PLM_SERVICE_ISSUER"),
    serviceAudience: required("LATTICE_PLM_SERVICE_AUDIENCE"),
    serviceJwksUrl: required("LATTICE_PLM_SERVICE_JWKS_URL"),
    requiredServiceRole: required("LATTICE_PLM_SERVICE_ROLE"),
    decisionIssuer: required("LATTICE_DECISION_ISSUER"),
    decisionAudience: required("LATTICE_DECISION_AUDIENCE"),
    trustedDecisionJwks,
    maximumTicketLifetimeSeconds,
    requireRevocationCheck: environment.LATTICE_DECISION_REVOCATION_CHECK_REQUIRED === "true",
  };
}
