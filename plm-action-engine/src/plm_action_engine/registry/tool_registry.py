from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from plm_action_engine.contracts import ActionKind, EnterpriseSystem, RiskLevel


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    system: EnterpriseSystem
    entity_type: str
    action_kind: ActionKind
    required_parameters: frozenset[str]
    allowed_parameters: frozenset[str]
    risk_level: RiskLevel
    approval_required: bool = True


class EnterpriseToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDefinition:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise ValueError(f"Unsupported enterprise tool: {name}") from exc

    def validate_parameters(self, tool: ToolDefinition, parameters: dict[str, Any]) -> None:
        supplied = set(parameters)
        missing = tool.required_parameters - supplied
        unknown = supplied - tool.allowed_parameters
        if missing:
            raise ValueError(f"Missing required parameters: {sorted(missing)}")
        if unknown:
            raise ValueError(f"Unsupported parameters: {sorted(unknown)}")

    def list_tools(self) -> list[ToolDefinition]:
        return list(self._tools.values())


def build_default_registry() -> EnterpriseToolRegistry:
    registry = EnterpriseToolRegistry()
    registry.register(ToolDefinition(
        name="windchill.update_change_task_description",
        system=EnterpriseSystem.WINDCHILL,
        entity_type="CHANGE_TASK",
        action_kind=ActionKind.UPDATE_ENTITY,
        required_parameters=frozenset({"description"}),
        allowed_parameters=frozenset({"description"}),
        risk_level=RiskLevel.MEDIUM,
    ))
    registry.register(ToolDefinition(
        name="windchill.add_bom_component",
        system=EnterpriseSystem.WINDCHILL,
        entity_type="BOM",
        action_kind=ActionKind.ADD_RELATIONSHIP,
        required_parameters=frozenset({"component_native_id", "quantity", "unit"}),
        allowed_parameters=frozenset({
            "component_native_id", "quantity", "unit", "line_number",
            "change_task_native_id", "valid_from"
        }),
        risk_level=RiskLevel.HIGH,
    ))
    registry.register(ToolDefinition(
        name="codebeamer.create_requirement",
        system=EnterpriseSystem.CODEBEAMER,
        entity_type="REQUIREMENT",
        action_kind=ActionKind.CREATE_ENTITY,
        required_parameters=frozenset({"tracker_id", "name", "description"}),
        allowed_parameters=frozenset({
            "tracker_id", "name", "description", "parent_item_id",
            "status", "priority", "custom_fields"
        }),
        risk_level=RiskLevel.MEDIUM,
    ))
    return registry
