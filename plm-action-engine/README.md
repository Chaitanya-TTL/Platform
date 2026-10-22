# PLM Action Engine

## Version 0.5

Version 0.5 is a persistent **dry-run readiness** milestone. It adds:

- Persistent JSON storage for previews and approvals
- Append-only JSONL audit events
- Live Windchill pre-execution revalidation
- CSRF nonce availability verification without exposing the token
- VersionID, LastModified, current-value, and reservation rechecks
- `POST /v1/execution-readiness`

It performs no reserve, unreserve, PATCH, POST, PUT, DELETE, lifecycle transition, or enterprise write operation.

Local POC data is stored under `data/`, which is ignored by Git. A production database is still required before deployment.
