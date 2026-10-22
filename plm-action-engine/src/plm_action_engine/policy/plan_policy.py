from dataclasses import dataclass, field

from plm_action_engine.contracts import ActionMode, ActionPlan, RiskLevel
from plm_action_engine.registry import EnterpriseToolRegistry


@dataclass(frozen=True)
class PolicyResult:
    allowed: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class PlanPolicyValidator:
    def __init__(self, registry: EnterpriseToolRegistry) -> None:
        self._registry = registry

    def validate(self, plan: ActionPlan) -> PolicyResult:
        errors: list[str] = []
        warnings: list[str] = []

        if plan.mode != ActionMode.PLAN_ONLY:
            errors.append("Version 0.2 permits PLAN_ONLY mode only")

        try:
            tool = self._registry.get(plan.tool_name)
        except ValueError as exc:
            errors.append(str(exc))
            return PolicyResult(False, errors, warnings)

        if plan.target.system != tool.system:
            errors.append("Target system does not match registered tool")
        if plan.target.entity_type != tool.entity_type:
            errors.append("Target entity type does not match registered tool")
        if plan.action_kind != tool.action_kind:
            errors.append("Action kind does not match registered tool")
        if plan.risk_level in {RiskLevel.HIGH, RiskLevel.CRITICAL}:
            warnings.append("High-risk plan requires enhanced approval before future execution")
        if plan.target.expected_version is None and plan.action_kind.value != "CREATE_ENTITY":
            warnings.append("Expected target version is unresolved")

        return PolicyResult(allowed=not errors, errors=errors, warnings=warnings)
