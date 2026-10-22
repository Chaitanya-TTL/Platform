from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from dotenv import dotenv_values


class WindchillClientError(RuntimeError):
    pass


@dataclass(frozen=True)
class WindchillSettings:
    base_url: str
    username: str
    password: str
    timeout_seconds: float = 30.0

    @classmethod
    def from_env_file(cls, path: str = ".env") -> "WindchillSettings":
        values = dotenv_values(path)
        missing = [
            key
            for key in ("WINDCHILL_BASE_URL", "WINDCHILL_USERNAME", "WINDCHILL_PASSWORD")
            if not values.get(key)
        ]
        if missing:
            raise WindchillClientError(
                f"Missing Windchill configuration values: {', '.join(missing)}"
            )
        return cls(
            base_url=str(values["WINDCHILL_BASE_URL"]).rstrip("/"),
            username=str(values["WINDCHILL_USERNAME"]),
            password=str(values["WINDCHILL_PASSWORD"]),
        )


class WindchillClient:
    """Read-only WRS client. Version 0.3 exposes GET operations only."""

    def __init__(
        self,
        settings: WindchillSettings,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._settings = settings
        self._transport = transport

    def _get_json(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        url = f"{self._settings.base_url}{path}"
        try:
            with httpx.Client(
                auth=(self._settings.username, self._settings.password),
                headers={"Accept": "application/json"},
                timeout=self._settings.timeout_seconds,
                transport=self._transport,
            ) as client:
                response = client.get(url, params=params)
        except httpx.HTTPError as exc:
            raise WindchillClientError(f"Windchill request failed: {exc}") from exc

        if response.status_code == 401:
            raise WindchillClientError("Windchill authentication failed")
        if response.status_code == 403:
            raise WindchillClientError("Windchill access denied")
        if response.status_code >= 400:
            raise WindchillClientError(
                f"Windchill returned HTTP {response.status_code}: {response.text[:300]}"
            )

        content_type = response.headers.get("content-type", "")
        if "json" not in content_type.lower():
            raise WindchillClientError(
                f"Expected JSON from Windchill, received {content_type or 'unknown content type'}"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise WindchillClientError("Windchill returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise WindchillClientError("Windchill JSON root must be an object")
        return payload

    def find_change_task_by_number(self, number: str) -> dict[str, Any] | None:
        escaped_number = number.replace("'", "''")
        payload = self._get_json(
            "/servlet/odata/v6/ChangeMgmt/ChangeTasks",
            params={"$filter": f"Number eq '{escaped_number}'"},
        )
        records = payload.get("value", [])
        if not isinstance(records, list):
            raise WindchillClientError("Windchill ChangeTasks response has no valid value array")
        if not records:
            return None
        if len(records) > 1:
            latest = [record for record in records if record.get("Latest") is True]
            if len(latest) == 1:
                return latest[0]
            raise WindchillClientError(
                f"Multiple Change Tasks found for number {number}; target is ambiguous"
            )
        return records[0]

    def get_change_task_by_oid(self, oid: str) -> dict[str, Any] | None:
        escaped_oid = oid.replace("'", "''")
        try:
            return self._get_json(
                f"/servlet/odata/v6/ChangeMgmt/ChangeTasks('{escaped_oid}')"
            )
        except WindchillClientError as exc:
            if "HTTP 404" in str(exc):
                return None
            raise
