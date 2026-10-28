# Lattice Consequence Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help an engineer understand a meaningful cross-system consequence faster and more clearly through relationship-aware Copilot answers and user-directed supporting detail.

**Architecture:** Load the authoritative relationship definitions on the server, select only relevant directed application-pair sections, and combine their semantics with coherent, source-backed paths from the active investigation. Keep the conversation as the primary surface; reveal the explanation and cited path in a sidecar only when the user asks why, with the existing graph available as a further optional inspection.

**Tech Stack:** TypeScript, Next.js 16, React 19, CopilotKit, Azure OpenAI, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-27-lattice-consequence-awareness-design.md`

## Global Constraints

- `docs/relationships.md` is the authoritative relationship model; do not create a competing relationship catalog.
- Relationship definitions explain semantics, not whether an instance exists; active investigation data is the evidence for instance-level facts.
- A runtime relationship without a matching directed section in `docs/relationships.md` may be reported as an observed connection, but must not be used to synthesize its business consequence.
- Potential impact does not prove causation; preserve each mapping's direction and stated limits.
- Support Teamcenter and future systems only when their mappings are documented; never infer an undocumented link.
- Keep provenance, native identifiers, source status, freshness, and uncertainty with the supporting path.
- Use the active investigation snapshot for product behavior; synthetic fixtures are test-only and cannot stand in for connected enterprise evidence.
- Do not describe a missing, ambiguous, stale, partial, or name-only match as proof of “no impact” or as a confirmed consequence.
- Do not add approval/governance workflows, execute recommendations, or write to source systems.
- Keep the answer and evolving inquiry primary; reveal cited explanation on demand and the graph only as an optional deeper view.
- Do not restore a report/dashboard, finding card, graph-first view, or always-visible evidence panel.
- Improve context, prompts, answer quality, and evaluation before considering model-weight fine-tuning; this plan does not train model weights.
- Do not simulate model activity or progress; the current model response is non-streaming.

## Review Focus

1. **Partial, stale, conflicting, or ambiguous identity data:** preserve the caveat and do not claim a consequence beyond what the connected path supports. Test in Task 2 with the existing partial/stale fixtures and new ambiguous-identity coverage.
2. **Potential-impact paths:** explain possible downstream review/impact without claiming that one system caused a transaction or change in another. Test in Tasks 1 and 3 using the Windchill/SAP mapping and a synthetic `MAY_IMPACT` path.
3. **Context-budget truncation:** keep a selected relationship path, both endpoints, and its supporting evidence together, or disclose that the path was omitted. Test in Task 2 with a deliberately small `maxContextChars`.
4. **Undocumented application pairs, including Teamcenter:** provide no invented semantics; preserve an observed link only as a recorded connection and state the limitation. Test in Tasks 1 and 2. Also verify the documented Codebeamer-to-Configit section supports its existing runtime rule.
5. **Distractor records and answer duplication:** prioritize the user's focal engineering consequence, avoid listing unrelated records, and do not repeat claims/evidence in both the chat and sidecar. Test in Tasks 3 and 4.

## File Map

- `frontend/features/lattice-next/copilot/relationship-guidance.ts` — pure parser and selector for directed application-pair sections in `relationships.md`.
- `frontend/features/lattice-next/copilot/contracts.ts` — typed relationship-guidance field in the model context packet.
- `frontend/features/lattice-next/copilot/context-builder.ts` — question-aware path selection, relationship semantics, and coherent budget trimming.
- `frontend/features/lattice-next/plm-brain/universal/catalog/universal-rules.ts` — audit the five existing runtime rules against the authoritative document; do not add a competing map or silently treat an undocumented rule as explained.
- `frontend/features/lattice-next/copilot/execute-copilot-turn.ts` — server-side relationship-document loading, prompt assembly, and explicit load failure.
- `frontend/features/lattice-next/copilot/policy.ts` — separate relationship semantics from investigation facts and define consequence-first answer behavior.
- `frontend/features/lattice-next/copilot/evals/cases.ts` and `metrics.ts` — synthetic cross-system consequence cases and required-path citation coverage.
- `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx` — concise narrative answer and an explicit “Why?” entry point.
- `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx` — on-demand explanation sidecar; remove the Evidence/Graph/Review workbench tabs and keep the graph optional.
- Existing focused Vitest suites under `frontend/features/lattice-next/copilot/tests`, `copilot/evals`, `workspace/tests`, and `tests` — regression coverage.
- `frontend/next.config.ts` — include `../docs/relationships.md` in the server output trace if required by the production build.

---

### Task 1: Parse Authoritative Relationship Guidance

**Files:**
- Create: `frontend/features/lattice-next/copilot/relationship-guidance.ts`
- Test: `frontend/features/lattice-next/copilot/tests/relationship-guidance.test.ts`
- Read: `docs/relationships.md`

**Interfaces:**
- Produces:
  - `RelationshipApplicationPair = { sourceApplication: string; targetApplication: string }`
  - `RelationshipGuidanceSection = { sourceApplication: string; targetApplication: string; heading: string; content: string }`
  - `parseRelationshipGuidance(markdown: string): readonly RelationshipGuidanceSection[]`
  - `selectRelationshipGuidance(sections: readonly RelationshipGuidanceSection[], pairs: readonly RelationshipApplicationPair[]): readonly RelationshipGuidanceSection[]`
- Parse only directed `###` application-pair headings such as `Windchill to SAP`; retain their subordinate content through the next `###` or higher-level heading.
- Match requested pairs by normalized application names and direction. Do not treat a reverse mapping as equivalent to a forward mapping.

- [ ] **Step 1: Write the failing parser tests**

  Add tests named:
  - `selects_only_the_requested_directed_application_sections`
  - `retains_the_potential_impact_and_causation_limit`
  - `does_not_infer_an_undocumented_teamcenter_pair`
  - `selects_the_documented_codebeamer_to_configit_section`
  - `ignores_non_pair_and_nested_headings`

  Use the actual `docs/relationships.md` for the supported Windchill/SAP, Windchill/Configit, and Codebeamer/Configit assertions; verify an unrelated pair and Teamcenter return no section.

  Required assertions:

  ```ts
  expect(selectRelationshipGuidance(sections, [
    { sourceApplication: "windchill", targetApplication: "sap" },
  ])).toContainEqual(expect.objectContaining({
    sourceApplication: "Windchill",
    targetApplication: "SAP",
  }));
  expect(selectRelationshipGuidance(sections, [
    { sourceApplication: "codebeamer", targetApplication: "configit" },
  ])).toContainEqual(expect.objectContaining({
    sourceApplication: "Codebeamer",
    targetApplication: "Configit",
  }));
  expect(selectRelationshipGuidance(sections, [
    { sourceApplication: "teamcenter", targetApplication: "sap" },
  ])).toEqual([]);
  expect(windchillSapSection.content).toContain("MAY_IMPACT");
  expect(windchillSapSection.content).toMatch(/must never be claimed to have caused/i);
  ```

- [ ] **Step 2: Run the tests and verify they fail**

  Run from `frontend`: `npm test -- features/lattice-next/copilot/tests/relationship-guidance.test.ts`

  Expected: FAIL because the parser and selector are not defined.

- [ ] **Step 3: Implement the parser and directed selector**

  Implement the two interfaces above without adding a second application-mapping registry. Keep the parsing pure so context-building tests can supply synthetic Markdown.

- [ ] **Step 4: Run the parser tests**

  Run: `npm test -- features/lattice-next/copilot/tests/relationship-guidance.test.ts`

  Expected: PASS for all five named tests.

- [ ] **Step 5: Commit the parser**

  ```bash
  git add OrchestrationPlatform/frontend/features/lattice-next/copilot/relationship-guidance.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/relationship-guidance.test.ts
  git commit -m "feat: parse authoritative relationship guidance"
  ```

### Task 2: Build Coherent Relationship-Aware Context

**Files:**
- Modify: `frontend/features/lattice-next/copilot/contracts.ts`
- Modify: `frontend/features/lattice-next/copilot/context-builder.ts`
- Test: `frontend/features/lattice-next/copilot/tests/context-builder.test.ts`
- Test: `frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`
- Read: `frontend/features/lattice-next/plm-brain/universal/catalog/universal-rules.ts`

**Interfaces:**
- Consumes Task 1's `RelationshipGuidanceSection`, `parseRelationshipGuidance`, and `selectRelationshipGuidance`.
- Extend `ContextBuilderOptions` with `relationshipDocument?: string`.
- Extend `CopilotContextPacket` with `relationshipGuidance: readonly RelationshipGuidanceSection[]`.
- Extend `CopilotEntityContext` with `identityQuality: "native" | "deterministic-derived" | "provisional"`.
- Extend `CopilotRelationshipContext` and `CopilotUnresolvedEvaluationContext` with `semanticGuidanceAvailable: boolean`.
- Extend `CopilotRelationshipContext` with `identitySupported: boolean`, false when either endpoint has provisional identity quality.
- Add `sourceApplication` and `targetApplication` to `CopilotUnresolvedEvaluationContext` so its directed pair can be matched against the authoritative document.
- Keep `buildInvestigationContext(snapshot, message, options?)` as the context-builder entry point.
- Choose the focal entity by exact native identifier when present; otherwise retain the current relevance-ranked focus. Build candidate directed application pairs from observed relationships and unresolved evaluation candidates touching that focus; rank them by path relevance and include only their documented sections.
- Traverse observed edges outward from the focus in their recorded direction; prioritize connected paths by proximity to the focus, then existing query relevance, with the existing context item and character budgets as the only limits.
- A relationship definition may describe a relevant possible path, but must never add an observed relationship or serve as evidence that the path exists.
- A relationship with a provisional endpoint may remain visible as an uncertain candidate, but it is not eligible as a confirmed consequence path.
- Keep an observed relationship whose pair is undocumented as a recorded fact, set `semanticGuidanceAvailable` to false, add an uncertainty that its consequence cannot be interpreted from the authoritative model, and exclude it from consequence synthesis. Verify that `CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL` is marked as documented because `relationships.md` contains the Codebeamer-to-Configit section.
- Under `maxContextChars`, retain a selected relationship with both endpoints and its supporting evidence as a unit. If that cannot fit, report the omission in `omissions` and `uncertainties`.

- [ ] **Step 1: Write the failing path-integrity and mapping tests**

  Add tests named:
  - `includes_relationship_guidance_for_the_selected_path`
  - `preserves_path_endpoints_and_evidence_when_context_is_trimmed`
  - `does_not_create_a_relationship_from_a_name_only_match`
  - `does_not_assert_impact_for_provisional_identity_candidates`
  - `flags_an_observed_teamcenter_pair_without_documented_semantics`
  - `marks_codebeamer_to_configit_runtime_rule_as_documented`
  - `preserves_partial_and_stale_source_uncertainty_with_relationship_guidance`

  The trimming test must assert that any retained relationship has both endpoint entities and its available evidence citation; otherwise the packet must identify the omitted relationship path. The Teamcenter test must preserve any actual edge as an observed fact, assert no Teamcenter mapping is invented, and set `semanticGuidanceAvailable: false`. The runtime-rule test must assert that the Codebeamer-to-Configit relationship has `semanticGuidanceAvailable: true`.

  Required assertions:

  ```ts
  expect(packet.relationships).toContainEqual(expect.objectContaining({
    relationshipId: "runtime:teamcenter-link",
    semanticGuidanceAvailable: false,
  }));
  expect(packet.uncertainties.join(" ")).toMatch(/cannot be interpreted.*authoritative/i);
  expect(packet.relationships).toContainEqual(expect.objectContaining({
    relationshipId: "runtime:cb-configit",
    semanticGuidanceAvailable: true,
  }));
  const provisionalPath = packet.relationships.find((relationship) => relationship.relationshipId === "provisional:impact");
  expect(provisionalPath).toMatchObject({ identitySupported: false });
  expect(packet.uncertainties.join(" ")).toMatch(/provisional identity/i);
  for (const relationship of packet.relationships) {
    expect(packet.entities.some((entity) => entity.entityId === relationship.sourceEntityId)).toBe(true);
    expect(packet.entities.some((entity) => entity.entityId === relationship.targetEntityId)).toBe(true);
  }
  ```

- [ ] **Step 2: Run the tests and verify they fail**

  Run from `frontend`: `npm test -- features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

  Expected: FAIL because the packet has no relationship-guidance field and independent category trimming can separate a path from its endpoints.

- [ ] **Step 3: Add relationship guidance and coherent path selection**

  Add the typed packet fields and optional document input. Select only directed guidance sections for relevant observed or unresolved paths, rank connected paths around the focal entity ahead of lexical distractors, flag undocumented runtime pairs, and revise budget trimming so paths and their endpoints/evidence remain coherent.

- [ ] **Step 4: Run context and evaluation tests**

  Run: `npm test -- features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

  Expected: PASS, including the new tests and existing native-ID, investigation-isolation, prompt-injection, and oversized-context checks.

- [ ] **Step 5: Commit relationship-aware context**

  ```bash
  git add OrchestrationPlatform/frontend/features/lattice-next/copilot/contracts.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/context-builder.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/context-builder.test.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts
  git commit -m "feat: preserve relationship paths in copilot context"
  ```

### Task 3: Improve Consequence Answers and Evaluate Their Grounding

**Files:**
- Modify: `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`
- Modify: `frontend/features/lattice-next/copilot/policy.ts`
- Modify: `frontend/features/lattice-next/copilot/evals/cases.ts`
- Modify: `frontend/features/lattice-next/copilot/evals/metrics.ts`
- Create: `frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`
- Test: `frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts`
- Modify if required: `frontend/next.config.ts`

**Interfaces:**
- Consumes Task 2's `ContextBuilderOptions.relationshipDocument` and `CopilotContextPacket.relationshipGuidance`.
- Preserve the current `CopilotAnswer` JSON shape and validation contract; no new approval workflow or source-system action is introduced.
- Load `../docs/relationships.md` from the server request path and pass it to `buildInvestigationContext`.
- If the authoritative document cannot be loaded or included in the production server output, return a clear service failure before contacting the model; do not silently omit relationship semantics.
- Extend `CopilotEvaluationCase` with optional `expectedInsight` and `requiredRelationshipIds`; extend `CopilotEvaluationRun` with optional `requiredRelationshipCitationIds`; report `requiredPathCitationCoverage` only when required citations are supplied.
- Compute `requiredPathCitationCoverage` from required relationship citation IDs present in factual-claim and recommendation citations; do not infer answer quality from citation volume.
- Bump `COPILOT_POLICY_VERSION` when the prompt behavior changes.

- [ ] **Step 1: Write failing outbound-request and evaluation tests**

  Add tests named:
  - `includes_relevant_relationship_guidance_in_the_model_context`
  - `fails_clearly_without_contacting_the_model_when_relationship_guidance_is_unavailable`
  - `separates_relationship_semantics_from_instance_evidence`
  - `does_not_require_a_fixed_sentence_or_claim_count`
  - `measures_citation_coverage_for_the_required_consequence_path`

  Add synthetic evaluation cases for a supported cross-system consequence, a `MAY_IMPACT` path that must not be described as causation, an undocumented Teamcenter path, and an unrelated lexical distractor. Each case must state the intended insight and the relationship citation needed to support it.

  Required assertions:

  ```ts
  expect(requestContext.relationshipGuidance).toContainEqual(expect.objectContaining({
    sourceApplication: "Windchill",
    targetApplication: "SAP",
  }));
  expect(provider).not.toHaveBeenCalled(); // when the authoritative document cannot be loaded
  expect(metrics.requiredPathCitationCoverage).toBe(1); // when the required path citation is present
  ```

- [ ] **Step 2: Run the tests and verify they fail**

  Run from `frontend`: `npm test -- features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

  Expected: FAIL because the request does not yet load relationship definitions or measure required-path citation coverage.

- [ ] **Step 3: Load authoritative guidance and update the answer policy**

  Load the document server-side, inject it into context construction, and trace it into the production server output where required. Handle read/trace failure explicitly.

  Update the system policy and response-format text so the answer leads with the supported engineering consequence and why it matters, includes relevant uncertainty, and uses claims/citations as support without a fixed two-sentence or three-claim cap. State that relationship definitions explain semantics but do not prove a specific instance or causation.

- [ ] **Step 4: Add path-citation evaluation**

  Extend synthetic evaluation cases and `scoreCopilotEvaluation` with required relationship-path citation coverage. Keep the quality review focused on consequence relevance, source support, semantic limits, clarity, and usefulness; do not score record counts or citation volume as insight.

- [ ] **Step 5: Run the prompt and evaluation tests**

  Run: `npm test -- features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts`

  Expected: PASS, including existing citation, uncertainty, isolation, latency, token-budget, and cost-budget checks.

- [ ] **Step 6: Commit consequence-oriented prompting**

  ```bash
  git add OrchestrationPlatform/frontend/features/lattice-next/copilot/execute-copilot-turn.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/policy.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/cases.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/metrics.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts OrchestrationPlatform/frontend/features/lattice-next/copilot/evals/copilot-evaluation.test.ts OrchestrationPlatform/frontend/next.config.ts
  git commit -m "feat: ground copilot consequence answers"
  ```

### Task 4: Make the Conversation Primary and Reveal “Why?” on Demand

**Files:**
- Modify: `frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx`
- Modify: `frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx`
- Test: `frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx`
- Test: `frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx`

**Interfaces:**
- Preserve `CopilotAnswerContext` as the selected answer/message context.
- Add `onWhySelect(answerContext: CopilotAnswerContext): void` to `CopilotKitChatSurfaceProps`; wire it to the existing panel.
- Opening “Why?” opens the existing panel's sidecar with that answer's supporting explanation and path, without repeating the answer text.
- Keep citation selection useful in the same sidecar. The graph is reachable only through a further user action; it is not the default sidecar content.
- Preserve existing review-cue dismissal as a quiet conversation follow-up suggestion, not a tab, finding card, or persistent panel.
- On narrow screens, use the existing conversation/context mode to provide an explicit return to the conversation.

- [ ] **Step 1: Write failing narrative and disclosure tests**

  Add or update tests named:
  - `renders_the_answer_as_the_primary_narrative_without_duplicate_details`
  - `passes_the_exact_answer_context_when_why_is_selected`
  - `keeps_the_explanation_sidecar_closed_until_requested`
  - `does_not_repeat_the_answer_or_open_the_graph_by_default`
  - `returns_from_the_phone_sidecar_to_the_conversation`
  - `keeps_review_cue_dismissal_available_as_a_quiet_follow_up`

  Also assert that any existing review cue remains a dismissible, understated follow-up suggestion rather than returning as a tab or finding card.

  Required assertions:

  ```ts
  expect(markup).toContain("The assembly is ready for review.");
  expect(markup).not.toContain("Evidence and details");
  expect(onWhySelect).toHaveBeenCalledWith(expectedAnswerContext);
  expect(defaultMarkup).not.toContain("Explore relationships");
  ```

- [ ] **Step 2: Run the UI tests and verify they fail**

  Run from `frontend`: `npm test -- features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx`

  Expected: FAIL against the current duplicate details accordion and Evidence/Graph/Review workbench tabs.

- [ ] **Step 3: Simplify the answer surface**

  Render the answer narrative first. Remove duplicated claim/evidence/recommendation sections from the default answer view; retain relevant citations and only show an optional next step or uncertainty when it adds information not already present in the answer. Preserve review-cue dismissal by making a cue a quiet conversation follow-up suggestion, not a new content panel.

- [ ] **Step 4: Replace the workbench tabs with an on-demand explanation sidecar**

  Wire `onWhySelect` to the selected answer context, remove the Evidence/Graph/Review tabbed workbench and “Open evidence workbench” control, and present only the selected answer's relevant explanation and cited source path. Keep `CopilotCitedGraph` behind an explicit “Explore relationships” action. Preserve close, focus-return, escape-key, and phone back behavior.

- [ ] **Step 5: Run both UI test suites**

  Run: `npm test -- features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx`

  Expected: PASS, including existing retry, thread, focus, cue-dismissal, citation, and run-state behavior that remains in scope.

- [ ] **Step 6: Commit the conversation-first surface**

  ```bash
  git add OrchestrationPlatform/frontend/features/lattice-next/workspace/CopilotKitChatSurface.tsx OrchestrationPlatform/frontend/features/lattice-next/workspace/InvestigationCopilotPanel.tsx OrchestrationPlatform/frontend/features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx OrchestrationPlatform/frontend/features/lattice-next/tests/investigation-copilot-panel.test.tsx
  git commit -m "feat: reveal copilot reasoning on demand"
  ```

### Task 5: Validate the Integrated Engineer Experience

**Files:**
- No new product files unless an integration failure requires a focused fix.
- Validate the changed Copilot context, model request, conversation, and sidecar together.

- [ ] **Step 1: Run the focused Copilot and workspace tests**

  From `frontend`, run:

  ```powershell
  npm test -- features/lattice-next/copilot/tests/relationship-guidance.test.ts features/lattice-next/copilot/tests/context-builder.test.ts features/lattice-next/copilot/tests/execute-copilot-turn.test.ts features/lattice-next/copilot/evals/copilot-evaluation.test.ts features/lattice-next/workspace/tests/copilotkit-chat-surface.test.tsx features/lattice-next/tests/investigation-copilot-panel.test.tsx
  ```

  Expected: PASS for every selected suite.

- [ ] **Step 2: Run type checking, lint, and production build**

  From `frontend`, run `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

  Expected: no new type or lint errors; the production server output can load the authoritative relationship document.

- [ ] **Step 3: Review the interaction at desktop and phone widths**

  Use the synthetic investigation fixture for deterministic UI checks; if an authorized source-backed investigation is available, validate the same behavior with it without treating synthetic data as proof of product value. Verify that the first answer leads with the consequence, the conversation is the dominant surface, “Why?” reveals only relevant support in a sidecar, no graph or evidence content is open by default, and the user can return to the inquiry. Do not use graph opens or citation clicks as the success measure; check whether the consequence and its limits are understandable without opening the sidecar.

- [ ] **Step 4: Record the Phase 1 evaluation result**

  Review the synthetic consequence cases against the spec's criteria: consequence relevance, source support, correct relationship semantics, clarity, and decision usefulness. Record any remaining model-quality gap as input for a separate Phase 2 fine-tuning plan; do not start model-weight training in this implementation.

- [ ] **Step 5: Commit any integration-only corrections**

  Commit only focused fixes needed to pass the integrated checks, using a message that names the corrected behavior.
