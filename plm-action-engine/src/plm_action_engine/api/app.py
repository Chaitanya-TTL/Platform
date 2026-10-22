from fastapi import FastAPI, HTTPException

from plm_action_engine.contracts import ActionPlanRequest
from plm_action_engine.planning import ActionPlanBuilder
from plm_action_engine.policy import PlanPolicyValidator
from plm_action_engine.registry import build_default_registry

app = FastAPI(title="PLM Action Engine", version="0.2.0")
_registry = build_default_registry()
_builder = ActionPlanBuilder(_registry)
_policy = PlanPolicyValidator(_registry)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP", "mode": "PLAN_ONLY", "version": "0.2.0"}


@app.get("/v1/tools")
def list_tools() -> list[dict]:
    return [
        {
            "name": tool.name,
            "system": tool.system.value,
            "entityType": tool.entity_type,
            "actionKind": tool.action_kind.value,
            "requiredParameters": sorted(tool.required_parameters),
            "allowedParameters": sorted(tool.allowed_parameters),
            "riskLevel": tool.risk_level.value,
            "approvalRequired": tool.approval_required,
        }
        for tool in _registry.list_tools()
    ]


@app.post("/v1/action-plans")
def create_action_plan(request: ActionPlanRequest) -> dict:
    try:
        plan = _builder.build(request)
        policy = _policy.validate(plan)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "actionPlan": plan.model_dump(mode="json"),
        "policy": {
            "allowed": policy.allowed,
            "errors": policy.errors,
            "warnings": policy.warnings,
        },
    }
