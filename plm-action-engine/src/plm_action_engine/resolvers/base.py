from typing import Protocol

from plm_action_engine.contracts import ActionPlan, ResolvedTargetState


class TargetResolver(Protocol):
    def supports(self, plan: ActionPlan) -> bool:
        ...

    def resolve(self, plan: ActionPlan) -> ResolvedTargetState:
        ...
