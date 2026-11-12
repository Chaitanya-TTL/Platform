# Sprint 1A.5 Context Budget Trace

## Instrumentation

`buildInvestigationContext` now returns `omissions.budgetTrace`:

- `before`: available entity, relationship, evidence, path, impact-path,
  impact-chain, and reasoning-narrative counts before budget trimming;
- `after`: the corresponding counts in the composed packet;
- `protectedRelationshipId`: the selected complete relationship group when
  one exists.

The trace is per packet and records actual counts; it does not persist
investigation data or write to the running application.

## Trim and protection behavior

The existing context budget is unchanged. The trim sequence removes optional
reasoning artifacts and other content before the relationship/evidence/entity
categories. If a relationship has two available endpoints and all linked
evidence records are present, the builder prioritizes that group and protects
minimum slots for its relationship, endpoints, evidence, and a matching
impact path when available. This is bounded retention, not unlimited
retention.

If the smallest supported packet still exceeds its configured character
budget, the compact fallback removes optional summaries while retaining the
protected relationship group and its linked evidence. The packet reports the
post-fallback counts in its trace.

## Runtime measurement

No before/after numeric packet counts are reported because the context
preservation tests were authored but not run. The two test inputs are the
production-default budget and the 2,048-character minimum budget.
