import httpx

from plm_action_engine.clients import WindchillClient, WindchillSettings
from plm_action_engine.contracts import (
    ActionKind,
    ActionPlanRequest,
    EnterpriseSystem,
    TargetReference,
)
from plm_action_engine.planning import ActionPlanBuilder
from plm_action_engine.policy import PlanPolicyValidator
from plm_action_engine.registry import build_default_registry
from plm_action_engine.resolvers import ResolverRegistry, WindchillResolver
from plm_action_engine.services import ActionPlanService


CHANGE_TASK = {
    "Description": None,
    "ID": "OR:wt.change2.WTChangeActivity2:1715126",
    "LastModified": "2026-09-24T12:14:11+05:30",
    "Latest": True,
    "Name": "(Default task) Modify affected objects",
    "Number": "00136",
    "State": {"Value": "IMPLEMENTATION", "Display": "Implementation"},
    "VersionID": "VR:wt.change2.WTChangeActivity2:1715125",
    "ReservedBy": None,
    "ChangeNoticeReference": {
        "Identity": "Change Notice - 00042",
        "ResourceID": "ChangeNotices('OR:wt.change2.WTChangeOrder2:1715108')",
    },
}


def mock_handler(request: httpx.Request) -> httpx.Response:
    assert request.method == "GET"
    assert "ChangeTasks" in str(request.url)
    return httpx.Response(
        200,
        headers={"content-type": "application/json;odata.metadata=minimal"},
        json={"value": [CHANGE_TASK]},
    )


def test_builds_live_style_change_task_preview() -> None:
    registry = build_default_registry()
    client = WindchillClient(
        WindchillSettings("http://windchill.test/Windchill", "user", "pass"),
        transport=httpx.MockTransport(mock_handler),
    )
    resolvers = ResolverRegistry()
    resolvers.register(WindchillResolver(client))
    service = ActionPlanService(
        ActionPlanBuilder(registry),
        PlanPolicyValidator(registry),
        resolvers,
    )

    request = ActionPlanRequest(
        tool_name="windchill.update_change_task_description",
        action_kind=ActionKind.UPDATE_ENTITY,
        requested_by="chaitanya",
        reason="Preview a controlled update",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            number="00136",
        ),
        parameters={"description": "Steering material update review"},
    )

    preview = service.build_preview(request)

    assert preview.target.native_id == "OR:wt.change2.WTChangeActivity2:1715126"
    assert preview.target.expected_version == "VR:wt.change2.WTChangeActivity2:1715125"
    assert preview.current_values == {"description": None}
    assert preview.proposed_values["description"] == "Steering material update review"
    assert preview.ready_for_approval is True
    assert preview.ready_for_execution is False
    assert all(item.satisfied for item in preview.preconditions)
