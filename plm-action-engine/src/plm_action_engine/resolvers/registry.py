from plm_action_engine.contracts import ActionPlan, ResolvedTargetState

from .base import TargetResolver


class ResolverRegistry:
    def __init__(self) -> None:
        self._resolvers: list[TargetResolver] = []

    def register(self, resolver: TargetResolver) -> None:
        self._resolvers.append(resolver)

    def resolve(self, plan: ActionPlan) -> ResolvedTargetState:
        matches = [resolver for resolver in self._resolvers if resolver.supports(plan)]
        if not matches:
            raise ValueError(f"No resolver registered for tool {plan.tool_name}")
        if len(matches) > 1:
            raise ValueError(f"Multiple resolvers registered for tool {plan.tool_name}")
        return matches[0].resolve(plan)
