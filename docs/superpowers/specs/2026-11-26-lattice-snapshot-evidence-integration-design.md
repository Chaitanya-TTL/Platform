# Lattice Snapshot Evidence Integration

## Intent

Connect source-authored information already captured in a Lattice investigation to the unified AI runtime, so broad investigation and source-evidence questions can receive cited answers across all represented applications. The user selected the Lattice snapshot as the evidence source and confirmed that authorization comes from the investigation and retrieval should cover every application.

The goal is answer quality through complete, trustworthy context delivery—not a new independent answer path. PLM Brain remains authoritative for entities, relationships, impact paths, and impact chains. Exact source facts and application participation remain typed candidates. Source-authored passages support explanations and citations. `ContextCompiler` remains the only context approval boundary, and `PromptAssembler` remains a renderer.

## Current state found in code

- The runtime has typed source-passage contracts and a retrieval interface, but production DI still registers `UnavailableSourceEvidenceRetriever`.
- The Lattice frontend already projects source evidence from accepted investigation snapshots, but the projection is currently exposed only as development diagnostics. Its field allowlist covers selected Codebeamer, Configit, and Windchill fields; it does not cover SAP and is not a complete view of source-field metadata.
- The internal PLM Brain route pattern already verifies workload identity and a Lattice-signed, investigation-bound authorization decision.
- Exact facts and application participation have separate typed retrieval adapters; they should stay separate from source-passage text.
- The source-passage query requires a resolved subject, so it cannot express an investigation-wide request.
- The runtime now has a typed source-evidence answer field and frontend citation mapping. Authorized source passages can be answered without being promoted to PLM graph claims.
- Context is staged against the configured model window. Stages must account for every approved candidate; a single model request cannot exceed the provider's actual input limit.

## Goals

1. Retrieve investigation-wide source evidence from the accepted Lattice snapshot for every source application represented there, including SAP when source-authored fields are present.
2. Use per-field source lineage and authority already carried by the canonical snapshot and factual-evidence contracts; retain source field, native record, revision, timestamps, citation linkage, and freshness where supplied.
3. Bind every retrieval result to the investigation, snapshot revision, request/trace, and the Lattice authorization decision before it reaches `ContextCompiler`.
4. Pass all eligible candidates through the existing compiler and its stages. Relevance may order processing, but must not silently discard lower-ranked eligible candidates. Do not add a global top-k, confidence cutoff, or application-level result cap.
5. Preserve source-operation and projection diagnostics so missing or incomplete source data is visible to the answer path instead of appearing as an unqualified absence.
6. Preserve the existing separation between graph claims, exact facts, application participation, and source passages, with citations returned to the frontend.
7. Preserve stale source evidence with its temporal metadata when it is relevant; do not present it as current. Reject it only when a demonstrated question-specific correctness rule requires current evidence.

## Non-goals

- Adding or selecting an external vector/document index; the selected source is the current Lattice investigation snapshot.
- Reconstructing source data that was never captured in Lattice.
- Treating examples in the prompt as evidence or hardcoding Steering-specific answers.
- Changing model weights or adding an independent frontend answer composer.
- Making unbounded data fit in one model request. The runtime's configured model input/output limits remain real provider constraints; staged calls must preserve all approved candidates across stages.

## Anti-goals

- Do not reintroduce arbitrary result caps, confidence thresholds, or silent field/source filters.
- Do not let source passages create or strengthen PLM Brain relationships or impact claims.
- Do not load or return source text before the Lattice investigation authorization is verified.
- Do not describe a partial/failed source operation as complete coverage.
- Do not claim that every external source-system record is present when the Lattice snapshot does not contain it.

## Approaches considered

### A. Project source-lineaged fields from the Lattice snapshot — selected

Expose the existing snapshot projection through the protected internal service pattern, expand it to all source-authored fields that have valid field-level provenance, and adapt those records into runtime passage candidates. This matches the user's stated authorization and data source and avoids an unconfigured index.

### B. Connect a dedicated document index

This would support indexed document retrieval but is not actionable without an actual provider, endpoint, query contract, and access-policy integration. The repository has none configured, so inventing one would create a fake production path.

### C. Keep source passages unavailable and rely on graph/facts only

This preserves current behavior but fails the requested source-authored evidence and broad coverage goals.

## Design

1. **Lattice projection:** Extend the typed source-evidence projection to enumerate source-authored text values across supported applications from the accepted investigation snapshot. Include a field only when its source authority, field name, native identity, and provenance/citation linkage are available from the snapshot metadata. Preserve the reason for any field that cannot be represented in projection diagnostics. Do not use the former narrow application-specific field allowlist as an unexplained exclusion mechanism.
2. **Protected route:** Add an internal source-evidence route alongside the existing PLM Brain evidence routes. Verify the same workload identity and Lattice-signed decision bound to the investigation and request before projection or response. Return the snapshot revision, decision/request/trace binding, projected source records, and completeness/source-operation diagnostics. Keep authorization enforcement server-side.
3. **Runtime adapter:** Extend the PLM Brain client/adapter seam to request source evidence for either a resolved subject or the whole investigation. An absent subject means investigation-wide retrieval, not an empty or failed query. Carry requested source applications and exact identifiers when present; broad questions request all represented applications.
4. **Typed candidate mapping:** Map each eligible source field to a stable passage/evidence identity and preserve source application, native record, field location, source revision, observation/capture/effective dates, freshness, provenance, authorization decision, and deep link when available. Keep exact structured facts and application participation on their existing typed paths.
5. **Compilation and synthesis:** Validate snapshot and authorization bindings once in `ContextCompiler`. Preserve temporal status and provenance in the approved package. Send every approved passage/fact/participation/graph candidate in one or more measured model stages. Aggregate all stage claims and citations; do not convert passages into graph claims. Source-only answers are valid when a passage assertion is cited.
6. **Diagnostics and gaps:** Carry source-operation status and projection omissions into the context in a compact, non-sensitive form. An unavailable or partial source is reported as such; it does not erase otherwise supported facts or graph answers. Telemetry must not record source text or credentials.

## Risk rules and tradeoffs

- **Require source lineage and investigation authorization.** Risk prevented: exposing generated, unattributed, or unauthorized content as source-authored evidence. This risk is real because canonical properties can be derived or lack field-specific provenance. Necessary because source passages are cited as native evidence. Tradeoff: a field that is present but has no verifiable lineage is reported as unprojectable rather than cited.
- **Preserve temporal metadata and distinguish stale from current.** Risk prevented: presenting historical content as current. This risk is real because the snapshot projection can contain stale records. Necessary for correct temporal claims. Tradeoff: an answer may need to label a source as stale/dated; the passage is not silently discarded.
- **Use the provider's configured context budget with staged calls.** Risk prevented: exceeding the real model window or losing later-stage candidates. This is an operational constraint, not a relevance cutoff. Tradeoff: more model calls for large investigations; all approved candidates still need to be accounted for.
- **Report snapshot incompleteness/source operation status.** Risk prevented: claiming comprehensive coverage when an application failed or was partial. This is a correctness/provenance risk. Tradeoff: the answer may state a specific coverage gap rather than imply full coverage.

## Validation

- Projection tests cover all source applications represented by source-lineaged fields, including SAP, while preserving exclusion diagnostics for missing or non-source authority/provenance.
- Route tests verify workload identity, investigation-bound decision, request correlation, and snapshot revision binding before evidence is returned.
- Adapter tests verify broad requests cover all projected records and application-specific requests preserve their requested scope without a top-k or score cutoff.
- Compiler tests prove each eligible candidate is staged or has an explicit provenance/authorization/correctness omission, including stale passages with temporal metadata.
- Runtime and frontend tests prove source-evidence-only answers return citations, while source passages never become graph relationships.
- Run the focused projection, adapter, compiler, runtime, and Copilot suites. Live provider evaluation remains separate from offline code tests.

## Builder decisions

- Use the Lattice snapshot because the user selected it; do not add an external index.
- Use existing source-field lineage and authorization contracts rather than inventing a second policy engine.
- Reuse the existing investigation-level `investigation:read-impact-evidence` Lattice decision for source passages, as confirmed by the user.
- Preserve all eligible candidates through measured staging; no arbitrary retrieval cap or relevance cutoff.
- Treat “all information” as all eligible information actually present in the authorized snapshot, and surface snapshot/source-operation gaps explicitly.
- If per-field authorization or citation metadata is absent, do not fabricate it; surface the omission and identify the metadata contract needed to include that field.
