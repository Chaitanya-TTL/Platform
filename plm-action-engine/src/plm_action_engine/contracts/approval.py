from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApprovalStatus(StrEnum):
    APPROVED = "APPROVED"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_plan_id: str = Field(min_length=1)
    plan_hash: str = Field(min_length=64, max_length=64)
    approved_by: str = Field(min_length=1)
    approval_reason: str = Field(min_length=1, max_length=2000)
    expires_in_minutes: int = Field(default=30, ge=1, le=1440)


class ApprovalRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approval_id: str
    action_plan_id: str
    plan_hash: str
    approved_by: str
    approval_reason: str
    status: ApprovalStatus
    approved_at: datetime
    expires_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class ApprovalValidation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    approval_id: str | None = None
    action_plan_id: str
    plan_hash: str
    status: ApprovalStatus | None = None
    errors: list[str] = Field(default_factory=list)
