# AI Runtime Phase 1 Closure Baseline

**Record date:** 2026-11-18
**Starting runtime-code baseline:** `98186f0672a44800a19c88936bdb2d37127c221d` (`fix: complete AI runtime contract wiring`)

This is an evidence record for the runtime-code baseline above. The verification results below were recorded as completed before the Phase 1 closure work; they are not results from the later documentation-plan commit or this report. At report preparation, repository `HEAD` was `4a0018440a06666e483fdba9c1758cf9512d9ef7`. No test run is attributed to that later `HEAD`.

## Baseline verification

Commands are shown relative to the `OrchestrationPlatform` directory unless noted.

| Check | Command | Recorded result |
|---|---|---|
| AI Runtime tests | `dotnet test Lattice.AI.Runtime.Tests/Lattice.AI.Runtime.Tests.csproj` | Passed: 80/80. |
| Offline evaluation | `dotnet run --project Lattice.AI.Runtime.Evaluation/Lattice.AI.Runtime.Evaluation.csproj -- --dataset evals/engineering-impact/v1` | Passed: 12/12 cases; required path and link coverage was 100%. This is fixture-based offline evaluation, not live-model or semantic-quality verification. |
| API build | `dotnet build Orchestration.API/Orchestration.API.csproj` | Succeeded: 0 errors, 8 `NU1507` warnings. |
| Frontend impact evidence and authorization tests | From `frontend`: `npm test -- features/lattice-next/tests/impact-evidence-service.test.ts features/lattice-next/tests/impact-evidence-authorization.test.ts` | Passed: 13/13. |
| API test project | `dotnet test Orchestration.API.Tests/Orchestration.API.Tests.csproj --no-restore` | Blocked during compilation by missing `Governance`, `AvailabilityState`, and `CompletenessState` symbols. The API tests did not run; this is separate from the passing runtime test result. |

## Observed runtime and product boundaries

- `Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs` registers `UnavailableResourceAuthorizationDecisionProvider` as the default `IResourceAuthorizationDecisionProvider`. `Lattice.AI.Runtime/Authorization/UnavailableResourceAuthorizationDecisionProvider.cs` returns `null` for the authorization scope. The observed default therefore does not provide an authorization decision.
- The current Copilot product route enters through the Next.js Copilot routes and calls TypeScript `executeCopilotTurn`, which builds context using the existing context-builder and PLM Brain graph path before calling the Azure model client. The inspected product path does **not** call `POST api/engineering/impact-answer`.
- The offline evaluation uses fixture data and does not establish live authorization, production connectivity, or semantic answer quality.

Relevant source paths:

- `Orchestration.API/AI/Composition/AiRuntimeServiceCollectionExtensions.cs`
- `Lattice.AI.Runtime/Authorization/UnavailableResourceAuthorizationDecisionProvider.cs`
- `frontend/app/api/lattice/copilotkit/[[...path]]/route.ts`
- `frontend/app/api/lattice/investigations/[investigationId]/copilot/route.ts`
- `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`

## External prerequisites

Live or product-routed operation remains dependent on external platform inputs not evidenced as available by this baseline:

- An approved resource authorization decision provider and policy source.
- A secure path for propagating and validating the user's JWT.
- Approved Azure model endpoint/deployment configuration and credentials.
- An approved private network path to the PLM service.
- An approved, seeded investigation for validation.

The baseline does not claim that these prerequisites are configured or that live end-to-end behavior has been verified.
