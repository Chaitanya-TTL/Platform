# PLM Action Engine

## Version 0.6.0a1

This alpha milestone introduces one narrowly controlled Windchill operation:

```text
Reserve Change Notice
→ verify reservation
→ reserve Change Task
→ verify reservation
→ unreserve Change Task
→ unreserve Change Notice
→ verify cleanup
```

The round-trip requires a stored preview, valid non-expired approval, exact plan hash, unchanged Change Task state, and the explicit confirmation string `RESERVE_AND_RELEASE`.

No Change Task description or business attribute is modified. The service always attempts reservation cleanup in a `finally` block and writes the full outcome to the audit log.

Endpoint:

- `POST /v1/reservation-round-trips`

This alpha must be validated only against approved development/test POC objects.
