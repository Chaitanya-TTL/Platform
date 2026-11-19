import { describe, expect, it } from "vitest";
import {
  CONVERSATION_STATE_SCHEMA_VERSION,
  type ConversationState,
  type ConversationTurnInput,
  type ConversationTurnInterpretation,
} from "../contracts";

describe("conversation state contracts", () => {
  it("uses the current shared schema version and camel-case API fields", () => {
    const state: ConversationState = {
      schemaVersion: CONVERSATION_STATE_SCHEMA_VERSION,
      conversationId: "conversation-1",
      investigationId: "investigation-1",
      stateVersion: 1,
      currentSubjectIds: ["part-17"],
      currentValidatedEntityRefs: [{
        canonicalId: "part-17",
        entityKind: "Part",
        application: "Windchill",
      }],
      applicationFilters: {
        sourceApplications: ["Windchill"],
        targetApplications: ["SAP"],
      },
      relationshipFilters: ["depends-on"],
      impactScope: {
        relationshipTypes: ["depends-on"],
        maxHops: 3,
        sourceSystems: ["Windchill"],
        asOf: null,
      },
      outputDimension: "impact",
      previousTurnId: null,
      previousContextPackageId: null,
      snapshotRevision: null,
      sourceVersion: null,
      ontologyVersion: null,
      ownerFingerprint: null,
      unresolvedReference: null,
      lastTurnDisposition: "answer",
      createdAt: "2026-11-19T10:00:00Z",
      updatedAt: "2026-11-19T10:00:00Z",
      expiresAt: "2026-11-20T10:00:00Z",
    };
    const newTurn: ConversationTurnInput = {
      question: "What impacts if R-123 changes?",
      investigationId: "investigation-1",
      conversationId: "conversation-1",
      turnId: "turn-1",
      parentTurnId: null,
      previousState: null,
    };
    const interpretation: ConversationTurnInterpretation = {
      type: "follow-up-filter",
      explicitIdentifiers: [],
      referenceCandidateIds: ["part-17"],
      filterDelta: {
        requestedSourceApplications: null,
        requestedTargetApplications: ["SAP"],
        requestedRelationshipTerms: null,
        maxHops: null,
        asOf: null,
      },
      outputDimension: "impact",
      isAmbiguous: false,
      reasonCodes: [],
      clarificationRequired: false,
    };

    expect(CONVERSATION_STATE_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(state)).toContain("currentValidatedEntityRefs");
    expect(Object.keys(state.applicationFilters)).toEqual(["sourceApplications", "targetApplications"]);
    expect(newTurn.previousState).toBeNull();
    expect(interpretation.type).toBe("follow-up-filter");
  });
});
