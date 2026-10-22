from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EnterpriseSystem(StrEnum):
    WINDCHILL = "WINDCHILL"
    SAP = "SAP"
    CONFIGIT = "CONFIGIT"
    CODEBEAMER = "CODEBEAMER"


class ActionMode(StrEnum):
    PLAN_ONLY = "PLAN_ONLY"
    EXECUTE_AFTER_APPROVAL = "EXECUTE_AFTER_APPROVAL"


class ActionIntent(StrEnum):
    UPDATE_CHANGE_TASK_DESCRIPTION = "UPDATE_CHANGE_TASK_DESCRIPTION"


class ActionPlanStatus(StrEnum):
    PROPOSED = "PROPOSED"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"
    APPROVED = "APPROVED"
    EXECUTING = "EXECUTING"
    VERIFIED_SUCCESS = "VERIFIED_SUCCESS"
    FAILED = "FAILED"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class TargetReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system: EnterpriseSystem
    entity_type: str = Field(min_length=1)
    native_id: str | None = None
    number: str | None = None
    expected_version: str | None = None
    expected_last_modified: datetime | None = None

    @model_validator(mode="after")
    def require_stable_target_identifier(self) -> "TargetReference":
        if not self.native_id and not self.number:
            raise ValueError("Either native_id or number must identify the target")
        return self


class ActionOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation: str = Field(min_length=1)
    field: str = Field(min_length=1)
    current_value: Any | None = None
    proposed_value: Any


class ActionPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    intent: ActionIntent
    requested_by: str = Field(min_length=1)
    target: TargetReference
    proposed_description: str = Field(min_length=1, max_length=4000)
    reason: str = Field(min_length=1, max_length=2000)


class ActionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_plan_id: str = Field(default_factory=lambda: f"plan:{uuid4()}")
    intent: ActionIntent
    mode: ActionMode = ActionMode.PLAN_ONLY
    status: ActionPlanStatus = ActionPlanStatus.PROPOSED
    target: TargetReference
    operations: list[ActionOperation] = Field(min_length=1)
    requested_by: str
    reason: str
    risk_level: RiskLevel = RiskLevel.MEDIUM
    approval_required: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    warnings: list[str] = Field(default_factory=list)
