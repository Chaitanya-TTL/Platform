# Teamcenter Connected Validation Procedure

Status: blocked pending approved replacement credentials.

Never use credentials recovered from old bundles, Git history, documentation, logs, or generated connector configuration.

When approved credentials and target-environment authorization are available:

1. Run the runtime-evidence script and retain only its redacted JSON output.
2. Confirm Teamcenter server and SOA client compatibility.
3. Validate an existing exact Item ID and verify Item ID ownership in the captured manifest.
4. Validate a nonexistent Item ID and expect `teamcenter-item-not-found`.
5. Validate a structure containing repeated occurrences and confirm distinct BOMLine/occurrence evidence.
6. Validate revision selection with an explicit revision and with no revision.
7. Validate a configured variant structure and compare variant condition/state evidence.
8. Force timeout and verify `timed-out`, process-tree termination, and no late success overwrite.
9. Cancel an active job and verify `cancelled`, final progress, and no late result overwrite.
10. Fail optional Configit processing after Teamcenter output and expect Teamcenter `partial-success` with `configit-transformation-failed`.
11. Run sequential extractions and verify request-scoped artifacts and identity ownership.
12. Attempt concurrent extractions and verify serialization at the legacy pipeline gate.
13. Enumerate saved-query metadata using an approved purpose-built probe. Record query names, entry names, result types, limits, wildcard behavior, authorization behavior, and cancellation. Do not enable name discovery until this evidence is approved.

Do not store credentials, tokens, raw connector responses, PLMXML, complete BOM payloads, or absolute workstation paths in the validation report.
