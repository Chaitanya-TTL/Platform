# Lattice Cross-Enterprise Relationship Bible

**Document status:** Authoritative V1 baseline  
**Scope:** Cross-enterprise relationships among Windchill, SAP, Configit, and Codebeamer  
**Primary use:** Implementation, validation, review, and governance of relationship creation in Lattice  
**Last updated:** 2026-10-19

---

## 1. Purpose

This document defines the approved cross-enterprise relationship model for Lattice.

It is the governing reference for creating relationships among data extracted from:

- Windchill
- SAP
- Configit
- Codebeamer

The objective is to convert isolated source-system records into an evidence-backed engineering knowledge layer without inventing relationships, confusing semantically different attributes, or allowing AI-generated suggestions to become trusted knowledge automatically.

This document governs:

- approved relationship types;
- valid source and target entity types;
- relationship direction and inverse traversal;
- relationship status, strength, and evidence;
- promotion rules;
- prohibited mappings;
- implementation priorities; and
- validation requirements.

Internal relationships already owned by each enterprise application remain source-system concerns. Lattice adds cross-enterprise relationships only where identity, business semantics, deterministic calculations, rules, or validated impact paths support them.

---

## 2. Core Principles

### 2.1 Preserve source truth

Lattice must retain every source-native identifier, name, revision, version, timestamp, and source-system reference. Canonicalisation must not overwrite or erase source records.

### 2.2 Canonical identity does not make source records identical

A Windchill Part, SAP Material, Configit Work Item, and Codebeamer Requirement may all relate to the same canonical product context, but they remain different enterprise objects with different responsibilities.

### 2.3 Store facts separately from interpretations

Every relationship must distinguish between:

- explicit source facts;
- domain-owner confirmations;
- deterministic rule derivations;
- deterministic calculations;
- potential impact paths; and
- AI suggestions.

### 2.4 Do not infer relationships from similar names alone

Matching labels, descriptions, or field names are candidate signals, not proof. A relationship requires approved evidence.

### 2.5 Store one semantic edge and expose an inverse traversal

Do not store duplicate forward and reverse relationships as independent facts.

Example:

```text
Stored edge:
Windchill Part
    OPERATIONAL_REPRESENTATION_AS
SAP Material

Inverse traversal label:
SAP Material
    OPERATIONAL_REPRESENTATION_OF
Windchill Part
```

Both traversals must share the same status, strength, evidence, and lifecycle.

### 2.6 Potential impact is not causation

`MAY_IMPACT`, `MAY_REQUIRE_REVIEW_OF`, and similar relationships identify investigation paths. They do not prove that a source event caused a target-system transaction or change.

### 2.7 Deterministic processing comes before AI inference

Identifiers, rules, units, numeric constraints, and supported Configit syntax must be processed deterministically wherever possible. AI may suggest candidates but must not establish trusted relationships autonomously.

---

## 3. Application Responsibilities

### Windchill

Windchill is the engineering definition and change-management source for parts, revisions, BOMs, attributes, Change Notices, and Change Tasks.

### SAP

SAP is the operational and financial source for materials, plants, stock, material movements, inventory value, and accounting documents.

### Configit

Configit is the configuration-intelligence source for product models, work items, variation families, features, rules, conditions, and valid configurations.

### Codebeamer

Codebeamer is the requirements and traceability source for requirement sets, requirements, versions, constraints, and requirement changes.

---

## 4. Relationship Metadata Contract

Every stored cross-enterprise relationship must contain at least:

```json
{
  "relationshipId": "stable-relationship-id",
  "fromEntityId": "source-system:native-type:native-id",
  "type": "APPROVED_RELATIONSHIP_TYPE",
  "toEntityId": "target-system:native-type:native-id",
  "status": "CONFIRMED",
  "strength": "STRONG",
  "evidence": [],
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "createdBy": "deterministic-service-or-user",
  "relationshipDefinitionVersion": "1.0"
}
```

Recommended additional fields:

```json
{
  "canonicalEntityId": "canonical:part:steering",
  "validFrom": null,
  "validTo": null,
  "sourceExtractionIds": [],
  "calculationId": null,
  "reviewState": "NOT_REQUIRED",
  "rejectionReason": null
}
```

---

## 5. Controlled Enums

### 5.1 Relationship status

```text
CONFIRMED
SOURCE_EXPLICIT
RULE_DERIVED
CALCULATED
POTENTIAL
REJECTED
```

Definitions:

- `CONFIRMED`: validated through approved domain evidence, normally domain-owner confirmation or governed mapping.
- `SOURCE_EXPLICIT`: directly expressed by an authoritative source record or integration mapping.
- `RULE_DERIVED`: produced deterministically from an approved source rule.
- `CALCULATED`: produced by a deterministic comparison, evaluation, or computation.
- `POTENTIAL`: candidate impact or review path that has not been proven.
- `REJECTED`: reviewed relationship that must not be treated as valid knowledge.

A status is not a workflow state hierarchy. For example, `SOURCE_EXPLICIT` is not weaker than `CONFIRMED`; it describes a different basis of trust.

### 5.2 Relationship strength

```text
STRONG
MEDIUM
WEAK
```

Definitions:

- `STRONG`: direct and unambiguous evidence.
- `MEDIUM`: credible but indirect evidence, or a governed mapping requiring contextual interpretation.
- `WEAK`: candidate evidence insufficient for trusted use without review.

Strength must never replace status or evidence.

### 5.3 Evidence type

```text
SOURCE_EXPLICIT
DOMAIN_OWNER_CONFIRMED
IDENTIFIER_MATCH
ATTRIBUTE_REQUIREMENT_MAPPING
CONFIGURATION_RULE
DETERMINISTIC_CALCULATION
IMPACT_PATH
AI_SUGGESTED
```

`AI_SUGGESTED` relationships must never be promoted automatically to confirmed knowledge.

### 5.4 Recommended evidence object

```json
{
  "evidenceType": "DOMAIN_OWNER_CONFIRMED",
  "sourceSystem": "LATTICE",
  "sourceEntityIds": [
    "windchill:part:0000003874",
    "sap:material:000000000000000031"
  ],
  "description": "Records confirmed to represent the same canonical Steering part",
  "capturedAt": "ISO-8601 timestamp",
  "capturedBy": "domain-owner-identity"
}
```

---

## 6. Relationship Promotion Rules

### 6.1 Permitted promotion paths

```text
AI_SUGGESTED candidate
    -> human or deterministic validation
    -> CONFIRMED / SOURCE_EXPLICIT / RULE_DERIVED / CALCULATED
```

```text
POTENTIAL impact path
    -> explicit source link or deterministic impact evaluation
    -> SOURCE_EXPLICIT / CALCULATED / CONFIRMED
```

### 6.2 Prohibited automatic promotions

The following must never happen automatically:

```text
AI_SUGGESTED -> CONFIRMED
WEAK name match -> CONFIRMED
POTENTIAL -> SOURCE_EXPLICIT
similar field names -> semantic equivalence
co-occurrence in one export -> causal relationship
```

### 6.3 Recalculation

`RULE_DERIVED` and `CALCULATED` relationships must retain the rule, parser, calculation version, inputs, and timestamp needed for reproducibility.

---

## 7. Cross-Enterprise Relationship Matrix

The matrix below is a navigation summary. Detailed definitions follow in Sections 8 through 13.

| Source application | Target application | Relationship focus |
|---|---|---|
| Windchill | SAP | Engineering identity to operational material, stock, history, finance, and potential change impact |
| Windchill | Configit | Engineering part to product model, variation, applicability, selection, and review impact |
| Windchill | Codebeamer | Engineering part and attributes to requirements, verification, version evaluation, and impact |
| SAP | Windchill | Inverse traversal of approved Windchill-to-SAP relationships |
| SAP | Configit | Material, availability, fulfilment, cost, and configuration constraints |
| SAP | Codebeamer | Material and availability context for requirements and review paths |
| Configit | Windchill | Configuration model, dimensions, options, applicability, selection, and review impact |
| Configit | SAP | Operational material, availability, fulfilment, cost, and movement context |
| Configit | Codebeamer | Configuration intent, requirement implementation, evidence, applicability, and review impact |
| Codebeamer | Windchill | Inverse traversal of requirement specification and verification relationships |
| Codebeamer | SAP | Material and market requirements to material and availability context |
| Codebeamer | Configit | Requirement intent to configuration implementation, rules, conditions, and impact |

---

## 8. Windchill-Centred Relationships

### 8.1 Windchill to SAP

#### Engineering part to operational material

```text
Windchill Part
    OPERATIONAL_REPRESENTATION_AS
SAP Material
```

Default classification when domain mapping is approved:

```text
status: CONFIRMED
strength: STRONG
evidenceType: DOMAIN_OWNER_CONFIRMED
```

Use `SOURCE_EXPLICIT` instead when the connection is directly extracted from an authoritative integration mapping or shared controlled identifier.

#### Operational data

```text
Windchill Part
    HAS_OPERATIONAL_DATA_IN
SAP Plant / Stock
```

This relationship is traversed through the approved SAP Material representation. It indicates where operational data for the engineering part is held; it does not copy ownership of stock data into Windchill.

#### Operational history

```text
Windchill Part
    HAS_OPERATIONAL_HISTORY_IN
SAP Material Movement
```

A material movement is operational history for the corresponding material. It is not automatically evidence of an engineering change.

#### Financial context

```text
Windchill Part
    HAS_FINANCIAL_CONTEXT_IN
SAP Inventory Value / Accounting Document
```

Inventory value and accounting records provide financial context. They must not be presented as complete product cost, sales price, or configuration price unless those semantics are explicitly available.

#### Potential change impact

```text
Windchill Change Notice
    MAY_IMPACT
SAP Material
```

Default classification:

```text
status: POTENTIAL
strength: MEDIUM
evidenceType: IMPACT_PATH
```

The relationship may be promoted only when an explicit SAP change reference, integration mapping, or deterministic impact evaluation is available.

A Windchill Change Notice must never be claimed to have caused a particular SAP material movement or accounting document without direct evidence.

### 8.2 Windchill to Configit

#### Part configuration model

```text
Windchill Part
    CONFIGURED_BY
Configit Work Item
```

Default classification when mapped to the same canonical part:

```text
status: CONFIRMED
strength: STRONG
evidenceType: DOMAIN_OWNER_CONFIRMED
```

#### Variation dimensions

```text
Configit Product Model / Family
    DEFINES_VARIATION_DIMENSION_FOR
Windchill Part
```

Examples include Market, Drive Orientation, and Steering Type.

#### Variant options

```text
Configit Feature
    DEFINES_VARIANT_OPTION_FOR
Windchill Part
```

This relationship means the feature is an allowed or modelled option in the part's configuration space. It does not mean every feature is selected for every part instance.

#### Applicability governance

```text
Configit Rule Expression
    GOVERNS_APPLICABILITY_OF
Windchill Part
```

Default classification for deterministically parsed rules:

```text
status: RULE_DERIVED
strength: STRONG
evidenceType: CONFIGURATION_RULE
```

#### Applicable selection

```text
Configit Valid Configuration
    SELECTS_APPLICABLE
Windchill Part / Part Revision / BOM Component
```

Default classification:

```text
status: CALCULATED
strength: STRONG
evidenceType: DETERMINISTIC_CALCULATION
```

This relationship must be created only when an actual configuration evaluation or BOM-selection output identifies the selected engineering object.

#### Configuration change review

```text
Configit Model / Rule / Feature Change
    MAY_REQUIRE_ENGINEERING_REVIEW_OF
Windchill Part / BOM
```

Default classification:

```text
status: POTENTIAL
strength: MEDIUM
evidenceType: IMPACT_PATH
```

### 8.3 Windchill to Codebeamer

#### Requirement specification

```text
Windchill Part
    SPECIFIED_BY
Codebeamer Requirement
```

The relationship is `CONFIRMED` only when explicit traceability, controlled mapping, or domain-owner evidence links the requirement to the part.

#### Requirement satisfaction

```text
Windchill Part
    SATISFIES
Codebeamer Requirement
```

Default classification after deterministic requirement evaluation:

```text
status: CALCULATED
strength: STRONG or MEDIUM
evidenceType: DETERMINISTIC_CALCULATION
```

`SPECIFIED_BY` and `SATISFIES` are not interchangeable. A requirement may specify a part even when the part does not satisfy the requirement.

#### Attribute verification

```text
Windchill Attribute
    VERIFIED_AGAINST
Codebeamer Requirement
```

Approved initial mappings:

```text
Windchill Material
    VERIFIED_AGAINST
Codebeamer Material Requirement
```

```text
Windchill Chemical Composition
    VERIFIED_AGAINST
Codebeamer Chemical Requirement
```

```text
Windchill Weight
    VERIFIED_AGAINST
Codebeamer Weight Requirement
```

```text
Windchill Dimensions
    VERIFIED_AGAINST
Codebeamer Dimension Requirement
```

Use `VERIFIED_AGAINST`, not `EQUALS`. A Windchill attribute is an engineering value; a Codebeamer requirement is a constraint or expected condition.

A verification result should separately record the outcome:

```text
PASS
FAIL
INDETERMINATE
NOT_EVALUATED
```

#### Version evaluation

```text
Windchill Part Version
    EVALUATED_AGAINST
Codebeamer Requirement Version
```

The participating versions must be preserved so that historical evaluations remain reproducible.

#### Potential requirement impact

```text
Windchill Change Notice
    MAY_IMPACT
Codebeamer Requirement
```

Default classification:

```text
status: POTENTIAL
strength: MEDIUM
evidenceType: IMPACT_PATH
```

---

## 9. SAP-Centred Relationships

### 9.1 SAP to Windchill

These are inverse traversals of relationships defined in Section 8.1, not separate independently stored facts.

```text
SAP Material
    OPERATIONAL_REPRESENTATION_OF
Windchill Part
```

```text
SAP Plant / Stock
    PROVIDES_AVAILABILITY_FOR
Windchill Part
```

```text
SAP Material Movement
    PROVIDES_OPERATIONAL_HISTORY_FOR
Windchill Part
```

```text
SAP Inventory Value / Accounting Document
    PROVIDES_FINANCIAL_CONTEXT_FOR
Windchill Part
```

### 9.2 SAP to Configit

#### Operational material supply

```text
SAP Material
    SUPPLIES_MATERIAL_FOR
Configit Work Item / Product Model
```

This relationship is `CONFIRMED` only when the SAP Material and Configit model are mapped through an approved canonical product or explicit source mapping.

#### Availability

```text
SAP Material Availability
    PROVIDES_AVAILABILITY_FOR
Configit Valid Configuration
```

Default classification:

```text
status: CALCULATED
strength: STRONG or MEDIUM
evidenceType: DETERMINISTIC_CALCULATION
```

The calculation must know which material, quantity, plant, and date are required by the valid configuration.

#### Plant fulfilment

```text
SAP Plant
    SUPPORTS_FULFILMENT_OF
Configit Market
```

Default classification unless explicit fulfilment mapping exists:

```text
status: POTENTIAL
strength: WEAK or MEDIUM
evidenceType: IMPACT_PATH
```

The co-existence of a Configit market and SAP plant does not establish this relationship.

#### Cost context

```text
SAP Inventory Value
    PROVIDES_COST_CONTEXT_FOR
Configit Valid Configuration
```

Inventory value is operational financial context. It must not be interpreted as selling price or full configuration cost.

#### Availability constraint

```text
SAP Material Availability
    MAY_CONSTRAIN
Configit Configuration
```

Low availability may constrain fulfilment but does not invalidate the logical Configit configuration.

#### Movement-related availability

```text
SAP Material Movement
    MAY_CHANGE_AVAILABILITY_FOR
Configit Valid Configuration
```

The relationship should normally be `CALCULATED` only after material and plant scope are deterministically resolved. Otherwise it remains `POTENTIAL`.

### 9.3 SAP to Codebeamer

#### Material constraint

```text
SAP Material
    CONSTRAINED_BY
Codebeamer Material Requirement
```

Canonical stored direction may instead be:

```text
Codebeamer Material Requirement
    SPECIFIES_OR_CONSTRAINS
SAP Material
```

Use one stored edge with inverse traversal.

The relationship does not prove that SAP's material type or description satisfies engineering composition requirements.

#### Market availability

```text
SAP Plant Stock
    PROVIDES_AVAILABILITY_FOR
Codebeamer Market Requirement
```

This requires a validated chain connecting the market requirement, required material, and serving plant. Without that chain, the relationship remains `POTENTIAL`.

#### Requirement-change review

```text
SAP Material / Plant / Stock
    MAY_REQUIRE_REVIEW_DUE_TO
Codebeamer Requirement Change
```

Canonical stored direction:

```text
Codebeamer Requirement Change
    MAY_REQUIRE_REVIEW_OF
SAP Material / Plant / Stock
```

Default classification:

```text
status: POTENTIAL
strength: MEDIUM
evidenceType: IMPACT_PATH
```

---

## 10. Configit-Centred Relationships

### 10.1 Configit to Windchill

#### Configuration model

```text
Configit Work Item
    CONFIGURATION_MODEL_FOR
Windchill Part
```

Inverse of `Windchill Part CONFIGURED_BY Configit Work Item`.

#### Variant model

```text
Configit Product Model
    MODELS_VARIANTS_OF
Windchill Part
```

#### Variation dimensions

```text
Configit Family
    DEFINES_VARIATION_DIMENSION_FOR
Windchill Part
```

#### Variant options

```text
Configit Feature
    DEFINES_VARIANT_OPTION_FOR
Windchill Part
```

#### Applicability rules

```text
Configit Rule Expression
    GOVERNS_APPLICABILITY_OF
Windchill Part
```

#### Engineering-object selection

```text
Configit Valid Configuration
    SELECTS_APPLICABLE
Windchill Part / Part Revision / BOM Component
```

#### Engineering review path

```text
Configit Model / Feature / Rule Change
    MAY_REQUIRE_ENGINEERING_REVIEW_OF
Windchill Part / BOM
```

### 10.2 Configit to SAP

#### Operational-material configuration

```text
Configit Work Item / Product Model
    CONFIGURES_OPERATIONAL_MATERIAL
SAP Material
```

Inverse of `SAP Material SUPPLIES_MATERIAL_FOR Configit Work Item / Product Model`.

#### Availability requirement

```text
Configit Valid Configuration
    REQUIRES_MATERIAL_AVAILABILITY_FROM
SAP Material / Plant Stock
```

This relationship requires the actual material and quantity demanded by the configuration.

#### Market fulfilment

```text
Configit Market Feature
    MAY_REQUIRE_FULFILMENT_FROM
SAP Plant
```

Remain `POTENTIAL` unless explicit market-to-plant mapping exists.

#### Cost context

```text
Configit Valid Configuration
    HAS_COST_CONTEXT_FROM
SAP Inventory Value
```

#### Availability constraint

```text
Configit Valid Configuration
    MAY_BE_CONSTRAINED_BY
SAP Material Availability
```

#### Availability affected by movement

```text
Configit Valid Configuration
    HAS_AVAILABILITY_AFFECTED_BY
SAP Material Movement
```

This must not imply that the configuration caused the material movement.

### 10.3 Configit to Codebeamer

#### Configuration intent

```text
Configit Work Item / Product Model
    IMPLEMENTS_CONFIGURATION_INTENT_OF
Codebeamer Requirement Set
```

Use `CONFIRMED` only with an approved requirement-set mapping. Otherwise use `POTENTIAL`.

#### Configuration dimension

```text
Configit Family
    IMPLEMENTS_CONFIGURATION_DIMENSION_OF
Codebeamer Requirement
```

#### Requirement coverage

```text
Configit Feature
    ADDRESSES
Codebeamer Requirement
```

`ADDRESSES` is the safe relationship when a feature is relevant to a requirement but compliance has not been proven.

#### Requirement satisfaction

```text
Configit Feature
    SATISFIES
Codebeamer Requirement
```

Create only after deterministic evaluation of the requirement condition. Feature existence alone is insufficient.

#### Rule implementation

```text
Configit Rule Expression
    IMPLEMENTS
Codebeamer Requirement
```

This requires a validated mapping between requirement intent and rule semantics.

#### Configuration evidence

```text
Configit Rule Expression
    PROVIDES_CONFIGURATION_EVIDENCE_FOR
Codebeamer Requirement
```

The relationship proves only configuration logic supported by the rule. It does not prove physical compliance for weight, dimensions, material performance, or chemical composition unless those values are modelled and evaluated.

#### Requirement applicability

```text
Configit Configuration Condition
    DEFINES_APPLICABILITY_OF
Codebeamer Requirement
```

#### Requirement-review path

```text
Configit Model / Feature / Rule Change
    MAY_REQUIRE_REVIEW_OF
Codebeamer Requirement
```

Default classification:

```text
status: POTENTIAL
strength: MEDIUM
evidenceType: IMPACT_PATH
```

---

## 11. Codebeamer-Centred Relationships

### 11.1 Codebeamer to Windchill

These are inverse traversals of Section 8.3 where appropriate.

```text
Codebeamer Requirement
    SPECIFIES
Windchill Part
```

```text
Codebeamer Material Requirement
    VERIFIES_ATTRIBUTE_OF
Windchill Material
```

```text
Codebeamer Chemical Requirement
    VERIFIES_ATTRIBUTE_OF
Windchill Chemical Composition
```

```text
Codebeamer Weight Requirement
    VERIFIES_ATTRIBUTE_OF
Windchill Weight
```

```text
Codebeamer Dimension Requirement
    VERIFIES_ATTRIBUTE_OF
Windchill Dimensions
```

```text
Codebeamer Requirement Version
    EVALUATES
Windchill Part Version
```

```text
Codebeamer Requirement Change
    MAY_IMPACT
Windchill Part / Change Scope
```

A requirement change and a Windchill Change Notice may be correlated through an approved impact analysis, but neither should be asserted as the cause of the other without explicit evidence.

### 11.2 Codebeamer to SAP

#### Material requirements

```text
Codebeamer Material Requirement
    SPECIFIES_OR_CONSTRAINS
SAP Material
```

This relationship indicates requirement relevance to the operational material. It does not permit SAP material type to be used as proof of engineering material composition.

#### Market-availability requirements

```text
Codebeamer Market Requirement
    REQUIRES_AVAILABILITY_FROM
SAP Plant Stock
```

Create as `CALCULATED` only when the market, required material, serving plant, required quantity, and evaluation time are known. Otherwise retain as `POTENTIAL`.

#### Requirement-change review

```text
Codebeamer Requirement Change
    MAY_REQUIRE_REVIEW_OF
SAP Material / Plant / Stock
```

### 11.3 Codebeamer to Configit

#### Requirement-set specification

```text
Codebeamer Requirement Set
    SPECIFIES
Configit Work Item
```

#### Market implementation

```text
Codebeamer Market Requirement
    IMPLEMENTED_BY
Configit Market Family / Feature
```

#### Rule governance

```text
Codebeamer Market Requirement
    GOVERNED_BY
Configit Orientation Rule
```

Use this only where the requirement explicitly imposes the orientation rule. If the rule merely implements the requirement, prefer:

```text
Configit Orientation Rule
    IMPLEMENTS
Codebeamer Market Requirement
```

#### Conditional applicability

```text
Codebeamer Requirement
    APPLIES_UNDER
Configit Configuration Condition
```

#### Requirement-change impact

```text
Codebeamer Requirement Change
    MAY_IMPACT
Configit Feature / Rule
```

Default classification:

```text
status: POTENTIAL
strength: MEDIUM
evidenceType: IMPACT_PATH
```

---

## 12. Configit Rule Interpretation

Preserve the original expression and create semantic relationships only through deterministic parsing for supported syntax.

Example source expression:

```text
if MRKT.IND then ORIENTATION.[05]
```

Stored source rule:

```json
{
  "entityId": "configit:rule:2",
  "entityType": "CONFIGURATION_RULE",
  "sourceSystem": "CONFIGIT",
  "nativeId": "2",
  "attributes": {
    "expression": "if MRKT.IND then ORIENTATION.[05]",
    "enabled": true,
    "locked": false
  }
}
```

Derived relationship:

```json
{
  "fromEntityId": "configit:feature:MRKT.IND",
  "type": "REQUIRES",
  "toEntityId": "configit:feature:ORIENTATION.05",
  "status": "RULE_DERIVED",
  "strength": "STRONG",
  "evidence": [
    {
      "evidenceType": "CONFIGURATION_RULE",
      "sourceSystem": "CONFIGIT",
      "sourceEntityIds": ["configit:rule:2"],
      "description": "if MRKT.IND then ORIENTATION.[05]"
    }
  ]
}
```

Rules:

1. Preserve the source expression unchanged.
2. Record the parser and parser version.
3. Resolve referenced families and features by native Configit identity.
4. Reject unresolved or unsupported expressions instead of guessing.
5. Recompute derived relationships when the source rule changes.
6. Do not use an LLM as the first implementation for parsing currently supported rule syntax.

---

## 13. Approved Relationship Vocabulary

### Identity and representation

```text
OPERATIONAL_REPRESENTATION_AS
CONFIGURED_BY
CONFIGURATION_MODEL_FOR
MODELS_VARIANTS_OF
SPECIFIED_BY
SPECIFIES
```

### Operational and financial context

```text
HAS_OPERATIONAL_DATA_IN
HAS_OPERATIONAL_HISTORY_IN
HAS_FINANCIAL_CONTEXT_IN
PROVIDES_AVAILABILITY_FOR
PROVIDES_OPERATIONAL_HISTORY_FOR
PROVIDES_FINANCIAL_CONTEXT_FOR
SUPPLIES_MATERIAL_FOR
CONFIGURES_OPERATIONAL_MATERIAL
REQUIRES_MATERIAL_AVAILABILITY_FROM
SUPPORTS_FULFILMENT_OF
MAY_REQUIRE_FULFILMENT_FROM
PROVIDES_COST_CONTEXT_FOR
HAS_COST_CONTEXT_FROM
MAY_CONSTRAIN
MAY_BE_CONSTRAINED_BY
MAY_CHANGE_AVAILABILITY_FOR
HAS_AVAILABILITY_AFFECTED_BY
```

### Configuration semantics

```text
DEFINES_VARIATION_DIMENSION_FOR
DEFINES_VARIANT_OPTION_FOR
GOVERNS_APPLICABILITY_OF
SELECTS_APPLICABLE
IMPLEMENTS_CONFIGURATION_INTENT_OF
IMPLEMENTS_CONFIGURATION_DIMENSION_OF
DEFINES_APPLICABILITY_OF
APPLIES_UNDER
REQUIRES
```

### Requirement and verification semantics

```text
SATISFIES
VERIFIED_AGAINST
VERIFIES_ATTRIBUTE_OF
EVALUATED_AGAINST
EVALUATES
SPECIFIES_OR_CONSTRAINS
CONSTRAINED_BY
ADDRESSES
IMPLEMENTS
IMPLEMENTED_BY
GOVERNED_BY
PROVIDES_CONFIGURATION_EVIDENCE_FOR
REQUIRES_AVAILABILITY_FROM
```

### Impact and review semantics

```text
MAY_IMPACT
MAY_REQUIRE_ENGINEERING_REVIEW_OF
MAY_REQUIRE_REVIEW_OF
MAY_REQUIRE_REVIEW_DUE_TO
```

No additional relationship type may be introduced into production without updating this document, defining its inverse traversal, specifying valid entity pairs, and approving its evidence and promotion rules.

---

## 14. Relationship Direction and Inverse Labels

| Stored relationship | Inverse traversal label |
|---|---|
| `OPERATIONAL_REPRESENTATION_AS` | `OPERATIONAL_REPRESENTATION_OF` |
| `HAS_OPERATIONAL_DATA_IN` | `PROVIDES_AVAILABILITY_FOR` or contextual operational-data label |
| `HAS_OPERATIONAL_HISTORY_IN` | `PROVIDES_OPERATIONAL_HISTORY_FOR` |
| `HAS_FINANCIAL_CONTEXT_IN` | `PROVIDES_FINANCIAL_CONTEXT_FOR` |
| `CONFIGURED_BY` | `CONFIGURATION_MODEL_FOR` |
| `SPECIFIED_BY` | `SPECIFIES` |
| `VERIFIED_AGAINST` | `VERIFIES_ATTRIBUTE_OF` |
| `EVALUATED_AGAINST` | `EVALUATES` |
| `SUPPLIES_MATERIAL_FOR` | `CONFIGURES_OPERATIONAL_MATERIAL` |
| `PROVIDES_COST_CONTEXT_FOR` | `HAS_COST_CONTEXT_FROM` |
| `MAY_CONSTRAIN` | `MAY_BE_CONSTRAINED_BY` |
| `MAY_CHANGE_AVAILABILITY_FOR` | `HAS_AVAILABILITY_AFFECTED_BY` |
| `IMPLEMENTS_CONFIGURATION_INTENT_OF` | `SPECIFIES` when entity semantics match |
| `IMPLEMENTS` | `IMPLEMENTED_BY` |

For contextual inverse labels, the stored canonical predicate must remain stable even if the UI displays a friendlier inverse phrase.

---

## 15. Prohibited Mappings and Claims

The following mappings or claims are explicitly prohibited unless new direct evidence changes the model:

```text
Windchill Material = SAP Material Type
```

Reason: engineering material specification and ERP business classification are different semantics.

```text
Windchill Weight = SAP Stock Quantity
```

Reason: physical mass and inventory quantity are unrelated measurements.

```text
Windchill Revision = Configit Work Item Status
```

Reason: engineering version and configuration workflow state are different concepts.

```text
SAP Inventory Value = Product Price
```

Reason: inventory valuation is not automatically selling price or complete product cost.

```text
Low SAP Stock INVALIDATES Configit Configuration
```

Reason: stock constrains fulfilment, not logical configuration validity.

```text
Configit Feature existence SATISFIES Codebeamer Requirement
```

Reason: satisfaction requires deterministic evaluation and evidence.

```text
Windchill Change Notice CAUSED SAP Material Movement
```

Reason: causation requires an explicit source link or validated integration reference.

```text
Co-occurring Configit Market and SAP Plant are linked
```

Reason: market-to-plant fulfilment requires explicit mapping.

```text
Similar names prove entity identity
```

Reason: name similarity is supporting evidence only.

---

## 16. Current Steering Validation Baseline

For the current Steering proof of concept:

```text
Steering
Stearing
```

are approved aliases of the same canonical part based on domain-owner confirmation.

The following source representations may be connected to that canonical part when they match the project data under validation:

```text
Windchill Part representation
SAP Material representation
Configit Work Item / Product Model representation
Codebeamer Requirement Set / Requirement context
```

This confirmation is specific to the validated Steering dataset. It must not become a generic rule that automatically merges similarly named records for other parts.

Every Steering relationship must still retain:

- source system;
- native entity type;
- native ID;
- native name;
- revision or version where applicable;
- extraction timestamp;
- relationship evidence; and
- relationship-definition version.

---

## 17. V1 Implementation Scope

Implement the following first because they provide the strongest foundation:

### Canonical system representation

```text
Windchill Part
    OPERATIONAL_REPRESENTATION_AS
SAP Material
```

```text
Windchill Part
    CONFIGURED_BY
Configit Work Item
```

```text
Windchill Part
    SPECIFIED_BY
Codebeamer Requirement
```

### Attribute-to-requirement verification

```text
Windchill Attribute
    VERIFIED_AGAINST
Codebeamer Requirement
```

### Configuration applicability

```text
Configit Rule Expression
    GOVERNS_APPLICABILITY_OF
Windchill Part
```

### Operational feasibility

```text
SAP Material Availability
    PROVIDES_AVAILABILITY_FOR
Configit Valid Configuration
```

### Requirement implementation

```text
Codebeamer Market Requirement
    IMPLEMENTED_BY
Configit Market Feature / Rule
```

### Impact paths

```text
Windchill Change Notice
    MAY_IMPACT
SAP Material
```

```text
Windchill Change Notice
    MAY_IMPACT
Codebeamer Requirement
```

```text
Configit Model / Rule / Feature Change
    MAY_REQUIRE_ENGINEERING_REVIEW_OF
Windchill Part / BOM
```

All V1 impact paths remain `POTENTIAL` until evaluated or explicitly linked.

---

## 18. Validation Checklist

Before storing a relationship, validate all applicable items:

- [ ] Source and target entities exist.
- [ ] Source-native IDs are preserved.
- [ ] Entity types are permitted for the relationship.
- [ ] Relationship type is in the approved vocabulary.
- [ ] Direction follows the canonical storage model.
- [ ] Inverse traversal is defined.
- [ ] Status uses the controlled enum.
- [ ] Strength uses the controlled enum.
- [ ] At least one evidence object exists.
- [ ] Evidence type uses the controlled enum.
- [ ] Evidence references retrievable source records or deterministic calculations.
- [ ] Calculation or parser version is recorded where relevant.
- [ ] Source extraction timestamp and freshness are available.
- [ ] Units are compatible before numeric comparison.
- [ ] Versions and revisions are scoped correctly.
- [ ] `POTENTIAL` is not presented as fact.
- [ ] No causal claim is made from co-occurrence alone.
- [ ] No AI suggestion has been auto-confirmed.
- [ ] Rejected relationships remain auditable.

---

## 19. Governance and Change Control

Any change to this relationship model must include:

1. proposed relationship name;
2. precise semantic definition;
3. valid source entity types;
4. valid target entity types;
5. canonical direction;
6. inverse traversal label;
7. permitted statuses;
8. minimum evidence requirement;
9. promotion rules;
10. rejection conditions;
11. at least one valid example;
12. at least one invalid example; and
13. relationship-definition version update.

Relationship vocabulary changes must be reviewed before implementation in Lattice. Existing stored relationships must be migrated or versioned when semantics change.

---

## 20. Architectural Outcome

The approved relationship layer enables Lattice to build a trusted part-centred knowledge model:

```text
                         Codebeamer Requirements
                                  |
                                  | specifies / verifies
                                  v
SAP Material <--- operational representation ---> Windchill Part
     |                                                    |
     | availability / financial context                  | configured by
     v                                                    v
SAP Plant, Stock, Movement                        Configit Product Model
                                                          |
                                                          | families, features,
                                                          | rules, valid configurations
                                                          v
                                                 Applicability and variants
```

The future LLM must consume relationships with their evidence, status, strength, provenance, version, and freshness. The LLM must not be responsible for inventing the trusted graph.

---

## 21. Final Governing Rule

> A relationship belongs in the Lattice knowledge layer only when Lattice can explain what the relationship means, where it came from, how it was validated, how strong it is, and whether it represents a fact, calculation, rule derivation, or potential impact path.
