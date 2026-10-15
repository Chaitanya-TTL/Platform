"""Validated server-side Codebeamer configuration."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
import os


def _bool(value: str | None, default: bool = True) -> bool:
    if value is None: return default
    normalized=value.strip().casefold()
    if normalized in {"1","true","yes","on"}: return True
    if normalized in {"0","false","no","off"}: return False
    raise ValueError(f"Invalid boolean value: {value!r}")

def _ids(value: str | None) -> frozenset[int]:
    if not value or not value.strip(): return frozenset()
    try: return frozenset(int(part.strip()) for part in value.split(",") if part.strip())
    except ValueError as exc: raise ValueError("Project lists must contain comma-separated integer IDs.") from exc

def _api_url(value: str) -> str:
    raw=value.strip().rstrip("/")
    if not raw: raise ValueError("CODEBEAMER_BASE_URL is required.")
    parsed=urlparse(raw)
    if parsed.scheme not in {"https","http"} or not parsed.netloc: raise ValueError("CODEBEAMER_BASE_URL must be an absolute HTTP(S) URL.")
    if parsed.scheme != "https" and not _bool(os.getenv("CODEBEAMER_ALLOW_HTTP"),False): raise ValueError("Codebeamer requires HTTPS unless CODEBEAMER_ALLOW_HTTP=true is explicitly configured.")
    if raw.endswith("/cb/api/v3"): return raw
    if raw.endswith("/cb"): return f"{raw}/api/v3"
    return f"{raw}/cb/api/v3"

@dataclass(frozen=True, slots=True)
class CodebeamerConfig:
    base_url: str
    instance_key: str
    auth_mode: str = "basic"
    username: str | None = None
    password: str | None = None
    timeout_seconds: float = 30.0
    page_size: int = 100
    max_pages: int = 1000
    max_concurrency: int = 4
    verify_tls: bool = True
    ca_bundle: str | None = None
    project_allowlist: frozenset[int] = frozenset()
    project_denylist: frozenset[int] = frozenset()

    def __post_init__(self) -> None:
        object.__setattr__(self,"base_url",_api_url(self.base_url))
        key=self.instance_key.strip()
        if not key: raise ValueError("CODEBEAMER_INSTANCE_KEY is required.")
        object.__setattr__(self,"instance_key",key)
        mode=self.auth_mode.strip().casefold()
        if mode not in {"basic","none"}: raise ValueError("CODEBEAMER_AUTH_MODE must be 'basic' or 'none'.")
        object.__setattr__(self,"auth_mode",mode)
        if mode=="basic" and (not self.username or not self.password): raise ValueError("Basic authentication requires CODEBEAMER_USERNAME and CODEBEAMER_PASSWORD.")
        if self.timeout_seconds<=0: raise ValueError("CODEBEAMER_REQUEST_TIMEOUT must be positive.")
        if not 1<=self.page_size<=500: raise ValueError("CODEBEAMER_PAGE_SIZE must be between 1 and 500.")
        if self.max_pages<1: raise ValueError("CODEBEAMER_MAX_PAGES must be positive.")
        if not 1<=self.max_concurrency<=32: raise ValueError("CODEBEAMER_MAX_CONCURRENCY must be between 1 and 32.")
        overlap=self.project_allowlist & self.project_denylist
        if overlap: raise ValueError(f"Project IDs cannot be both allowed and denied: {sorted(overlap)}")
        if self.ca_bundle and not Path(self.ca_bundle).exists(): raise ValueError(f"Configured CA bundle does not exist: {self.ca_bundle}")

    @property
    def httpx_verify(self) -> bool | str: return self.ca_bundle or self.verify_tls
    @property
    def redacted(self) -> dict[str,object]:
        return {"instanceKey":self.instance_key,"baseUrl":self.base_url,"authMode":self.auth_mode,"usernameConfigured":bool(self.username),"passwordConfigured":bool(self.password),"tlsVerification":self.verify_tls,"caBundleConfigured":bool(self.ca_bundle),"timeoutSeconds":self.timeout_seconds,"pageSize":self.page_size,"maxPages":self.max_pages,"maxConcurrency":self.max_concurrency,"projectAllowlist":sorted(self.project_allowlist),"projectDenylist":sorted(self.project_denylist)}

    @classmethod
    def from_env(cls) -> "CodebeamerConfig":
        return cls(base_url=os.getenv("CODEBEAMER_BASE_URL",""),instance_key=os.getenv("CODEBEAMER_INSTANCE_KEY",""),auth_mode=os.getenv("CODEBEAMER_AUTH_MODE","basic"),username=os.getenv("CODEBEAMER_USERNAME"),password=os.getenv("CODEBEAMER_PASSWORD"),timeout_seconds=float(os.getenv("CODEBEAMER_REQUEST_TIMEOUT","30")),page_size=int(os.getenv("CODEBEAMER_PAGE_SIZE","100")),max_pages=int(os.getenv("CODEBEAMER_MAX_PAGES","1000")),max_concurrency=int(os.getenv("CODEBEAMER_MAX_CONCURRENCY","4")),verify_tls=_bool(os.getenv("CODEBEAMER_VERIFY_TLS"),True),ca_bundle=os.getenv("CODEBEAMER_CA_BUNDLE") or None,project_allowlist=_ids(os.getenv("CODEBEAMER_PROJECT_ALLOWLIST")),project_denylist=_ids(os.getenv("CODEBEAMER_PROJECT_DENYLIST")))
