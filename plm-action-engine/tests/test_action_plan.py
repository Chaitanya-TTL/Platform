import pytest

from plm_action_engine.contracts import (
    ActionKind,
    ActionPlanRequest,
    EnterpriseSystem,
    TargetReference,
)
from plm_action_engine.planning import ActionPlanBuilder
from plm_action_engine.policy import PlanPolicyValidator
from plm_action_engine.registry import build_default_registry


@pytest.fixture
def services():
    registry = build_default_registry()
    return ActionPlanBuilder(registry), PlanPolicyValidator(registry)


def test_update_change_task_plan(services) -> None:
    builder, policy = services
    request = ActionPlanRequest(
        tool_name="windchill.update_change_task_description",
        action_kind=ActionKind.UPDATE_ENTITY,
        requested_by="test-user",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            number="00136",
        ),
        parameters={"description": "Steering material update review"},
        reason="POC",
    )
    plan = builder.build(request)
    assert policy.validate(plan).allowed is True
    assert plan.mode == "PLAN_ONLY"


def test_add_bom_component_plan(services) -> None:
    builder, policy = services
    request = ActionPlanRequest(
        tool_name="windchill.add_bom_component",
        action_kind=ActionKind.ADD_RELATIONSHIP,
        requested_by="test-user",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="BOM",
            native_id="OR:wt.part.WTPart:1714910",
        ),
        parameters={
            "component_native_id": "OR:wt.part.WTPart:1720001",
            "quantity": 2,
            "unit": "EA",
        },
        reason="POC",
    )
    plan = builder.build(request)
    result = policy.validate(plan)
    assert result.allowed is True
    assert plan.risk_level == "HIGH"


def test_create_codebeamer_requirement_plan(services) -> None:
    builder, policy = services
    request = ActionPlanRequest(
        tool_name="codebeamer.create_requirement",
        action_kind=ActionKind.CREATE_ENTITY,
        requested_by="test-user",
        target=TargetReference(
            system=EnterpriseSystem.CODEBEAMER,
            entity_type="REQUIREMENT",
        ),
        parameters={
            "tracker_id": 42,
            "name": "Steering operating temperature",
            "description": "The steering system shall operate within the approved range.",
        },
        reason="POC",
    )
    plan = builder.build(request)
    assert policy.validate(plan).allowed is True


def test_rejects_unknown_parameters(services) -> None:
    builder, _ = services
    request = ActionPlanRequest(
        tool_name="windchill.update_change_task_description",
        action_kind=ActionKind.UPDATE_ENTITY,
        requested_by="test-user",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            number="00136",
        ),
        parameters={"description": "Valid", "arbitrary_url": "https://example.invalid"},
        reason="POC",
    )
    with pytest.raises(ValueError, match="Unsupported parameters"):
        builder.build(request)
