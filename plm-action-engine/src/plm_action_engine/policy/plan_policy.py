from dataclasses import dataclass, field

from plm_action_engine.contracts import ActionMode, ActionPlan, EnterpriseSystem


@dataclass(frozen=True)
class PolicyResult:
    allowed: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class PlanPolicyValidator:
    def validate(self, plan: ActionPlan) -> PolicyResult:
        errors: list[str] = []
        warnings: list[str] = []

        if plan.mode != ActionMode.PLAN_ONLY:
            errors.append("Initial milestone permits PLAN_ONLY mode")
        if plan.target.system != EnterpriseSystem.WINDCHILL:
            errors.append("Initial milestone supports WINDCHILL only")
        if len(plan.operations) != 1:
            errors.append("Initial milestone permits exactly one operation")

        operation = plan.operations[0]
        if operation.operation != "UPDATE_ATTRIBUTE" or operation.field != "Description":
            errors.append("Only Change Task Description updates are permitted")
        if plan.target.expected_version is None:
            warnings.append("Expected target version is unresolved")
        if operation.current_value is None:
            warnings.append("Current Description is unresolved")

        return PolicyResult(allowed=not errors, errors=errors, warnings=warnings)
