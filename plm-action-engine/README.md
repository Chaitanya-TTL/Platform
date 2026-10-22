# PLM Action Engine

A separate top-level module in the existing Git repository for governed enterprise write-back.

## Current milestone

`PLAN_ONLY` for one intent:

```text
UPDATE_CHANGE_TASK_DESCRIPTION
```

This version cannot write to Windchill, SAP, Configit, or Codebeamer.

## Run locally

```powershell
cd plm-action-engine
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
pytest
uvicorn plm_action_engine.api.app:app --app-dir src --reload --port 8090
```

Health check:

```text
GET http://localhost:8090/health
```

Create a plan:

```text
POST http://localhost:8090/v1/action-plans
```

Use `samples/update-change-task-description.request.json` as the request body.

## Boundary

The existing platform continues to own prompts, read-only extraction, PLM Brain relationships, and the frontend. This module owns action planning, policy validation, and later approval, execution, verification, and audit.

## Next milestone

Resolve the Windchill Change Task read-only, populate current Description and version, then return an exact before/after preview. No write-back will be added until this is validated.
