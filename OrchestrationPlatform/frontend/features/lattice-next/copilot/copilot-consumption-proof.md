# Sprint 1A.4 Copilot Consumption Proof

## Test context

The fixture was passed through `buildInvestigationContext` and
`engineeringPromptPayload` using the production default context limit of
24,000 characters. This proves packet construction only; no provider was called,
no live golden-path investigation was loaded, and no Copilot answer was
generated.

## Default production context

| Stage | Relationship / evidence count | Result |
|---|---:|---|
| Ontology graph canonical relationships | 3 | Handshake edges visible to graph builder |
| Ontology graph resolved relationships | 0 | All five ontology definitions unresolved |
| Reasoning package candidate relationships before packet trimming | 9 | 3 mapping edges plus 6 subject-candidate projection edges; projection edges are not governed evidence |
| Context packet entities | 0 | Omitted by context size composition |
| Context packet relationships | 0 | Omitted by context size composition |
| Context packet evidence | 0 | Omitted by context size composition |
| Context packet impact paths/chains | 0 | No impact path was generated |
| Prompt payload relationships | 0 | No cross-system relationship reaches the default prompt payload |
| Provider answer | Not run | Golden fixture is not the active persisted investigation |

The final default context serialized to 23,954 characters under its 24,000
character bound. Its omission diagnostics show entities `4`, relationships
`9`, evidence `3`, paths `3`, unresolved evaluations `5`, ontology definitions
`5`, and reasoning artifacts `26` omitted.

## Unbounded diagnostic comparison

With an 80,000-character diagnostic limit, the packet retained four entities,
nine relationship contexts, three evidence records, and three relationship
narratives. It still had zero impact paths and zero impact chains. The nine
relationship contexts include six projected links derived from the subject's
candidate entity IDs; those are not validated handshake or ontology-resolved
relationships.

This unbounded packet is diagnostic evidence only. It is not the production
default and does not prove a provider answer.

## Questions answered

| Question | Answer |
|---|---|
| Did the PLM Brain handshake relationship reach the reasoning package? | YES in the unbounded diagnostic context; it was absent from the default composed packet after size trimming |
| Did it reach the engineering brief? | YES in the unbounded diagnostic context; not in the default packet |
| Did it reach the production-default prompt payload? | NO |
| Was a Copilot answer generated against the golden-path investigation? | NO |

## Result

The reasoning/prompt boundary is a second blocker after ontology evaluation.
The default production context drops all fixture entities, relationships, and
evidence from the final packet, so no honest provider-backed answer can be
claimed from this offline fixture run.
