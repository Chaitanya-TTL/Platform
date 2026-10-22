from plm_action_engine.contracts import ActionOperation, ActionPlan, ActionPlanRequest
from plm_action_engine.registry import EnterpriseToolRegistry


class ActionPlanBuilder:
    """Creates governed plans. It never calls an enterprise write API."""

    def __init__(self, registry: EnterpriseToolRegistry) -> None:
        self._registry = registry

    def build(self, request: ActionPlanRequest) -> ActionPlan:
        tool = self._registry.get(request.tool_name)

        if request.target.system != tool.system:
            raise ValueError(
                f"Tool {tool.name} targets {tool.system}, not {request.target.system}"
            )
        if request.target.entity_type != tool.entity_type:
            raise ValueError(
                f"Tool {tool.name} requires entity_type {tool.entity_type}"
            )
        if request.action_kind != tool.action_kind:
            raise ValueError(
                f"Tool {tool.name} requires action_kind {tool.action_kind}"
            )

        self._registry.validate_parameters(tool, request.parameters)

        return ActionPlan(
            tool_name=tool.name,
            action_kind=tool.action_kind,
            target=request.target,
            requested_by=request.requested_by,
            reason=request.reason,
            risk_level=tool.risk_level,
            approval_required=tool.approval_required,
            operations=[ActionOperation(
                operation=tool.action_kind.value,
                parameters=request.parameters,
                proposed_values=request.parameters,
            )],
            warnings=[
                "PLAN_ONLY: no enterprise write has been performed.",
                "Current source values, permissions, lifecycle state, and version must be resolved before approval.",
            ],
        )
