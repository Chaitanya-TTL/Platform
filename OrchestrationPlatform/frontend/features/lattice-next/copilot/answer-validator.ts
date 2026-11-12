import type { CopilotAnswer, CopilotCitation, CopilotClaim, CopilotContextPacket, CopilotRecommendation } from "./contracts";

export type ConsequenceClaimType =
  | "same-subject-background"
  | "relationship-not-established"
  | "operational-representation-established"
  | "potential-operational-impact"
  | "specific-operational-effect"
  | "other";

export interface CopilotValidationDiagnostics {
  promptCitationIds: string[];
  providerCitationIds: string[];
  unknownCitationIds: string[];
  uncitedFactualClaimCount: number;
  claimRequirements: { claimType: ConsequenceClaimType; requiredCitationType: string }[];
  validationOutcome: "passed" | "failed";
}

export class CopilotAnswerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotAnswerValidationError";
  }
}

const MAX_ANSWER_CHARS = 16_000;
const MAX_ITEMS = 100;
const MAX_ITEM_CHARS = 4_000;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredText(value: unknown, field: string, maximum = MAX_ITEM_CHARS): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new CopilotAnswerValidationError(`${field} must be a non-empty string within the allowed length.`);
  return value.trim();
}

function textArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS)
    throw new CopilotAnswerValidationError(`${field} must be an array within the allowed item count.`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`, 2_000));
}

function citationIds(value: unknown, field: string, known: ReadonlySet<string>, required: boolean): string[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || value.some((item) => typeof item !== "string" || item.length > 512))
    throw new CopilotAnswerValidationError(`${field} must be an array of citation IDs.`);
  const ids = value as string[];
  if (required && ids.length === 0) throw new CopilotAnswerValidationError(`${field} requires citations from the active snapshot.`);
  if (new Set(ids).size !== ids.length) throw new CopilotAnswerValidationError(`${field} contains duplicate citation IDs.`);
  for (const id of ids) {
    if (!known.has(id)) throw new CopilotAnswerValidationError(`${field} contains an unknown citation ID.`);
  }
  return [...ids];
}

function validateClaim(value: unknown, index: number, known: ReadonlySet<string>): CopilotClaim {
  const item = object(value);
  if (!item) throw new CopilotAnswerValidationError(`claims[${index}] must be an object.`);
  if (item.kind !== "fact" && item.kind !== "hypothesis")
    throw new CopilotAnswerValidationError(`claims[${index}].kind must be fact or hypothesis.`);
  if (item.kind === "fact" && Array.isArray(item.citationIds) && item.citationIds.length === 0)
    throw new CopilotAnswerValidationError(`Factual claims require citations from the active snapshot.`);
  return {
    text: requiredText(item.text, `claims[${index}].text`),
    kind: item.kind,
    citationIds: citationIds(item.citationIds, `claims[${index}].citationIds`, known, item.kind === "fact"),
  };
}

function requiresGraphAuthority(text: string): boolean {
  return classifyConsequenceClaim(text) !== "other" ||
    /\b(?:canonical (?:identity|subject)|same (?:canonical )?(?:entity|object|record)|identity cluster|subject traceability|ontology[- ]resolved|engineering relationship|impact (?:path|chain)|causation|operational consequence|operational effect)\b/i.test(text);
}

export function classifyConsequenceClaim(text: string): ConsequenceClaimType {
  if (/\b(does not establish|cannot currently be determined|insufficient evidence|not enough evidence|no supported operational consequence|no operational consequence(?: can(?: currently)? be established)?|cannot be established)\b/i.test(text))
    return "relationship-not-established";
  if (/\b(inventory|production planning|procurement|compliance|manufacturing disruption|material.management|downstream cost|cost impact)\b/i.test(text))
    return "specific-operational-effect";
  if (/\b(same (?:steering )?investigation|participate in the same|shared investigation|same investigation subject)\b/i.test(text))
    return "same-subject-background";
  if (/\b(operationally represented|represented (?:as|by)|operational representation|maps? to|mapped to|corresponds to|linked to|connected to|dependency|depends on)\b/i.test(text))
    return "operational-representation-established";
  if (/\b(operational impact|operational consequence|may affect|could affect|impact path|downstream impact|could impact|may impact)\b/i.test(text))
    return "potential-operational-impact";
  return "other";
}

export function requiredConsequenceCitationType(claimType: ConsequenceClaimType): string {
  switch (claimType) {
    case "same-subject-background": return "investigation subject, subject participation, or selected entity";
    case "relationship-not-established": return "selected entity or matching unresolved evaluation";
    case "operational-representation-established": return "resolved WC_PART_TO_SAP_MATERIAL relationship";
    case "potential-operational-impact": return "resolved relationship and eligible impact path or chain";
    case "specific-operational-effect": return "explicit evidence for the stated operational effect";
    default: return "active-investigation citation";
  }
}

function specificEffectCategories(text: string): string[] {
  const categories: Readonly<Record<string, RegExp>> = {
    inventory: /\binventory|stock\b/i,
    "production-planning": /\bproduction|planning\b/i,
    procurement: /\bprocurement|purchas/i,
    compliance: /\bcompliance|regulatory\b/i,
    "manufacturing-disruption": /\bmanufactur|disruption\b/i,
    "material-management": /\bmaterial.?management\b/i,
    "downstream-cost": /\bdownstream cost|cost impact\b/i,
    "automatic-sap-changes": /\bautomatic(?:ally)? (?:update|change|propagat)/i,
    "guaranteed-propagation": /\bguaranteed propagation|guarantee(?:d)? (?:impact|change|propagation)/i,
  };
  return Object.entries(categories).flatMap(([category, pattern]) => pattern.test(text) ? [category] : []);
}

function validateConsequenceClaim(
  claim: CopilotClaim,
  context: CopilotContextPacket,
  index: number,
): void {
  const state = context.consequenceEvidenceState;
  if (!state) return;

  const claimType = classifyConsequenceClaim(claim.text);
  const citations = new Set(claim.citationIds);
  const citedAny = (allowed: readonly string[]) => allowed.some((id) => citations.has(id));
  const invalidClaim = (reason: string): never => {
    throw new CopilotAnswerValidationError(`claims[${index}] ${claimType} requires ${requiredConsequenceCitationType(claimType)}: ${reason}`);
  };

  if (claimType === "same-subject-background") {
    if (!state.sameInvestigationSubject)
      invalidClaim("the investigation does not establish shared subject participation.");
    if (!citedAny([
      ...state.sourceEntityCitationIds,
      ...state.targetEntityCitationIds,
      ...state.subjectTraceabilityCitationIds,
    ]))
      invalidClaim("no matching background citation was supplied.");
    return;
  }
  if (claimType === "relationship-not-established") {
    if (!citedAny([
      ...state.sourceEntityCitationIds,
      ...state.targetEntityCitationIds,
      ...state.unresolvedEvaluationCitationIds,
    ]))
      invalidClaim("no selected-entity or matching evaluation citation was supplied.");
    return;
  }
  if (claimType === "operational-representation-established") {
    if (!state.ontologyRelationshipEstablished ||
        !citedAny(state.resolvedRelationshipCitationIds))
      invalidClaim("the requested ontology-resolved relationship is not established or cited.");
    return;
  }
  if (claimType === "potential-operational-impact") {
    if (!state.ontologyRelationshipEstablished ||
        !citedAny(state.resolvedRelationshipCitationIds) ||
        !(state.eligibleImpactPathAvailable || state.eligibleImpactChainAvailable) ||
        !citedAny([...state.impactPathCitationIds, ...state.impactChainCitationIds]))
      invalidClaim("the required resolved relationship and eligible impact evidence are not both established and cited.");
    return;
  }
  if (claimType === "specific-operational-effect") {
    const categories = specificEffectCategories(claim.text);
    if (!categories.length || categories.some((category) =>
      !citedAny(state.specificEffectCitationIdsByCategory[category] ?? []),
    ))
      invalidClaim("no explicit evidence supports this specific operational effect.");
  }

  if (citedAny(state.subjectTraceabilityCitationIds))
    invalidClaim("subject-traceability citations support only shared-investigation background.");
}

function validateRecommendation(value: unknown, index: number, known: ReadonlySet<string>): CopilotRecommendation | undefined {
  try {
    const item = object(value);
    if (!item || item.approvalRequired !== true)
      throw new CopilotAnswerValidationError(`recommendations[${index}] must require engineer approval.`);
    return {
      text: requiredText(item.text, `recommendations[${index}].text`),
      rationale: requiredText(item.rationale, `recommendations[${index}].rationale`),
      citationIds: citationIds(item.citationIds, `recommendations[${index}].citationIds`, known, true),
      approvalRequired: true,
    };
  } catch {
    return undefined;
  }
}

export function validateCopilotAnswer(
  value: unknown,
  context: CopilotContextPacket,
  diagnostics?: CopilotValidationDiagnostics,
  retrievalCitations: readonly CopilotCitation[] = [],
): CopilotAnswer {
  const activeRetrievalCitations = context.questionIntent === "document" && !context.consequenceEvidenceState
    ? retrievalCitations
    : [];
  const retrievalCitationIds = new Set<string>();
  const graphCitationIds = new Set(context.citations.map((citation) => citation.citationId));
  for (const citation of activeRetrievalCitations) {
    if (citation.kind !== "retrieval-document" ||
        !/^cite:retrieval-document:v1:[^:]+:[^:]+:[^:]+$/.test(citation.citationId) ||
        !citation.label.trim() ||
        graphCitationIds.has(citation.citationId) ||
        retrievalCitationIds.has(citation.citationId)) {
      throw new CopilotAnswerValidationError("Active retrieval citations must be unique retrieval-document citations.");
    }
    retrievalCitationIds.add(citation.citationId);
  }
  const citationRecords = [...context.citations, ...activeRetrievalCitations];
  if (diagnostics) {
    diagnostics.promptCitationIds = citationRecords.slice(0, MAX_ITEMS).map((citation) => citation.citationId);
    diagnostics.providerCitationIds = [];
    diagnostics.unknownCitationIds = [];
    diagnostics.uncitedFactualClaimCount = 0;
    diagnostics.claimRequirements = [];
    diagnostics.validationOutcome = "failed";
  }
  const answer = object(value);
  if (!answer) throw new CopilotAnswerValidationError("Answer must be a JSON object.");
  if (!Number.isSafeInteger(answer.snapshotRevision) || answer.snapshotRevision !== context.snapshotRevision)
    throw new CopilotAnswerValidationError("Answer snapshot revision does not match the active investigation snapshot.");

  const answerText = requiredText(answer.answer, "answer", MAX_ANSWER_CHARS);
  if (!Array.isArray(answer.claims) || answer.claims.length > MAX_ITEMS)
    throw new CopilotAnswerValidationError("claims must be an array within the allowed item count.");
  if (!Array.isArray(answer.recommendations) || answer.recommendations.length > MAX_ITEMS)
    throw new CopilotAnswerValidationError("recommendations must be an array within the allowed item count.");

  const knownCitationIds = new Set(citationRecords.map((citation) => citation.citationId));
  if (diagnostics) {
    const rawClaims = Array.isArray(answer.claims) ? answer.claims : [];
    const rawRecommendations = Array.isArray(answer.recommendations) ? answer.recommendations : [];
    const returnedIds = [
      ...rawClaims.flatMap((claim) => {
        const item = object(claim);
        return Array.isArray(item?.citationIds)
          ? item.citationIds.filter((id): id is string => typeof id === "string")
          : [];
      }),
      ...rawRecommendations.flatMap((recommendation) => {
        const item = object(recommendation);
        return Array.isArray(item?.citationIds)
          ? item.citationIds.filter((id): id is string => typeof id === "string")
          : [];
      }),
    ];
    diagnostics.providerCitationIds = [...new Set(returnedIds)].slice(0, MAX_ITEMS);
    diagnostics.unknownCitationIds = diagnostics.providerCitationIds
      .filter((id) => !knownCitationIds.has(id))
      .slice(0, MAX_ITEMS);
    diagnostics.uncitedFactualClaimCount = rawClaims.filter((claim) => {
      const item = object(claim);
      return item?.kind === "fact" && (!Array.isArray(item.citationIds) || item.citationIds.length === 0);
    }).length;
    diagnostics.claimRequirements = rawClaims.flatMap((claim) => {
      const item = object(claim);
      if (typeof item?.text !== "string") return [];
      const claimType = classifyConsequenceClaim(item.text);
      return [{ claimType, requiredCitationType: requiredConsequenceCitationType(claimType) }];
    }).slice(0, MAX_ITEMS);
  }
  if (context.consequenceEvidenceState) {
    const allowed = new Set(context.consequenceEvidenceState.allowedCitationIds);
    const known = new Set(context.citations.map((citation) => citation.citationId));
    for (const id of diagnostics?.providerCitationIds ?? []) {
      if (known.has(id) && !allowed.has(id))
        throw new CopilotAnswerValidationError("The M2 answer contains a citation outside the consequence evidence state.");
    }
  }
  const claims = answer.claims.map((claim, index) => validateClaim(claim, index, knownCitationIds));
  claims.forEach((claim, index) => {
    if (requiresGraphAuthority(claim.text) &&
        claim.citationIds.some((id) => retrievalCitationIds.has(id)) &&
        !claim.citationIds.some((id) => graphCitationIds.has(id))) {
      throw new CopilotAnswerValidationError(
        `claims[${index}] retrieval citations cannot substantiate graph-authority claims.`,
      );
    }
  });
  claims.forEach((claim, index) => validateConsequenceClaim(claim, context, index));
  if (context.consequenceEvidenceState) {
    const answerType = classifyConsequenceClaim(answerText);
    if (answerType !== "other" && !claims.some((claim) => classifyConsequenceClaim(claim.text) === answerType))
      throw new CopilotAnswerValidationError(`The answer contains an uncited ${answerType} claim.`);
    const answerEffectCategories = specificEffectCategories(answerText);
    if (answerEffectCategories.some((category) => !claims.some((claim) =>
      specificEffectCategories(claim.text).includes(category) &&
      (context.consequenceEvidenceState?.specificEffectCitationIdsByCategory[category] ?? [])
        .some((id) => claim.citationIds.includes(id)),
    )))
      throw new CopilotAnswerValidationError("The answer contains an uncited specific operational effect.");
    if (context.consequenceEvidenceState.allowedConclusion === "insufficient-evidence") {
      const makesPositiveRepresentationClaim =
        /\b(?:is|are|was|were|has been|will be)\s+(?:operationally\s+)?(?:represented (?:as|by)|linked to|connected to)\b|\b(?:has|have) an operational dependency\b/i.test(answerText) &&
        !/\b(?:does not establish|cannot|insufficient evidence|not enough evidence)\b[^.!?]*\b(?:represented|linked|connected|dependency)\b/i.test(answerText);
      if (makesPositiveRepresentationClaim)
        throw new CopilotAnswerValidationError("The answer asserts an operational representation not established by the consequence evidence state.");
    }
  }
  const recommendations = answer.recommendations.flatMap((recommendation, index) => {
    const validated = validateRecommendation(recommendation, index, knownCitationIds);
    if (validated &&
        requiresGraphAuthority(`${validated.text} ${validated.rationale}`) &&
        validated.citationIds.some((id) => retrievalCitationIds.has(id)) &&
        !validated.citationIds.some((id) => graphCitationIds.has(id))) {
      throw new CopilotAnswerValidationError(
        `recommendations[${index}] retrieval citations cannot substantiate graph-authority claims.`,
      );
    }
    return validated ? [validated] : [];
  });
  const usedCitationIds = new Set([...claims.flatMap((claim) => claim.citationIds), ...recommendations.flatMap((recommendation) => recommendation.citationIds)]);

  const validatedAnswer = {
    answer: answerText,
    claims,
    recommendations,
    uncertainties: textArray(answer.uncertainties, "uncertainties"),
    followUpQuestions: textArray(answer.followUpQuestions, "followUpQuestions"),
    snapshotRevision: context.snapshotRevision,
    citations: citationRecords.filter((citation) => usedCitationIds.has(citation.citationId)),
  };
  if (diagnostics) diagnostics.validationOutcome = "passed";
  return validatedAnswer;
}