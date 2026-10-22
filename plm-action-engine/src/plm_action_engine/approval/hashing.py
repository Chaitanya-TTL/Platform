from __future__ import annotations

import hashlib
import json
from typing import Any


def compute_plan_hash(payload: dict[str, Any]) -> str:
    """Return a deterministic SHA-256 hash for approval-relevant plan data."""
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()
