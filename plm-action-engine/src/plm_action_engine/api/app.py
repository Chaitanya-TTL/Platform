from fastapi import FastAPI, HTTPException

from plm_action_engine.contracts import ActionPlanRequest
from plm_action_engine.planning import ActionPlanBuilder
from plm_action_engine.policy import PlanPolicyValidator

app = FastAPI(title="PLM Action Engine", version="0.1.0")
_builder = ActionPlanBuilder()
_policy = PlanPolicyValidator()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP", "mode": "PLAN_ONLY"}


@app.post("/v1/action-plans")
def create_action_plan(request: ActionPlanRequest) -> dict:
    try:
        plan = _builder.build(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    policy = _policy.validate(plan)
    return {
        "actionPlan": plan.model_dump(mode="json"),
        "policy": {
            "allowed": policy.allowed,
            "errors": policy.errors,
            "warnings": policy.warnings,
        },
    }
