from plm_action_engine.contracts import (
    ActionIntent,
    ActionOperation,
    ActionPlan,
    ActionPlanRequest,
    EnterpriseSystem,
)


class ActionPlanBuilder:
    """Builds plans only. This class never calls an enterprise write API."""

    def build(self, request: ActionPlanRequest) -> ActionPlan:
        if request.intent != ActionIntent.UPDATE_CHANGE_TASK_DESCRIPTION:
            raise ValueError(f"Unsupported action intent: {request.intent}")

        if request.target.system != EnterpriseSystem.WINDCHILL:
            raise ValueError("Change Task description updates target WINDCHILL only")

        if request.target.entity_type != "CHANGE_TASK":
            raise ValueError("Target entity_type must be CHANGE_TASK")

        return ActionPlan(
            intent=request.intent,
            target=request.target,
            requested_by=request.requested_by,
            reason=request.reason,
            operations=[
                ActionOperation(
                    operation="UPDATE_ATTRIBUTE",
                    field="Description",
                    proposed_value=request.proposed_description,
                )
            ],
            warnings=[
                "PLAN_ONLY: no enterprise write has been performed.",
                "Current value and version must be resolved before approval.",
            ],
        )
