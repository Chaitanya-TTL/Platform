# Lattice AI Architecture Document Design

## Intent

Create one detailed Markdown architecture document that explains what Lattice /
Orchestration Platform is intended to do, how it prepares enterprise context
for an LLM at runtime, what the repository implements today, and what remains
between that state and the target. The document must work for both business
stakeholders and technical reviewers.

## Selected approach

Use the approved **current architecture + target architecture + delta** format.
This makes maturity visible and avoids presenting roadmap items as deployed
capabilities. A business-friendly executive Mermaid diagram and a detailed
technical Mermaid diagram will appear in the deliverable itself.

Other approaches considered:

1. A single target-state diagram is simpler, but risks making planned
   capabilities look implemented.
2. The selected current/target/delta structure makes present capabilities,
   validation limits, and future work explicit.
3. An implementation-only blueprint is too technical for the dual audience and
   would omit the business purpose and value path.

## Deliverable

Create `docs/lattice-intelligence/LATTICE-AI-ARCHITECTURE.md` with the
requested sections: executive summary and business problem; the Product 360 and
cross-enterprise change-impact use case; current and target architecture;
runtime model enablement; enterprise-system scope; executive and technical
Mermaid diagrams; current-versus-target delta table; end-to-end flows; trust,
governance, Action Engine, principles, roadmap, assumptions, limitations, and
glossary.

The four runtime context inputs are domain knowledge, process knowledge,
application/tool knowledge, and investigation-specific evidence. Lattice
assembles question-relevant bounded context and calls Azure OpenAI / GPT-4o-mini
at runtime; enterprise data does not train or fine-tune the model.

## Current-state evidence and boundaries

- Treat Windchill, Teamcenter, SAP, Configit, and Codebeamer integrations as
  current connector/extractor paths, but state object coverage and runtime
  validation separately. Teamcenter is current; connected validation is
  blocked and broader Product 360/reasoning coverage requires validation.
- Distinguish source systems as systems of record from Lattice's canonical
  investigation graph and provenance-preserving evidence model.
- Describe Product 360 as implemented and being hardened/expanded, with
  bounded category coverage and drill-down availability; do not promise
  complete hierarchical inventory in one response.
- Describe M1/E1/M2 logic as implemented, while reporting that the latest
  recorded live benchmark is failed or mismatched; offline tests do not count as
  live benchmark success.
- Describe the backend unified intelligence contract/assembler and Lattice
  Copilot context path as separate components; do not imply an unverified
  end-to-end integration seam.
- Describe RAG as fixture-backed foundation only and on hold for production.
- Current Lattice Copilot is read-only/advisory. Do not claim integrated or
  production-ready Action Engine, Windchill writes, or end-to-end write-back.

## Target-state boundaries

Show complete hierarchical drill-down and inventory retrieval through bounded
retrieval rather than one oversized prompt; expanded relationship mappings and
Teamcenter validation; hybrid graph-aware RAG and semantic retrieval; broader
impact/predictive reasoning; and multi-system actions only after explicit user
approval, policy and authorization checks, execution audit, and supported
compensation. Label these as target or planned unless repository evidence
proves otherwise.

Shared investigation subject participation does not prove cross-system object
identity, dependency, impact, or causation. Impact conclusions require eligible
governed or ontology-resolved evidence. Source freshness, completeness,
citations, unresolved mappings, evidence boundaries, and context limits remain
visible controls. Validation feedback does not retrain the model.

## Action Engine scope

The current Lattice Copilot path is not a production-ready governed Action
Engine. The target action flow is:

`Lattice Copilot recommendation → explicit user approval → policy and
authorization boundary → governed Action Engine → enterprise-system write →
execution audit`

Do not claim integrated multi-system action orchestration or current
end-to-end write-back.

## Source basis and assumptions

Use repository source, tests, and current architecture/status documentation as
the source of truth. Include links to relevant source files and status reports
so reviewers can trace maturity claims. Where connected behavior or deployment
details are not proven, label the limitation or assumption rather than infer
it. Do not make a provider request, inspect another repository, modify
production code, or change unrelated worktree files.
