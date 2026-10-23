from __future__ import annotations

from datetime import datetime
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field


class ChangeTaskDescriptionExecutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action_plan_id: str = Field(min_length=1)
    plan_hash: str = Field(min_length=64, max_length=64)
    approval_id: str = Field(min_length=1)
    requested_by: str = Field(min_length=1)
    confirmation: str = Field(pattern=r"^EXECUTE_APPROVED_DESCRIPTION_UPDATE$")
    duration: int = Field(default=1, ge=1, le=60)
    idempotency_key: str = Field(default_factory=lambda: f"idem:{uuid4()}", min_length=8, max_length=200)


class ExecutionStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    status: str
    message: str


class ChangeTaskDescriptionExecutionResult(BaseModel):
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
    previous_description: str | None = None
    requested_description: str
    verified_description: str | None = None
    description_modified: bool
    cleanup_complete: bool
    steps: list[ExecutionStep]
    warnings: list[str] = Field(default_factory=list)
    idempotency_key: str
    failed_step: str | None = None
    failure_message: str | None = None
