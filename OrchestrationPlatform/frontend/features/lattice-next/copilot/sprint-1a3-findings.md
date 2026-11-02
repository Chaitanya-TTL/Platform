# Sprint 1A.3 Findings

## 1. Why are ontology-resolved relationships equal to zero?

Because the ontology evaluator evaluated all five live relationship definitions
and accepted none of their 34 candidate pairs:

- Four definitions returned `evidence-not-found`.
- One definition returned `no-compatible-endpoints`.
- Accepted relationships: `0`.

The 209 canonical relationships are exclusively same-application:
Codebeamer→Codebeamer `62`, Windchill→Windchill `15`, SAP→SAP `92`, and
Configit→Configit `40`.

## 2. Is identity resolution working?

It is executing and persisted five clusters, but it is not producing
cross-application clusters. The five clusters represent four singleton
Codebeamer requirements and one two-entity Windchill cluster. SAP and Configit
entities are absent from clusters.

## 3. Is ontology resolution running?

Yes. The live graph contains five unresolved evaluations for ontology version
`1.1.0`, covering all five definitions. Candidate counts and rejection reasons
are persisted.

## 4. Is relationship materialization running?

Yes, but it materializes zero resolved cross-system relationships because zero
candidates are accepted. It does materialize the canonical-only graph and its
591 fallback traversal paths.

## 5. Are cross-system candidates generated?

Yes. Four definitions generated 34 candidate pairs in total:

- Windchill→SAP: 2
- Windchill→Configit: 8
- Windchill→Codebeamer: 20
- SAP→Configit: 4

The fifth definition generated no compatible source endpoint.

## 6. Are candidates being rejected?

Yes. All generated candidates are rejected by missing governing evidence:
`evidence-not-found`. The no-source-endpoint definition is rejected as
`no-compatible-endpoints`.

## 7. Are impact paths impossible or simply absent?

They are absent because no resolved relationship exists. The graph has zero
impact paths and zero impact chains. The path generator can produce paths from
canonical relationships, but those paths are `POTENTIAL`, non-impact-eligible,
same-system paths.

## 8. Are benchmark expectations valid?

They are valid for the validated synthetic fixture, which contains exact
governed endpoint properties and explicit mapping records. They are not valid
as unconditional expectations for the current live investigation, which lacks
those endpoints/evidence. T8 is a confirmed fixture/data mismatch.

## 9. Is the live graph stale?

The evidence does not support a stale-graph conclusion. The graph revision
matches the canonical revision, ontology version `1.1.0` is present, and five
unresolved evaluations are materialized. Exact execution timestamps are not
stored, so graph age cannot be reported.

## 10. Exact owning layer

**F. Investigation Data**

The exact failure boundary is missing live linkage evidence and endpoint
identity, as confirmed by `evidence-not-found` for 34 candidate pairs and
`no-compatible-endpoints` for one definition. Canonical relationship generation
contains no cross-system pairs, while ontology evaluation and path generation
execute normally over the available data.

## Direct-evidence statement

> The reason there are zero ontology-resolved relationships is that the live
> investigation generates candidate cross-system pairs without the governing
> linkage evidence required by the ontology rules; all 34 candidates are
> rejected as `evidence-not-found`, and the remaining definition has no
> compatible source endpoint. No cross-system canonical relationship exists to
> materialize.

This is an evidence conclusion only. No production behavior was changed.
