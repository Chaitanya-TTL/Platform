from plm_action_engine.contracts import (
    ActionIntent,
    ActionPlanRequest,
    EnterpriseSystem,
    TargetReference,
)
from plm_action_engine.planning import ActionPlanBuilder
from plm_action_engine.policy import PlanPolicyValidator


def test_builds_plan_without_executing_enterprise_write() -> None:
    request = ActionPlanRequest(
        intent=ActionIntent.UPDATE_CHANGE_TASK_DESCRIPTION,
        requested_by="test-user",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            number="00136",
        ),
        proposed_description="Steering material update review",
        reason="POC plan-mode validation",
    )

    plan = ActionPlanBuilder().build(request)
    result = PlanPolicyValidator().validate(plan)

    assert result.allowed is True
    assert plan.mode == "PLAN_ONLY"
    assert plan.operations[0].field == "Description"
    assert plan.operations[0].proposed_value == "Steering material update review"
    assert any("no enterprise write" in warning for warning in plan.warnings)
