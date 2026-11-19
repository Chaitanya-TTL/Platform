# Authorization provider readiness and rollout gate

## Current status

No platform-approved production `IResourceAuthorizationDecisionProvider` is configured. The API therefore retains its default `UnavailableResourceAuthorizationDecisionProvider`; `/health/ready` reports `503` until a real provider is registered. The impact-answer API remains non-operational for client data and must not be enabled for production use until the prerequisites below are supplied and verified.

The readiness route is unauthenticated and reports configuration only. It checks whether the registered provider is the explicit unavailable default; it does not call, ping, or assert the health of a configured policy provider. A `200` response does not waive the rollout gate or prove that authentication, policy evaluation, ticket signing, PLM service verification, or network controls work end to end.

Responses contain no identity, policy, credential, or provider details:

```json
{"status":"not-ready","code":"AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED"}
```

with HTTP `503` when the unavailable default is registered, or:

```json
{"status":"ready"}
```

with HTTP `200` when another authorization provider is registered.

## Required authorization integration contract

The platform-supplied provider must implement `IResourceAuthorizationDecisionProvider` and:

1. Accept only the validated API `ClaimsPrincipal`; derive tenant and subject identifiers from configured, validated claims on the server. Never trust request-body identity, tenant, grants, or policy fields.
2. Evaluate access to the exact active investigation in the request. Do not search across or infer access to other investigations.
3. Return only these Phase 1 grants when approved:
   - `investigation:resolve-entity`
   - `investigation:read-impact-evidence`
4. Include the policy version, a unique decision ID, and an absolute expiry with the decision. Expired decisions are not usable.
5. Distinguish a policy denial from an unavailable or unconfigured decision service. Denials remain forbidden; missing decisions, provider failures, and configuration failures remain unavailable. Every ambiguous or unavailable case fails closed: no PLM retrieval or model generation may proceed.
6. Preserve the existing asymmetric, signed, short-lived authorization ticket for PLM service calls. The ticket remains bound to the validated tenant/subject, investigation, audience, operation, grants, policy version, decision ID, request, and expiry; its lifetime is capped at 60 seconds and at the underlying decision expiry. Do not replace it with unsigned identity headers or a shared static secret.

## Rollout prerequisites and owners

| Prerequisite | Owner to supply or approve | Exit evidence |
| --- | --- | --- |
| Production policy decision provider and investigation-level access rules, including denial versus unavailable behavior and the two grants above | Platform authorization/policy owner | Provider registration, documented decision semantics, and tests for allow, deny, missing configuration, and provider outage |
| OIDC issuer, audience, validated tenant/subject claim mapping, and required application role | Identity/Entra owner | Deployment configuration and tests proving invalid or missing identity is rejected |
| Authorization-ticket issuer/audience, asymmetric signing key, Key Vault access, public-key distribution, rotation, and expiry settings | Security and key-management owner | Approved key lifecycle and successful signing/verification, expiry, and key-rotation checks |
| PLM service caller identity, expected audience/role, and independent ticket verification | API and PLM service owners | End-to-end service-identity and ticket-validation tests for wrong audience/resource, missing grants, and expired tickets |
| Revocation-check source and failure policy, if enabled by the deployment | Authorization/security owner | Configured checker and tests proving revoked or uncheckable decisions fail closed |
| Private ingress and network restrictions for internal PLM operations | Network/platform operations owner | Deployment evidence that only approved service callers can reach internal routes |
| Data handling, region, and model deployment approval before any client data is sent | Product/data-governance and AI platform owners | Recorded approvals for the target environment |
| End-to-end deny-path and operational monitoring acceptance | Service owner with security reviewer | Deployment test results and alert/runbook ownership |

## Release gate

Keep the impact-answer API out of client-data production use while any prerequisite is missing. Before enabling it, verify both readiness responses and the full trust boundary: authenticated ingress, server-derived identity and grants, investigation-scoped policy decisions, signed-ticket validation at PLM, private service access, expiry/revocation behavior, and fail-closed denial/unavailability. Re-run these checks after provider, identity, key, policy, or network configuration changes.
