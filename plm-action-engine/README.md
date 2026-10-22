# PLM Action Engine

## Version 0.4

Version 0.4 remains strictly `PLAN_ONLY`.

It supports:

- Governed enterprise tool registry
- Read-only Windchill target resolution
- Exact before/after previews
- Deterministic SHA-256 plan hashes
- Approval records bound to an exact preview hash
- Approval expiry and validation
- Rejection of stale or modified approval requests

It does not perform enterprise writes, reservations, PATCH requests, state transitions, or BOM modifications.

## Flow

```text
Action request
→ Windchill read
→ exact preview
→ immutable plan hash
→ approval for exact hash
→ approval validation
→ future execution layer
```

## Endpoints

- `GET /health`
- `GET /v1/tools`
- `POST /v1/action-plans`
- `POST /v1/action-previews`
- `POST /v1/approvals`
- `GET /v1/approvals/validate`

## Important limitation

Preview and approval repositories are in memory in v0.4. Restarting the API clears them. Persistent audit storage will be added before write execution.
