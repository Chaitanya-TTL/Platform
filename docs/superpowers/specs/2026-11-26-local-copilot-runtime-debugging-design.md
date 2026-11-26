# Local Copilot Runtime Debugging Design

## Intent

Make the single-developer local PoC reliably send investigation questions through the runtime and make the complete retrieval-to-model flow observable. The reported credential sentence was emitted by the frontend after HTTP 401; the currently running API reports `AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED`, so the request does not reach the answer controller, retrieval, context compiler, or model.

## Goals

- In Development only, allow Copilot requests to reach the runtime without a user JWT or external authorization provider. Give the runtime a synthetic local principal sufficient for its existing context contract.
- Preserve the existing local internal PLM service path so investigation data can be retrieved.
- When a requested retrieval operation fails or is unavailable, return an explicit retrieval failure and do not compile partial context or invoke the model. An empty successful retrieval remains distinct from a retrieval failure.
- Emit Development-only full-payload diagnostics for question receipt, retrieval plans/results, compiled context, final model prompt, model response, validation, and final answer. Preserve structured failure codes and never treat infrastructure errors as evidence.
- Keep the legacy route and all production authentication, authorization, and logging behavior unchanged.

## Non-goals

- Production identity, ACL, ownership, tenant-isolation, or policy design.
- Removing the legacy route.
- Changing evidence ranking, adding caps, or suppressing evidence that the existing compiler approves.
- Claiming live answer quality until the configured model and investigation services have been exercised.

## Constraints

- Reuse existing runtime authorization interfaces and execution tracing where possible.
- The Development bypass must be selected by the host environment, not request data, and must not register in Production.
- Full prompt and evidence logging can contain investigation content. Keep it confined to Development, run it only when explicitly enabled, retain existing credential sanitization, and document the local-log exposure.
- Retrieval failures are operational errors, not investigation facts. Return a failure disposition with a retrieval-specific issue; do not feed exception text or error metadata to the model.
- Preserve successful empty-result behavior and all existing graph-answer paths.

## Approaches

1. **Development-only synthetic identity and existing traces (recommended):** accept local runtime requests without JWT only in Development, establish the synthetic identity server-side, fail before model invocation on requested retrieval errors, and use existing opt-in full-payload trace events. This matches the single-developer PoC and leaves Production registrations unchanged.
2. **Remove authentication and authorization checks from the shared runtime pipeline:** fewer local setup steps, but risks changing non-Development behavior and bypassing the existing context contract; rejected because the same outcome can be achieved behind the Development host boundary.
3. **Change only the frontend error wording or classify error-like model prose:** does not allow the request to reach retrieval/model or fix requested-retrieval failures; rejected as symptom-only.

## Expected behavior

- A local question reaches the runtime without a developer JWT.
- For a successful broad investigation question, traces show the question, all requested retrieval outcomes, returned systems/passages/facts, approved context and stages, exact prompt sent, model response, validation result, and persisted answer.
- If any requested retrieval operation fails, the response is an explicit retrieval failure; no later context compilation or model call occurs.
- If ingress or model configuration is unavailable, show a structured, non-answer failure; never present it as a model-generated investigation answer.

## Verification

- Add focused tests for Development anonymous ingress and Production JWT preservation.
- Add tests proving requested source-evidence, fact, and application-context failures do not reach ContextCompiler/model, while empty successful retrieval remains supported.
- Add trace assertions showing retrieved context and final prompt at the model boundary without recording credentials.
- Run the focused API/runtime and frontend tests. Live model answer quality remains unverified until local provider configuration is available.
