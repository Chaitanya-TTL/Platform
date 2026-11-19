# AI Runtime Phase 1: Local setup

This guide covers the .NET AI Runtime's local build, offline tests, and the settings needed to connect a developer instance to platform resources. It does not provision Azure resources or provide a local authorization policy. Do not send client data through the runtime until the approval and deployment prerequisites in [Phase 1 Azure resources](phase-1-azure-resources.md) are met.

## Requirements

- .NET 10 SDK (`net10.0`); run commands from `OrchestrationPlatform`.
- An Entra developer identity with access to the Azure resources you intend to use.
- Platform-provided, non-secret endpoint, deployment, identity, and private PLM service values for any connected run.

Check the installed SDK and restore/build the solution:

```powershell
dotnet --version
dotnet restore .\OrchestrationPlatform.slnx
dotnet build .\OrchestrationPlatform.slnx --no-restore
```

Run the AI Runtime tests and offline evaluation:

```powershell
dotnet test .\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj
dotnet run --project .\Lattice.AI.Runtime.Evaluation\Lattice.AI.Runtime.Evaluation.csproj -- --dataset .\evals\engineering-impact\v1
```

The evaluation runner uses checked-in fixtures and a deterministic fake model gateway; it does not call Azure OpenAI. To run the broader solution test suite, use:

```powershell
dotnet test .\OrchestrationPlatform.slnx
```

The evaluation report is a deterministic synthetic-fixture regression report, not a live-model evaluation. It sets `referenceIntegrityEvaluated` to `true`, and `semanticSupportEvaluated` and `liveModelQualityEvaluated` to `false` on every run. Reported intent, subject, clarification, bounded-scope, disposition, evidence/reference/path/chain, parse, and omission rates compare explicit case annotations with runtime observations; each rate includes its numerator and denominator, and has a `null` rate when the denominator is zero. Authorization leakage is the count of annotated denied scenarios that reached evidence retrieval or model invocation. Unsupported-reference rejection records deterministic validator rejection attempts; it does not measure prose truth or engineering correctness. A passing fixture run is not proof that generated prose is semantically supported or useful.

The default test suite uses test doubles for model and signing dependencies and does not require Azure credentials. There is no credentialed/live model integration-test target in this phase; do not add Azure credentials to make the default tests contact a model. Keep any future live-model smoke test explicitly separate, opt-in, and covered by the platform's data-handling approval.

## Entra developer sign-in

The Azure OpenAI gateway, Key Vault signing adapter, and PLM workload-token provider use `DefaultAzureCredential`. For a local developer session, sign in with an approved Entra account using the Azure CLI:

```powershell
az login --tenant <platform-provided-tenant-id>
az account show
```

The selected identity must be granted the necessary resource permissions by the platform. This sign-in supplies credentials to Azure SDK clients; it does **not** by itself authenticate a request to the API or provide an authorization decision. API requests also need a bearer token accepted by the configured API issuer and audience, and an available server-side authorization-decision provider.

## Local configuration

Use environment variables or an untracked user-secrets store for local values. Do not commit access tokens, client secrets, API keys, signing material, or production connection strings. Endpoint and deployment names are configuration, not credentials.

The model options are bound from `AiRuntime`:

| Setting | Meaning and validation |
| --- | --- |
| `AiRuntime__Endpoint` | HTTPS Azure OpenAI endpoint. |
| `AiRuntime__DeploymentName` | Required deployment name at that endpoint. |
| `AiRuntime__TimeoutSeconds` | Request timeout; default `45`, valid range `1`–`120`. |
| `AiRuntime__MaxOutputTokens` | Maximum output tokens; default `1024`, valid range `1`–`8192`. |
| `AiRuntime__MaxInputTokens` | Required input-token allowance; must be greater than zero and greater than `MaxOutputTokens`. Select it for the actual deployment context window; it has no inferred default or generic model-specific ceiling. |

For example, set only platform-supplied values in the current PowerShell session:

```powershell
$env:AiRuntime__Endpoint = "<platform-provided-https-endpoint>"
$env:AiRuntime__DeploymentName = "<platform-provided-deployment-name>"
$env:AiRuntime__TimeoutSeconds = "45"
$env:AiRuntime__MaxOutputTokens = "1024"
$env:AiRuntime__MaxInputTokens = "<deployment-context-window-input-token-limit>"
$env:AiRuntime__Authentication__Authority = "<platform-provided-entra-authority>"
$env:AiRuntime__Authentication__Audience = "<platform-provided-api-audience>"
```

`AiRuntime:Authentication:Authority` and `AiRuntime:Authentication:Audience` configure JWT bearer validation at API ingress. The API validates issuer, audience, signature, and lifetime with no clock skew. The Phase 1 model provider is fixed to Azure OpenAI, and the prompt is the source-controlled `engineering-impact/v1`; neither is selected by configuration.

The input allowance is the configured maximum model input/context window for the selected deployment. The runtime reserves `MaxOutputTokens`, a 15% input safety margin, and an estimate of the fixed prompt/question before allocating an estimated context-token budget. After assembly it estimates the complete system and user message payload and abstains before model invocation if the input plus output reservation and margin do not fit. Both estimates use UTF-8 bytes divided by four; this is a conservative heuristic, not tokenizer output or a guarantee of provider token accounting. The deployment-specific allowance is mandatory; the runtime does not infer a provider/model limit.

Telemetry keeps request/trace correlation, stage/outcome data, bounded quality counts, model configuration/version, and token counts. Investigation, canonical entity, tenant, and Context Package identifiers are excluded by default. The `AiRuntime__Telemetry__IncludeInvestigationIdentifier`, `IncludeEntityIdentifier`, `IncludeTenantIdentifier`, and `IncludeContextPackageIdentifier` settings are opt-in and should only be enabled with explicit security approval. Subject IDs, authorization decision IDs, credential headers, URL query values, and raw question/prompt/answer/evidence content remain excluded.

Quality metrics are aggregate only: request outcomes include disposition counts; `lattice.ai.runtime.answer.grounded` counts schema/reference-validated answers; unsupported assertion rejections count distinct rejected claim/code keys; context metrics count omissions and input-budget exhaustion; citation coverage is the ratio of cited evidence IDs with a matching cited source; and source-claim confidence is emitted as a distribution. These metrics have no case, entity, source, claim, or request identifiers. Source-confidence distributions are not by themselves a calibration score, and the deterministic offline evaluation does not evaluate model calibration or semantic answer correctness.

PLM Brain settings are nested under `AiRuntime:PlmBrain` (use double underscores in environment-variable names):

| Environment variable | Purpose |
| --- | --- |
| `AiRuntime__PlmBrain__BaseAddress` | Platform-provided private PLM service base address. |
| `AiRuntime__PlmBrain__WorkloadScope` | Entra scope requested for the API workload token. |
| `AiRuntime__PlmBrain__TenantClaimType` | Tenant claim read from the validated API identity; default `tid`. |
| `AiRuntime__PlmBrain__SubjectClaimType` | Subject claim read from the validated API identity; default `sub`. |
| `AiRuntime__PlmBrain__TicketIssuer` | Issuer placed in the signed authorization decision ticket. |
| `AiRuntime__PlmBrain__TicketAudience` | Audience placed in the signed authorization decision ticket. |
| `AiRuntime__PlmBrain__SigningKeyVaultUri` | Platform-provided Key Vault URI used by the signing adapter. |
| `AiRuntime__PlmBrain__SigningKeyName` | Key Vault key name used to sign decision tickets. |
| `AiRuntime__PlmBrain__MaximumAuthorizationTicketLifetimeSeconds` | Ticket lifetime cap; default `60`, valid range `1`–`60` seconds. |

These are platform configuration values, not substitutes for policy. The API derives identity and authorization server-side; callers must not supply tenant, subject, grants, policy decision, or a signed ticket. `AddAiRuntime` registers `UnavailableResourceAuthorizationDecisionProvider` unless the host supplies a real provider. That default returns no decision, so requests are denied (fail closed); configuring model settings or signing-key settings alone does not enable authorization.

`AzureMonitor:Enabled` defaults to `false`. When enabled, configure `AzureMonitor:ConnectionString` or `APPLICATIONINSIGHTS_CONNECTION_STRING`; enabling the exporter without either value causes startup to fail. Do not put an environment-specific connection string in tracked files.

## PLM service environment

The TypeScript PLM service requires the following environment variables for protected internal routes:

| Variable | Requirement |
| --- | --- |
| `LATTICE_PLM_SERVICE_ISSUER` | Expected issuer for the API workload token. |
| `LATTICE_PLM_SERVICE_AUDIENCE` | Expected audience for the API workload token. |
| `LATTICE_PLM_SERVICE_JWKS_URL` | URL from which the service verifies workload-token public keys. |
| `LATTICE_PLM_SERVICE_ROLE` | Required role or scope on the workload token. |
| `LATTICE_DECISION_ISSUER` | Expected issuer of the signed authorization decision ticket. |
| `LATTICE_DECISION_AUDIENCE` | Expected audience of the signed authorization decision ticket. |
| `LATTICE_DECISION_TRUSTED_JWKS` | JSON JWK set containing trusted public decision-signing keys. |
| `LATTICE_DECISION_MAX_LIFETIME_SECONDS` | Optional ticket-lifetime cap; default `60`, valid range `1`–`60`. |
| `LATTICE_DECISION_REVOCATION_CHECK_REQUIRED` | Optional; set to the literal `true` to require a configured revocation checker. |

The service verifies RS256 signatures and issuer/audience, requires the ticket to be unexpired and bound to the active investigation, operation, request, and required grant, and rejects an expired ticket. If revocation checking is required but unavailable—or a configured check cannot determine status—the request is denied. When a checker is configured, it runs and rejects a revoked decision; with no checker, revocation checking is not performed unless the required flag is set, in which case the request is denied.

Authorization tests use a test-only fake signer; they do not generate an ephemeral RSA key, call Key Vault, or produce a cryptographically verifiable ticket. Production signing uses the configured Key Vault key. Do not copy test signing output or use a production private key in local tests. The production signing and public-key distribution boundary is described in the [Azure resource guide](phase-1-azure-resources.md).

## Copilot engineering-impact routing

The frontend Copilot server-side flag `LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED` defaults to `false`; it is read only by server code and must not be set from client input. With the flag disabled, or for questions outside the supported engineering-impact intent, Copilot keeps using its existing answer path.

When enabled, only a supported impact question with one explicit requirement identifier and an investigation ID is routed away from the legacy answer path. This product route does not yet propagate the authenticated user identity or have an available authorization-decision provider, so the request returns a sanitized unavailable response before legacy snapshot/model work. It does not call the runtime API without authorization and does not fall back to a legacy answer. Do not enable this flag for live use until the approved identity and authorization integration is available.
