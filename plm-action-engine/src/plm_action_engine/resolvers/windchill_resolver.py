from __future__ import annotations

from datetime import datetime
from typing import Any

from plm_action_engine.clients import WindchillClient
from plm_action_engine.contracts import (
    ActionPlan,
    EnterpriseSystem,
    ResolvedTargetState,
)


class WindchillResolver:
    SUPPORTED_TOOLS = {"windchill.update_change_task_description"}

    def __init__(self, client: WindchillClient) -> None:
        self._client = client

    def supports(self, plan: ActionPlan) -> bool:
        return (
            plan.target.system == EnterpriseSystem.WINDCHILL
            and plan.tool_name in self.SUPPORTED_TOOLS
        )

    def resolve(self, plan: ActionPlan) -> ResolvedTargetState:
        if plan.target.native_id:
            record = self._client.get_change_task_by_oid(plan.target.native_id)
        elif plan.target.number:
            record = self._client.find_change_task_by_number(plan.target.number)
        else:
            raise ValueError("Windchill Change Task requires native_id or number")

        if record is None:
            identifier = plan.target.native_id or plan.target.number
            raise ValueError(f"Windchill Change Task not found: {identifier}")

        state = record.get("State") or {}
        if not isinstance(state, dict):
            state = {}

        last_modified = self._parse_datetime(record.get("LastModified"))
        native_id = record.get("ID")
        if not native_id:
            raise ValueError("Windchill Change Task response is missing ID")

        return ResolvedTargetState(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            native_id=native_id,
            number=record.get("Number"),
            name=record.get("Name"),
            lifecycle_state=state.get("Value"),
            lifecycle_state_display=state.get("Display"),
            version_id=record.get("VersionID"),
            last_modified=last_modified,
            latest=record.get("Latest"),
            reserved_by=record.get("ReservedBy"),
            current_values={
                "description": record.get("Description"),
                "name": record.get("Name"),
                "state": state.get("Value"),
                "state_display": state.get("Display"),
                "reserved_by": record.get("ReservedBy"),
                "change_notice_reference": record.get("ChangeNoticeReference"),
            },
            source_record=record,
        )

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if not value:
            return None
        if not isinstance(value, str):
            raise ValueError("Windchill LastModified must be a string")
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"Invalid Windchill LastModified value: {value}") from exc
