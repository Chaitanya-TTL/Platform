# PLM Action Engine

A generic governed enterprise action service for Windchill, SAP, Configit, and Codebeamer.

## Version 0.2 milestone

The engine is generic and currently supports `PLAN_ONLY`. It cannot write to an enterprise application.

Registered proof-of-concept tools:

- `windchill.update_change_task_description`
- `windchill.add_bom_component`
- `codebeamer.create_requirement`

The core flow is:

```text
Action request
→ registered typed tool
→ structured plan
→ policy validation
→ future approval
→ future execution
→ future read-back verification
→ future audit
```

## Run

```powershell
cd plm-action-engine
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python -m pytest
python -m uvicorn plm_action_engine.api.app:app --app-dir src --reload --port 8090
```

Open `http://127.0.0.1:8090/docs`.

Endpoints:

- `GET /health`
- `GET /v1/tools`
- `POST /v1/action-plans`

## Safety boundary

The LLM or client may select only registered tools and submit their typed parameters. Arbitrary URLs, HTTP methods, JCo calls, and enterprise payloads are not accepted. Version 0.2 produces plans only.
