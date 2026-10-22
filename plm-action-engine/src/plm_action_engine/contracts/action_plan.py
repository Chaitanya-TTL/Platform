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


class ActionKind(StrEnum):
    CREATE_ENTITY = "CREATE_ENTITY"
    UPDATE_ENTITY = "UPDATE_ENTITY"
    DELETE_ENTITY = "DELETE_ENTITY"
    ADD_RELATIONSHIP = "ADD_RELATIONSHIP"
    REMOVE_RELATIONSHIP = "REMOVE_RELATIONSHIP"
    TRANSITION_STATE = "TRANSITION_STATE"
    EXECUTE_BUSINESS_ACTION = "EXECUTE_BUSINESS_ACTION"


class ActionPlanStatus(StrEnum):
    PROPOSED = "PROPOSED"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"
    APPROVED = "APPROVED"
    EXECUTING = "EXECUTING"
    VERIFIED_SUCCESS = "VERIFIED_SUCCESS"
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED"
    FAILED = "FAILED"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TargetReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system: EnterpriseSystem
    entity_type: str = Field(min_length=1)
    native_id: str | None = None
    number: str | None = None
    parent_native_id: str | None = None
    expected_version: str | None = None
    expected_last_modified: datetime | None = None


class ActionPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool_name: str = Field(min_length=1)
    action_kind: ActionKind
    requested_by: str = Field(min_length=1)
    reason: str = Field(min_length=1, max_length=2000)
    target: TargetReference
    parameters: dict[str, Any] = Field(default_factory=dict)


class ActionOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation: str = Field(min_length=1)
    parameters: dict[str, Any]
    current_values: dict[str, Any] = Field(default_factory=dict)
    proposed_values: dict[str, Any] = Field(default_factory=dict)


class ActionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_plan_id: str = Field(default_factory=lambda: f"plan:{uuid4()}")
    tool_name: str
    action_kind: ActionKind
    mode: ActionMode = ActionMode.PLAN_ONLY
    status: ActionPlanStatus = ActionPlanStatus.PROPOSED
    target: TargetReference
    operations: list[ActionOperation] = Field(min_length=1)
    requested_by: str
    reason: str
    risk_level: RiskLevel
    approval_required: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def enforce_plan_only_safety(self) -> "ActionPlan":
        if self.mode != ActionMode.PLAN_ONLY:
            raise ValueError("Version 0.2 supports PLAN_ONLY mode only")
        return self
