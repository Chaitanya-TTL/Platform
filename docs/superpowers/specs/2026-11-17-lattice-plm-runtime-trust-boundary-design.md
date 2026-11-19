# Lattice PLM Runtime Trust Boundary Design

## Intent

Define a safe, maintainable boundary between the .NET AI Runtime and the existing PLM Brain producer so the runtime can use proven impact paths and chains without replacing or reimplementing PLM Brain.

The user selected a private authenticated service boundary. PLM Brain remains authoritative; the .NET runtime consumes its evidence and owns context compilation, prompting, model generation, and answer validation.

## Current State

- The proven `InvestigationKnowledgeGraph` contract contains ontology-resolved relationships, impact paths, and impact chains in `OrchestrationPlatform/frontend/features/lattice-next/plm-brain/contracts/relationship-ontology.ts`.
- Ontology enrichment derives those paths/chains in TypeScript. The Next.js investigation GET route currently loads a snapshot and enriches it without authentication or authorization-scope enforcement.
- `serverKernel` uses a file-backed investigation repository. Its snapshots do not establish a stable, secured cross-service contract for .NET consumption.
- The .NET `EngineeringIntelligenceInvestigation` contract does not include the proven impact paths/chains.
- `Orchestration.API/Program.cs` currently has no authentication or authorization middleware or provider registration.
- The shared runtime contracts and project structure exist. `AuthorizationScope` carries tenant, subject, policy version, decision ID, and grants, but the codebase has not selected an identity issuer, claim mapping, or authorization policy source.

## Goals

- Keep the TypeScript PLM Brain producer authoritative for canonical relationships, ontology resolution, impact paths/chains, and their provenance.
- Allow the .NET AI Runtime to request impact evidence through a versioned, private, authenticated service contract.
- Authenticate the end user at the .NET API using OIDC/JWT access-token validation.
- Derive tenant and subject from validated identity and derive grants from a server-side authorization decision; never trust client-supplied scope or grants.
- Enforce authorization before PLM Brain returns protected evidence, and bind the decision to the requested investigation and operation.
- Require the active `InvestigationId` in the Phase 1 answer request; the service does not search across investigations.
- Propagate request/trace correlation and retain source IDs, evidence IDs, provenance, ontology/source version, and deep links.
- Deny by default when identity, authorization policy, service identity, or required provenance is absent.
- Keep Phase 1 bounded to the engineering-impact answer scenario.

## Non-Goals

- Replacing or porting PLM Brain into .NET.
- Reimplementing ontology resolution, relationship selection, or impact-path derivation in the runtime.
- Exposing the current unauthenticated frontend GET route as the .NET runtime's evidence API.
- Selecting a specific identity vendor, authorization product, or production hosting topology; these remain configuration/deployment decisions unless a platform owner supplies them.
- Adding document RAG, vector retrieval, MCP, agent frameworks, or a new persistence platform as part of this boundary.

## Approaches

1. **Private authenticated PLM Brain service boundary — selected.** Keep the TypeScript producer authoritative and add a versioned service-to-service evidence operation consumed by a .NET adapter. The .NET API validates the caller's OIDC token, derives identity and an authorization decision server-side, and calls the private producer using an authenticated workload identity plus an audience-bound, verifiable authorization context (for example, an approved on-behalf-of token or equivalent signed authorization decision). The PLM service independently verifies the service caller and authorization context before returning evidence. This preserves existing intelligence and confines translation to a transport adapter.
2. **Move or port the producer into a .NET-owned service.** This could simplify runtime language boundaries, but it would expand scope and risk duplicating or changing proven PLM Brain behavior. It is not selected.
3. **Read the existing file-backed snapshots directly from .NET.** This avoids a network hop but couples runtimes to an internal storage layout, does not directly provide the derived-on-read impact output, and cannot enforce the requested service authorization boundary. It is rejected.

## Design Decisions

- **API authentication:** The .NET API validates OIDC/JWT access tokens. Issuer, audience, tenant/subject claim names, and key discovery are deployment configuration, not hard-coded assumptions.
- **Authorization:** A server-side authorization provider returns a deny-by-default decision containing tenant, subject, policy version, decision ID, and the precise investigation/resource grants. Client request fields cannot supply or override any of these values.
- **Investigation scope:** `ImpactAnswerRequest` includes the active investigation ID. Missing IDs are rejected or clarified before retrieval; entity resolution is limited to that investigation, and the PLM service does not perform cross-investigation search.
- **Service authorization:** The .NET API obtains one server-side authorization decision per answer request and reuses its verifiable, audience- and resource-bound signed decision for the entity-resolution and evidence operations in that answer request. The decision carries the minimum subject/resource/operation/grant information needed for PLM-side enforcement, has a configurable short TTL defaulting to one minute, and is rejected after expiration. The PLM service supports an explicit revocation-check abstraction where the deployed identity platform supports it; no additional policy re-evaluation round trip is required for each evidence operation. For the Azure-first Phase 1 implementation, sign decisions with an asymmetric Azure Key Vault key and configure the PLM service with the trusted public JWK set; tests use ephemeral signing keys. Do not use unsigned identity headers or a shared static secret as a substitute.
- **PLM service:** The service exposes only the narrow, versioned impact-evidence operation needed by Phase 1. It verifies the caller and authorization context, checks access to the requested investigation, and returns the authoritative PLM Brain relationships, impact paths/chains, provenance, and source version.
- **Runtime adapter:** `PlmBrainEngineeringEvidenceSource` translates the service contract to the shared runtime evidence contracts. It does not derive impacts, widen scope, or silently fall back to the unauthenticated route.
- **Failure behavior:** Missing or invalid end-user identity, authorization decision, service identity, unsupported contract version, expired authorization decision, failed required revocation check, or required evidence provenance fails closed. The runtime does not make an LLM request when evidence retrieval is denied or fails authorization.
- **Observability:** Carry `RuntimeRequestContext` through the .NET API, authorization decision, outbound call, PLM service, and result. Telemetry records IDs and decision metadata but does not log bearer tokens, raw authorization material, or unnecessary engineering content.
- **Rollout gate:** Do not expose the Engineering Impact Answer endpoint to client data until authentication, server-side authorization, service-to-service verification, and deny-path tests are configured for the deployment.

## Acceptance Criteria

- An unauthenticated request is rejected at the .NET API boundary.
- Missing tenant/subject identity, missing policy decision, or denied investigation access results in no PLM retrieval call.
- Missing investigation ID is rejected or clarified, and entity resolution never searches outside the supplied investigation.
- The PLM service rejects unauthenticated service callers and missing, expired, wrong-audience, or resource-mismatched authorization context.
- One server-side decision is obtained per answer request and reused across that request's PLM operations. Authorization-decision TTL is configurable and defaults to one minute; expired decisions are rejected, and an available revocation mechanism is checked according to its configured policy without a separate policy re-evaluation round trip for each evidence operation.
- A successful response preserves the source relationship/path/chain identifiers, evidence IDs, provenance references, and source/ontology version without runtime recomputation.
- The adapter rejects unsupported payload versions and malformed/incomplete provenance rather than returning success-shaped empty evidence.
- The regular frontend route cannot be used by the runtime to bypass the protected service boundary.
- Request and trace IDs correlate the .NET request with the PLM service operation.

## Implementation Scope

This design changes the existing Phase 1 plan's PLM integration task and API authorization assumptions. It adds the minimum producer-side endpoint and trust checks required to make the chosen integration safe. The remaining Context Compiler, prompt governance, model gateway, validation, evaluation, and telemetry tasks continue to consume the same runtime evidence interface.

For Azure-first Phase 1, use Entra OIDC/JWT for API and workload identity and an asymmetric Key Vault signing key for the authorization decision ticket; the PLM service receives the corresponding trusted public JWK configuration. The platform owner or deployment owner must still provide issuer/audience values, tenant/subject claim mapping, required app role, the server-side authorization policy provider, key lifecycle/rotation settings, and any supported revocation source before production configuration. The implementation may provide configuration-bound adapters and deny-by-default behavior, but must not invent production claims or grants.
