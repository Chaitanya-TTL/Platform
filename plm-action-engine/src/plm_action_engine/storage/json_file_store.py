from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from threading import RLock
from typing import Any


class JsonFileStore:
    """Small local JSON store using atomic replacement for POC persistence."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        if not self.path.exists():
            self._write({})

    def _read(self) -> dict[str, Any]:
        with self._lock:
            if not self.path.exists():
                return {}
            text = self.path.read_text(encoding="utf-8").strip()
            if not text:
                return {}
            payload = json.loads(text)
            if not isinstance(payload, dict):
                raise ValueError(f"Store root must be an object: {self.path}")
            return payload

    def _write(self, payload: dict[str, Any]) -> None:
        with self._lock:
            fd, temp_path = tempfile.mkstemp(
                prefix=f"{self.path.name}.", suffix=".tmp", dir=self.path.parent
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    json.dump(payload, handle, indent=2, sort_keys=True, ensure_ascii=False)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_path, self.path)
            finally:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)

    def put(self, key: str, value: dict[str, Any]) -> None:
        payload = self._read()
        payload[key] = value
        self._write(payload)

    def get(self, key: str) -> dict[str, Any] | None:
        value = self._read().get(key)
        return value if isinstance(value, dict) else None

    def values(self) -> list[dict[str, Any]]:
        return [value for value in self._read().values() if isinstance(value, dict)]
