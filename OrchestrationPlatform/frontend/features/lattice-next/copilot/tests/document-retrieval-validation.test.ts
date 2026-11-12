import { describe, expect, it } from "vitest";
import type { CopilotAnswer, CopilotCitation } from "../contracts";
import { CopilotAnswerValidationError, validateCopilotAnswer } from "../answer-validator";
import { buildInvestigationContext } from "../context-builder";
import { COPILOT_EVALUATION_CASES } from "../evals/cases";

const m1 = COPILOT_EVALUATION_CASES.find((item) => item.roadmapIds.includes("M1"))!;
const context = buildInvestigationContext(m1.snapshot, "What does the steering specification require?");
const retrievalCitation: CopilotCitation = {
  citationId: "cite:retrieval-document:v1:steering-spec:A:chunk-1",
  kind: "retrieval-document",
  label: "Steering specification, revision A",
  source: "windchill",
  nativeId: "DOC-42",
};

function answer(
  citationIds: readonly string[],
  claimText = "The specification sets the torque range at 18 to 22 Nm.",
): CopilotAnswer {
  return {
    answer: claimText,
    claims: [{ text: claimText, kind: "fact", citationIds }],
    recommendations: [],
    uncertainties: [],
    followUpQuestions: [],
    snapshotRevision: context.snapshotRevision,
  };
}

describe("document retrieval citation validation", () => {
  it("accepts and returns only active retrieval citations in the existing citation shape", () => {
    const validated = validateCopilotAnswer(
      answer([retrievalCitation.citationId]),
      context,
      undefined,
      [retrievalCitation],
    );

    expect(validated.citations).toEqual([retrievalCitation]);
    expect(Object.keys(validated)).toEqual([
      "answer",
      "claims",
      "recommendations",
      "uncertainties",
      "followUpQuestions",
      "snapshotRevision",
      "citations",
    ]);
  });

  it("rejects retrieval citations omitted from the active evidence set and unknown retrieval IDs", () => {
    expect(() => validateCopilotAnswer(
      answer([retrievalCitation.citationId]),
      context,
      undefined,
      [],
    )).toThrow(CopilotAnswerValidationError);

    expect(() => validateCopilotAnswer(
      answer(["cite:retrieval-document:v1:other:rev:chunk"]),
      context,
      undefined,
      [retrievalCitation],
    )).toThrow(/unknown citation ID/i);
  });

  it("rejects retrieval-only citations for graph-authority claims", () => {
    const graphClaim = "The Windchill part is operationally represented as the SAP material.";
    expect(() => validateCopilotAnswer(
      answer([retrievalCitation.citationId], graphClaim),
      context,
      undefined,
      [retrievalCitation],
    )).toThrow(/retrieval citations cannot substantiate graph-authority claims/i);
  });

  it("rejects retrieval-only citations for canonical identity and impact-path claims", () => {
    for (const graphClaim of [
      "These records identify the same canonical entity.",
      "The document establishes an ontology-resolved engineering relationship.",
      "This establishes a subject traceability edge.",
      "The document proves an impact path and impact chain.",
    ]) {
      expect(() => validateCopilotAnswer(
        answer([retrievalCitation.citationId], graphClaim),
        context,
        undefined,
        [retrievalCitation],
      )).toThrow(/retrieval citations cannot substantiate graph-authority claims/i);
    }
  });

  it("allows document content claims while requiring an active graph citation for graph claims", () => {
    const graphCitation = context.citations[0];
    expect(graphCitation).toBeDefined();
    const claimText = "The Windchill part is operationally represented as the SAP material.";
    const validated = validateCopilotAnswer(
      answer([graphCitation!.citationId, retrievalCitation.citationId], claimText),
      context,
      undefined,
      [retrievalCitation],
    );

    expect(validated.citations).toEqual([
      graphCitation,
      retrievalCitation,
    ]);
  });

  it("preserves graph-only answer serialization when no retrieval citations are supplied", () => {
    const value = answer([context.citations[0]!.citationId]);
    const graphOnly = validateCopilotAnswer(value, context);
    const withEmptyRetrieval = validateCopilotAnswer(
      value,
      context,
      undefined,
      [],
    );

    expect(JSON.stringify(withEmptyRetrieval)).toBe(JSON.stringify(graphOnly));
  });
});
