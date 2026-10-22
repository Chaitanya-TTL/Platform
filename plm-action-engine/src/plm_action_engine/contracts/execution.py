from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ExecutionReadinessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_plan_id: str = Field(min_length=1)
    plan_hash: str = Field(min_length=64, max_length=64)
    approval_id: str = Field(min_length=1)
    requested_by: str = Field(min_length=1)


class ReadinessCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    satisfied: bool
    message: str
    blocking: bool = True


class ExecutionReadinessResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    readiness_id: str
    action_plan_id: str
    plan_hash: str
    approval_id: str
    checked_at: datetime
    checks: list[ReadinessCheck]
    ready_for_execution: bool
    dry_run_only: bool = True
    target_snapshot: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
