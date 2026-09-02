# Engineering Intelligence API

`POST /api/engineering/intelligence/assemble` accepts an existing `UnifiedProductIntelligence` result and returns `EngineeringIntelligenceInvestigation` V1.

The endpoint is deterministic and does not invoke source systems. Parallel discovery and extraction remain owned by existing federated orchestrators.

Responses:
- 200: valid investigation assembled.
- 422: investigation violates contract invariants.

A future read endpoint can assemble by immutable federated extraction ID once unified intelligence lookup is exposed without coupling the controller to in-memory internals.
