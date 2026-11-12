# Lattice Copilot Full Handover for New Luna Session

# Read First

This handover is intended for an engineer and a fresh Luna session that have the full codebase but essentially zero project context.

The goal is to transfer the complete reasoning, architectural decisions, investigation results, roadmap, and current status.

---

# Project Overview

Lattice is an Engineering Intelligence platform.

The long-term vision is not a generic chatbot.

The vision is:

PLM Brain -> Engineering Knowledge Graph -> Copilot Intelligence Layer -> Engineering Decision Support.

The Copilot should answer using governed engineering intelligence rather than raw retrieval.

Primary Systems:

- Windchill
- SAP
- Configit
- Codebeamer
- Teamcenter (future expansion)

---

# Critical Architectural Principle

PLM Brain is the authoritative knowledge graph.

Do NOT replace PLM Brain with:

- Neo4j
- GraphRAG
- LangGraph
- LangChain-centric architecture

A graph visualization layer may be added.

The source of truth remains PLM Brain.

---

# Why Sprint 1 Existed

The original concern:

Can cross-system engineering intelligence survive from graph construction to an LLM answer?

This was unknown.

Sprint 1 was a multi-stage architectural validation effort.

We intentionally traced every layer.

---

# Sprint 1 Discovery Timeline

## Sprint 1A.2

Relationship auditing.

Questions:

- Do relationships exist?
- Are applications connected?
- Are relationships being materialized?

Deliverables included:

- relationship audit
- benchmark alignment
- coverage analysis

Outcome:

Relationship foundation investigated.

---

## Sprint 1A.3

Relationship materialization.

Validated:

Governed Mapping
-> Canonical Relationship

Created proof chain showing relationships can exist within PLM Brain.

---

## Sprint 1A.4

Ontology validation.

Validated:

Canonical Relationship
-> Ontology Resolution

Result:

3 canonical relationships
3 ontology-resolved relationships

A major architectural uncertainty was removed.

---

## Sprint 1A.5

Impact generation validation.

Validated:

Resolved Relationship
-> Impact Path
-> Impact Chain

Measured:

3 impact paths
3 impact chains

Result:

Impact analysis works.

---

## Sprint 1A.5B

Reasoning package trace.

Original assumption:

Selector bug.

Actual finding:

Not selector failure.

The reasoning package was populated successfully before trimming.

---

## Sprint 1A.5C

Budget preservation.

Critical bug discovered.

Before:

Relationship Narratives > 0
Impact Narratives > 0
Impact Chains > 0

After budgeting:

Relationship Narratives = 0
Impact Narratives = 0
Impact Chains = 0

Root cause:

Context budget trimming deleted valid engineering intelligence.

Fix implemented:

Protected minimums.

Now preserved:

- 1 relationship narrative
- 1 impact narrative
- 1 impact chain

through:

Reasoning Package
Engineering Brief
Prompt Payload

---

## Sprint 1A.6

Provider-backed validation.

Goal:

Validate M1 and M2 with actual provider answers.

Blocked by Azure authentication/server issue.

Not blocked by architecture.

---

# What Has Been Proven

Governed Mappings ✅

Canonical Relationships ✅

Ontology Resolution ✅

Impact Paths ✅

Impact Chains ✅

Reasoning Package ✅

Engineering Brief ✅

Prompt Preservation ✅

---

# Measured Golden Fixture Results

Governed Mappings: 3

Canonical Relationships: 3

Resolved Relationships: 3

Impact Paths: 3

Impact Chains: 3

Reasoning Package After Preservation:

- 1 relationship narrative
- 1 impact narrative
- 1 impact chain

Prompt:

- 1 relationship
- 2 evidence records

---

# Key Relationships Used In Validation

1.

operationally-represented-as

Windchill Part
-> SAP Material

2.

configured-by

Windchill Part
-> Configit Model

3.

specified-by

Windchill Part
-> Codebeamer Requirement

These relationships are central to Sprint 1 validation.

---

# Important Findings

Finding #1

The architecture itself is largely correct.

Most failures were boundary failures.

Examples:

- ontology alignment
- reasoning preservation
- context budgeting
- prompt preservation

---

Finding #2

The model is not the source of engineering intelligence.

PLM Brain is.

Copilot consumes intelligence.

---

Finding #3

More retrieval was never the primary problem.

The primary problem was ensuring relationship intelligence survives to the prompt.

---

# Current Blocker

Azure OpenAI.

Observed:

HTTP 401

Azure response:

Invalid subscription key or wrong endpoint.

Additional issue found:

usage-ledger CSV locked by Excel.

That issue was investigated and isolated.

Current blocker remains Azure/provider availability and validation.

---

# What To Do Immediately

1.

Verify provider works.

2.

Run M1.

3.

Run M2.

4.

Compare results against Sprint 1 benchmark document.

5.

Determine whether Sprint 1 can be formally closed.

---

# Approved Roadmap (Do Not Change Without Deliberate Decision)

Sprint 2

Relationship Intelligence Expansion

Expand graph intelligence and cross-system relationship coverage.

---

Sprint 2.5

Graph Explorer / Relationship Explorer

Graphify-style visualization layer.

Purpose:

- debugging
- relationship discovery
- impact visualization
- engineering navigation

PLM Brain remains source of truth.

---

Sprint 3

Pre-Context Intelligence Builder

Most important future sprint.

Capabilities:

- question understanding
- scope resolution
- retrieval planning
- relationship selection
- evidence selection
- engineering brief generation

Goal:

Provide the right intelligence before retrieval reaches the LLM.

---

Sprint 4

RAG Enhancement

Built on Sprint 3.

Not generic chunk retrieval.

Desired flow:

Question
-> Understanding
-> Retrieval Plan
-> Graph Intelligence
-> Evidence
-> Engineering Brief
-> LLM

---

Sprint 5

MCP Tools

Examples:

- getRelationships
- getImpactChains
- getEvidence
- getApplicationCoverage

---

Sprint 6

Predictive Copilot

Future intelligence and prediction layer.

---

# Explicit Non-Goals

Do not replace PLM Brain.

Do not redesign around Neo4j.

Do not redesign around GraphRAG.

Do not redesign around LangGraph.

Do not redesign around LangChain.

---

# Current Status Snapshot

Sprint 1:

Architecture Validation = Complete

Provider Validation = Waiting for Azure recovery / validation.

Sprint 2:

Not started.

Read this document completely before making architecture decisions.
