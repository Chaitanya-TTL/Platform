from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .action_plan import EnterpriseSystem, TargetReference


class PreconditionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    satisfied: bool
    message: str
    blocking: bool = True


class ResolvedTargetState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system: EnterpriseSystem
    entity_type: str
    native_id: str
    number: str | None = None
    name: str | None = None
    lifecycle_state: str | None = None
    lifecycle_state_display: str | None = None
    version_id: str | None = None
    last_modified: datetime | None = None
    latest: bool | None = None
    reserved_by: str | None = None
    current_values: dict[str, Any] = Field(default_factory=dict)
    source_record: dict[str, Any] = Field(default_factory=dict)


class ActionPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_plan_id: str
    plan_hash: str
    tool_name: str
    target: TargetReference
    current_values: dict[str, Any]
    proposed_values: dict[str, Any]
    preconditions: list[PreconditionResult]
    ready_for_approval: bool
    ready_for_execution: bool = False
    warnings: list[str] = Field(default_factory=list)
