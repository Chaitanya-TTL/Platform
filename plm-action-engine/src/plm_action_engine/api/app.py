from fastapi import FastAPI, HTTPException

from plm_action_engine.approval import ApprovalService
from plm_action_engine.clients import WindchillClient, WindchillClientError, WindchillSettings
from plm_action_engine.contracts import ActionPlanRequest, ApprovalRequest
from plm_action_engine.planning import ActionPlanBuilder
from plm_action_engine.policy import PlanPolicyValidator
from plm_action_engine.registry import build_default_registry
from plm_action_engine.resolvers import ResolverRegistry, WindchillResolver
from plm_action_engine.services import ActionPlanService
from plm_action_engine.storage import InMemoryApprovalRepository, InMemoryPreviewRepository

app = FastAPI(title="PLM Action Engine", version="0.4.0")
_registry = build_default_registry()
_builder = ActionPlanBuilder(_registry)
_policy = PlanPolicyValidator(_registry)
_previews = InMemoryPreviewRepository()
_approvals = InMemoryApprovalRepository()
_approval_service = ApprovalService(_approvals, _previews)


def _build_action_plan_service() -> ActionPlanService:
    settings = WindchillSettings.from_env_file(".env")
    resolver_registry = ResolverRegistry()
    resolver_registry.register(WindchillResolver(WindchillClient(settings)))
    return ActionPlanService(_builder, _policy, resolver_registry, _previews)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP", "mode": "PLAN_ONLY", "version": "0.4.0"}


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


@app.post("/v1/action-previews")
def create_action_preview(request: ActionPlanRequest) -> dict:
    try:
        preview = _build_action_plan_service().build_preview(request)
    except (ValueError, WindchillClientError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return preview.model_dump(mode="json")


@app.post("/v1/approvals")
def create_approval(request: ApprovalRequest) -> dict:
    try:
        record = _approval_service.approve(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return record.model_dump(mode="json")


@app.get("/v1/approvals/validate")
def validate_approval(action_plan_id: str, plan_hash: str) -> dict:
    return _approval_service.validate(action_plan_id, plan_hash).model_dump(mode="json")
