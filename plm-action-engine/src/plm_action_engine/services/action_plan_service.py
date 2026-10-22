from plm_action_engine.approval import compute_plan_hash
from plm_action_engine.contracts import (
    ActionPlanRequest,
    ActionPreview,
    PreconditionResult,
    TargetReference,
)
from plm_action_engine.planning import ActionPlanBuilder
from plm_action_engine.policy import PlanPolicyValidator
from plm_action_engine.resolvers import ResolverRegistry
from plm_action_engine.storage import PreviewRepository


class ActionPlanService:
    def __init__(
        self,
        builder: ActionPlanBuilder,
        policy: PlanPolicyValidator,
        resolvers: ResolverRegistry,
        previews: PreviewRepository | None = None,
    ) -> None:
        self._builder = builder
        self._policy = policy
        self._resolvers = resolvers
        self._previews = previews

    def build_preview(self, request: ActionPlanRequest) -> ActionPreview:
        plan = self._builder.build(request)
        policy_result = self._policy.validate(plan)
        if not policy_result.allowed:
            raise ValueError("; ".join(policy_result.errors))

        state = self._resolvers.resolve(plan)
        operation = plan.operations[0]
        operation.current_values = {
            key: state.current_values.get(key) for key in operation.proposed_values
        }

        plan.target = TargetReference(
            system=state.system,
            entity_type=state.entity_type,
            native_id=state.native_id,
            number=state.number,
            expected_version=state.version_id,
            expected_last_modified=state.last_modified,
        )

        preconditions = [
            PreconditionResult(
                name="TARGET_EXISTS",
                satisfied=True,
                message="The Windchill target was resolved.",
            ),
            PreconditionResult(
                name="LATEST_OBJECT",
                satisfied=state.latest is True,
                message=(
                    "The target is the latest object."
                    if state.latest is True
                    else "The target is not confirmed as the latest object."
                ),
            ),
            PreconditionResult(
                name="NOT_RESERVED_BY_ANOTHER_USER",
                satisfied=not bool(state.reserved_by),
                message=(
                    "The target is not currently reserved."
                    if not state.reserved_by
                    else f"The target is reserved by {state.reserved_by}."
                ),
            ),
            PreconditionResult(
                name="CONCURRENCY_REFERENCE_CAPTURED",
                satisfied=bool(state.version_id and state.last_modified),
                message=(
                    "Version ID and last-modified timestamp were captured."
                    if state.version_id and state.last_modified
                    else "Version ID or last-modified timestamp is missing."
                ),
            ),
        ]

        ready_for_approval = all(
            item.satisfied or not item.blocking for item in preconditions
        )
        warnings = ["PLAN_ONLY: no enterprise write has been performed."]
        warnings.extend([
            "Windchill modification permission has not been verified.",
            "CSRF nonce and reservation workflow have not been validated.",
            "Approval preview only: enterprise write execution is disabled.",
        ])

        hash_payload = {
            "action_plan_id": plan.action_plan_id,
            "tool_name": plan.tool_name,
            "target": plan.target.model_dump(mode="json"),
            "current_values": operation.current_values,
            "proposed_values": operation.proposed_values,
            "preconditions": [item.model_dump(mode="json") for item in preconditions],
        }
        preview = ActionPreview(
            action_plan_id=plan.action_plan_id,
            plan_hash=compute_plan_hash(hash_payload),
            tool_name=plan.tool_name,
            target=plan.target,
            current_values=operation.current_values,
            proposed_values=operation.proposed_values,
            preconditions=preconditions,
            ready_for_approval=ready_for_approval,
            ready_for_execution=False,
            warnings=warnings,
        )
        if self._previews is not None:
            self._previews.save(preview)
        return preview
