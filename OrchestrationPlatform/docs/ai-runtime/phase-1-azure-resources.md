# AI Runtime Phase 1: Azure resources and deployment prerequisites

This is a provisioning checklist, not a deployment script. Exact resource names, endpoints, tenant values, role identifiers, network addresses, regions, and model choices must come from the platform owners. The Phase 1 code does not select or provision those values. Do not send client data to a model until every prerequisite in this guide is approved and configured.

## Required platform decisions and resources

| Resource or decision | Required configuration / behavior | Platform value still required |
| --- | --- | --- |
| Azure AI Foundry / Azure OpenAI | Approve and deploy the model for the intended engineering-impact workload. The runtime calls the fixed Azure OpenAI provider using `AiRuntime:Endpoint` and `AiRuntime:DeploymentName`; the endpoint must use HTTPS. The model and `engineering-impact/v1` prompt are not runtime-selectable settings. | Approved model/deployment, resource endpoint, deployment name, region, data-handling and retention approval. |
| Entra identity for API ingress | Configure the API's `AiRuntime:Authentication:Authority` and `AiRuntime:Authentication:Audience`. The API validates issuer, audience, signing key, and token lifetime with zero clock skew. | Tenant/issuer, API audience, token-issuance arrangement, and required incoming identity claim names. |
| Server-side authorization decision provider | Replace the default unavailable provider with the approved production policy integration. The provider must derive tenant, subject, investigation access, required grants, decision ID, policy version, and decision expiry on the server. Missing provider/decision denies access. | Provider implementation/endpoint, policy owner, claim mapping, grant semantics, and failure/availability requirements. |
| API managed identity for PLM calls | Give the API workload identity the approved access needed to obtain a token for the private PLM service. Configure `AiRuntime:PlmBrain:WorkloadScope`, `BaseAddress`, and the service issuer/audience values. The API obtains the workload token with `DefaultAzureCredential`. | Managed identity, resource scope/audience, issuer, private service address, and role assignment. |
| Entra application role for PLM service access | Define and assign a least-privilege app role to the API workload identity for the PLM service. Set the corresponding `LATTICE_PLM_SERVICE_ROLE`; the service accepts the configured value in the token's `roles` or `scp` claim. | Role identifier/value, assignment process, and service-token issuer/audience. |
| Key Vault authorization-decision signing key | Configure `AiRuntime:PlmBrain:SigningKeyVaultUri` and `SigningKeyName` for an RSA-capable Key Vault key usable with RS256 signing. The API signs tickets through Key Vault; the private key is not exported to the API configuration or PLM service. Set `TicketIssuer` and `TicketAudience`. | Vault/key resource, managed-identity signing permission, ticket issuer/audience, and operational owner. |
| Public decision-key distribution | Publish the matching public key as a JWK in `LATTICE_DECISION_TRUSTED_JWKS` for PLM verification. Keep the public JWK's key ID aligned with the ticket header `kid`. The PLM service independently verifies the configured ticket issuer, audience, RS256 signature, lifetime, and authorization scope. | Trusted distribution/configuration path, JWK content, key-ID convention, and deployment/update owner. |
| Key rotation | Plan an overlap when publishing a replacement public key: verifiers need the matching public key while tickets signed with the previous key can still be valid and while key-set updates propagate. The ticket cap is at most 60 seconds; define the overlap and propagation procedure for the actual deployment. | Rotation owner, cadence, propagation path, overlap, and recovery procedure. |
| Optional decision revocation | Configure a production revocation checker if immediate decision revocation is required. Set `LATTICE_DECISION_REVOCATION_CHECK_REQUIRED=true` only when the checker is available. If required but unavailable, or if its status check fails, the PLM service denies the request. | Revocation source, checker implementation, availability behavior, and operating owner. |
| Azure Monitor / Application Insights | Set `AzureMonitor:Enabled=true` and provide `AzureMonitor:ConnectionString` or `APPLICATIONINSIGHTS_CONNECTION_STRING`. The runtime registers the exporter only when enabled and fails startup if enabled without a connection string. | Approved monitoring resource and connection configuration. |
| Private PLM service networking | Keep the internal entity-resolution and impact-evidence routes reachable only over the approved private network. Configure API egress to the private PLM service address and service ingress so it is not exposed as an unauthenticated public route. | Private DNS/addressing, ingress/egress policy, firewall/security-group rules, TLS, and network ownership. |

## Authorization decision ticket

The production authorization provider must return an active server-side decision. The API creates an RS256-signed ticket whose issuer and audience come from `AiRuntime:PlmBrain:TicketIssuer` and `TicketAudience`. It is bound to the tenant, subject, active investigation, `engineering-impact-answer` operation, required PLM grants, policy and decision identifiers, and request ID.

The default `AiRuntime:PlmBrain:MaximumAuthorizationTicketLifetimeSeconds` is `60` seconds and the implementation caps it at `60`. A ticket expires at the earlier of the underlying decision expiry and the configured maximum lifetime. Expired decisions cannot produce a ticket, and the PLM service rejects expired tickets. Configure `LATTICE_DECISION_MAX_LIFETIME_SECONDS` consistently (default `60`, maximum `60`). Clock checks are strict with zero tolerance; keep issuer and verifier clocks synchronized.

The API uses the Key Vault key to sign; the PLM service receives only trusted public JWK material through `LATTICE_DECISION_TRUSTED_JWKS`. The PLM service's workload-token trust is separate: configure `LATTICE_PLM_SERVICE_ISSUER`, `LATTICE_PLM_SERVICE_AUDIENCE`, `LATTICE_PLM_SERVICE_JWKS_URL`, and `LATTICE_PLM_SERVICE_ROLE` for that token. Do not distribute private signing keys.

## Configuration names

API settings use standard .NET environment-variable overrides:

```text
AiRuntime__Endpoint
AiRuntime__DeploymentName
AiRuntime__TimeoutSeconds
AiRuntime__MaxOutputTokens
AiRuntime__MaxInputTokens
AiRuntime__Authentication__Authority
AiRuntime__Authentication__Audience
AiRuntime__PlmBrain__BaseAddress
AiRuntime__PlmBrain__WorkloadScope
AiRuntime__PlmBrain__TenantClaimType
AiRuntime__PlmBrain__SubjectClaimType
AiRuntime__PlmBrain__TicketIssuer
AiRuntime__PlmBrain__TicketAudience
AiRuntime__PlmBrain__SigningKeyVaultUri
AiRuntime__PlmBrain__SigningKeyName
AiRuntime__PlmBrain__MaximumAuthorizationTicketLifetimeSeconds
AzureMonitor__Enabled
AzureMonitor__ConnectionString
APPLICATIONINSIGHTS_CONNECTION_STRING
```

`AiRuntime:TimeoutSeconds` defaults to `45` and must be `1`–`120`; `AiRuntime:MaxOutputTokens` defaults to `1024` and must be `1`–`8192`. `AiRuntime:MaxInputTokens` is required, must be greater than zero, and must exceed `MaxOutputTokens`; select it for the actual deployment context window, without assuming provider support or imposing a generic model-specific ceiling. The runtime reserves the configured output, a 15% input safety margin, and estimated fixed prompt/question overhead before compiling context, then checks the complete assembled prompt estimate before model invocation. UTF-8 bytes divided by four is only a heuristic estimate and is not provider/tokenizer accounting. `AiRuntime:Endpoint` must be an absolute HTTPS URI, and `DeploymentName` is required. These endpoint/deployment values are configuration, not credentials.

The TypeScript service environment variables are `LATTICE_PLM_SERVICE_ISSUER`, `LATTICE_PLM_SERVICE_AUDIENCE`, `LATTICE_PLM_SERVICE_JWKS_URL`, `LATTICE_PLM_SERVICE_ROLE`, `LATTICE_DECISION_ISSUER`, `LATTICE_DECISION_AUDIENCE`, and `LATTICE_DECISION_TRUSTED_JWKS`. `LATTICE_DECISION_MAX_LIFETIME_SECONDS` and `LATTICE_DECISION_REVOCATION_CHECK_REQUIRED` are optional; their behavior is described above.

## Approval gate before sending client data

Before any client data is sent to Azure OpenAI / AI Foundry, obtain and record platform approval for all of the following:

- Data classification, permitted content, retention, residency, and processing region.
- The selected model, deployment, endpoint, and applicable model/data-handling terms.
- Entra tenant, issuer, audience, workload identity, and least-privilege PLM app role.
- A production server-side authorization decision provider and its fail-closed behavior.
- Key Vault signing permissions, public JWK distribution, rotation, and any required revocation check.
- Private network access to the protected PLM routes and approved telemetry configuration.

Do not treat successful Azure authentication, model deployment, or a reachable endpoint as authorization to process client data. No secrets, production endpoints, or unapproved resource identifiers belong in tracked local configuration.
