# Backend connector security containment

Status: `operator-action-required`

The implementation does not certify credential rotation, working-tree cleanliness, or Git-history cleanliness. Operators must rotate exposed credentials, scan the current tree and history, remove tracked secrets, and verify that retired credentials no longer authenticate.

The included scanner reports only repository-relative path, rule ID, severity, and line number. It intentionally suppresses matching values and complete source lines.
