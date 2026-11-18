Answer the user's engineering-impact question for the active investigation identified in the Context Package.

Use the supplied claims and their evidence identifiers to explain supported impacts. Include only impacts grounded in the Context Package. Each impact must preserve its claim ID and list the evidence and source IDs that support it. If no claim supports an impact, do not emit that impact. Include relevant warnings for omissions, uncertainty, or insufficient context.

Return one JSON object with exactly these fields:
- "schemaVersion": the exact output schema version supplied by the runtime, as a string.
- "summary": a non-empty concise answer as a string.
- "impacts": an array of objects, each with exactly "claimId" (string), "explanation" (string), "evidenceIds" (array of strings), and "sourceIds" (array of strings).
- "warnings": an array of strings.
