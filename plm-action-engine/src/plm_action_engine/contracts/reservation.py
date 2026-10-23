from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ReservationRoundTripRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_plan_id: str = Field(min_length=1)
    plan_hash: str = Field(min_length=64, max_length=64)
    approval_id: str = Field(min_length=1)
    requested_by: str = Field(min_length=1)
    confirmation: str = Field(pattern=r"^RESERVE_AND_RELEASE$")
    duration: int = Field(default=1, ge=1, le=60)


class ReservationStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    status: str
    message: str


class ReservationRoundTripResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    execution_id: str
    action_plan_id: str
    plan_hash: str
    approval_id: str
    started_at: datetime
    completed_at: datetime
    status: str
    change_notice_oid: str
    change_task_oid: str
    steps: list[ReservationStep]
    cleanup_complete: bool
    description_modified: bool = False
    warnings: list[str] = Field(default_factory=list)
