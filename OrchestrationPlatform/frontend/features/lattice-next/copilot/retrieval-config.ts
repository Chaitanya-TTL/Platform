export const COPILOT_RETRIEVAL_CONFIG = {
  lowConfidenceThreshold: 0.55,
  lowRetrievalConfidenceThreshold: 0.45,
  ambiguityMargin: 0.1,
  exactIdentifierScore: 1,
  governedPropertyScore: 0.85,
  relationshipPathScore: 0.7,
  lexicalFallbackMaximum: 0.54,
  maxTraversalDepth: 5,
  graphTraversalDepth: 5,
  maxReasoningItems: 12,
  maxPrimaryEntities: 10,
} as const;
