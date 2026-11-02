# Sprint 1A.2 Findings

## 1. What benchmark failures are real product failures?

- **T1 is no longer a product failure in the current post-hardening run.** It
  returned a usable evidence summary and did not follow instruction-like text
  embedded in evidence.
- **Provider validation is no longer the cause of M1 or T1.** Bounded provider
  repair and validation diagnostics produced usable responses.
- **Duplicate rendering was a real UI failure.** The finalized answer had a
  competing hidden typewriter render path; that path was removed and covered by
  focused tests.
- **E1 remains a product/data coverage issue to resolve before release.** The
  live answer improved source diversity but did not satisfy the expected
  business-entity coverage. The evidence does not isolate this to prompting
  because the live dataset differs from the synthetic benchmark fixture.

## 2. What benchmark failures are data problems?

- **M1:** The live graph contains four applications but zero ontology-resolved
  cross-system relationships.
- **M2:** The live graph lacks the expected Windchill-to-SAP resolved
  relationship, so the Copilot correctly cannot state its consequence without
  inventing evidence.
- The live snapshot reports 209 canonical relationships and 591 paths, but
  those totals do not establish cross-system connectivity.

## 3. What benchmark failures are fixture problems?

- **T8 is a confirmed benchmark/data mismatch.** `CN-9001` and `MAT-200` are
  present in the synthetic case but absent from the active saved investigation.
  T8 must not be counted as a Copilot failure for this live dataset.
- M1 and M2 are also not valid fixture-equivalent live runs until the intended
  governed cross-system fixture or seeded investigation is loaded.

## 4. Is Sprint 2 blocked?

**Yes, by the explicit Sprint 1A release gate.** This evidence sprint does not
recommend architecture work. The benchmark source of truth still contains
unresolved live-data/fixture alignment failures.

## 5. If blocked, exactly why?

The active saved investigation has application presence but no resolved
cross-system relationship materialization:

`239 entities → 5 identity clusters → 209 canonical relationships → 0 resolved ontology relationships → 591 non-cross-system paths → 0 impact paths`

The intended synthetic benchmark fixture contains governed cross-system mappings
and benchmark-specific identifiers that the live investigation does not contain.
Therefore the current live runs cannot prove the Copilot against the intended
cross-system benchmark contract.

## 6. Which layer is responsible?

| Layer | Finding |
|---|---|
| PLM Brain | Not proven as the direct fault from this evidence package |
| Ontology | No live relationship was resolved; the cause of the missing input is not isolated here |
| Relationship Materialization | **Primary observable boundary responsible for M1/M2 live failure** |
| Retrieval | Not implicated; retrieval preserves zero resolved cross-system relationships |
| Prompting | Not implicated; prompt payload receives no resolved cross-system link |
| Copilot | Provider and validation paths are usable; it does not invent absent relationships |
| Fixture Data | **Responsible for T8 and for the mismatch between offline expectations and live data** |

## Evidence conclusion

The benchmark fails because the active live investigation is not the intended
cross-system benchmark dataset: it contains four source applications but zero
resolved cross-system relationships, and it lacks the T8 identifiers
`CN-9001` and `MAT-200`. The evidence package does not justify a code fix or
architecture change.
