import type { IntelligenceEntity } from "../../../contracts/intelligence-v1";
import { universalRelationshipDefinitions } from "../catalog/universal-rules";
import { universalEvidenceResolvers } from "../resolvers/resolver-registry";
import { verifiedIdentityProperties } from "../resolvers/verified-property";
import type {
  UniversalEndpointCandidate,
  UniversalRelationship,
  UniversalRelationshipEvaluation,
  UniversalRelationshipEvidence,
} from "../contracts/universal-relationship";

const clean = (value: string) => value.replace(/[^a-zA-Z0-9_.:-]/g, "_");
const EVALUATION_CANDIDATE_LIMIT = 50;

const endpointCandidate = (entity: IntelligenceEntity): UniversalEndpointCandidate => ({
  entityId: entity.id,
  application: entity.provenance.source!,
  kind: entity.kind,
  displayName: entity.displayName,
  nativeId: entity.provenance.nativeId,
  identityProperties: verifiedIdentityProperties(
    entity,
    entity.provenance.source as "windchill" | "sap" | "configit" | "codebeamer",
  ),
});

const approvedIdentity = (entity: IntelligenceEntity) => {
  const application = entity.provenance.source as "windchill" | "sap" | "configit" | "codebeamer";
  const properties = verifiedIdentityProperties(entity, application);
  const preferredKeys: Record<typeof application, string[]> = {
    windchill: ["partNumber", "preferredProductId"],
    sap: ["materialNumber", "preferredProductId"],
    configit: ["workItemId", "productModelCode", "preferredProductId"],
    codebeamer: ["externalKey", "itemId", "preferredProductId"],
  };
  const propertyKey = preferredKeys[application].find((key) => typeof properties[key] === "string");
  return propertyKey
    ? { path: `properties.${propertyKey}`, value: properties[propertyKey] as string }
    : { path: "provenance.nativeId", value: entity.provenance.nativeId };
};

const propertyText = (entity: IntelligenceEntity, key: string) => entity.properties[key]?.text;

const isApprovedPilotEndpoint = (
  ruleId: string,
  entity: IntelligenceEntity,
  side: "source" | "target",
  candidates: IntelligenceEntity[],
) => {
  if (ruleId === "WC_PART_TO_CB_REQUIREMENT" && side === "target") {
    return entity.kind === "requirement" && propertyText(entity, "presentationRole") === "selected-requirement";
  }
  if (ruleId === "CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL" && side === "source") {
    return entity.kind === "requirement" && propertyText(entity, "relationshipContext") === "parent";
  }
  const concreteCandidates = candidates.filter((candidate) => candidate.kind !== "source-representation");
  if (concreteCandidates.length === 1) return entity.id === concreteCandidates[0].id;
  if (entity.kind === "source-representation") {
    return propertyText(entity, "sourceRole") === "participating-source-subject" && concreteCandidates.length === 0;
  }
  return propertyText(entity, "presentationRole") === "selected-requirement";
};

const isEndpoint = (
  entity: IntelligenceEntity,
  kinds: string[],
  ruleId: string,
  side: "source" | "target",
) => kinds.includes(entity.kind) || (
  ruleId === "CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL" &&
  side === "source" &&
  entity.kind === "requirement" &&
  propertyText(entity, "relationshipContext") === "parent"
);

export const resolveUniversalRelationships = (
  entities: IntelligenceEntity[],
  evaluatedAt = new Date().toISOString(),
) => {
  const relationships: UniversalRelationship[] = [];
  const evidence: UniversalRelationshipEvidence[] = [];
  const unresolved: { ruleId: string; sourceEntityId?: string; reason: string }[] = [];
  const evaluations: UniversalRelationshipEvaluation[] = [];

  for (const definition of universalRelationshipDefinitions) {
    const observedSources = entities.filter(
      (entity) => entity.provenance.source === definition.sourceApplication &&
        entity.provenance.authority === "source-authoritative",
    );
    const observedTargets = entities.filter(
      (entity) => entity.provenance.source === definition.targetApplication &&
        entity.provenance.authority === "source-authoritative",
    );
    const sources = observedSources.filter((entity) => isEndpoint(entity, definition.sourceKinds, definition.ruleId, "source"));
    const targets = observedTargets.filter((entity) => isEndpoint(entity, definition.targetKinds, definition.ruleId, "target"));
    const relevantCandidates = (items: IntelligenceEntity[], compatibleKinds: string[], side: "source" | "target") => items.filter((entity) => {
      if (isEndpoint(entity, compatibleKinds, definition.ruleId, side)) return true;
      return entity.properties.sourceRole?.text === "participating-source-subject" ||
        entity.properties.presentationRole?.text === "selected-requirement";
    });
    const relevantSources = relevantCandidates(observedSources, definition.sourceKinds, "source");
    const relevantTargets = relevantCandidates(observedTargets, definition.targetKinds, "target");
    const sourceCandidates = relevantSources.slice(0, EVALUATION_CANDIDATE_LIMIT).map(endpointCandidate);
    const targetCandidates = relevantTargets.slice(0, EVALUATION_CANDIDATE_LIMIT).map(endpointCandidate);
    const compatibleSourceCandidates = sources.slice(0, EVALUATION_CANDIDATE_LIMIT).map(endpointCandidate);
    const compatibleTargetCandidates = targets.slice(0, EVALUATION_CANDIDATE_LIMIT).map(endpointCandidate);
    const evidenceIds: string[] = [];
    let matchedPairCount = 0;

    for (const source of sources) {
      let found = false;
      for (const target of targets) {
        if (source.id === target.id) continue;
        let result = universalEvidenceResolvers[definition.ruleId](source, target);
        if (
          result.status === "not-resolvable" &&
          definition.approval?.scope === "selected-investigation-subject" &&
          isApprovedPilotEndpoint(definition.ruleId, source, "source", sources) &&
          isApprovedPilotEndpoint(definition.ruleId, target, "target", targets)
        ) {
          const sourceIdentity = approvedIdentity(source);
          const targetIdentity = approvedIdentity(target);
          result = {
            status: "confirmed",
            mechanism: "domain-owner-approved-pilot",
            approvalBasis: definition.approval.basis,
            sourcePath: sourceIdentity.path,
            targetPath: targetIdentity.path,
            sourceValue: sourceIdentity.value,
            targetValue: targetIdentity.value,
            reason: "The domain owner approved this pilot relationship for the selected investigation subject; endpoint identifiers are preserved independently and are not compared.",
          };
        }
        if (
          (result.status !== "confirmed" && result.status !== "source-explicit") ||
          !result.mechanism ||
          !definition.mechanisms.includes(result.mechanism) ||
          !result.sourcePath ||
          !result.targetPath ||
          !result.sourceValue ||
          !result.targetValue
        ) continue;

        found = true;
        matchedPairCount += 1;
        const evidenceId = clean(`evidence:${definition.ruleId}:${source.id}:${target.id}`);
        evidenceIds.push(evidenceId);
        evidence.push({
          id: evidenceId,
          ruleId: definition.ruleId,
          status: result.status,
          mechanism: result.mechanism,
          approvalBasis: result.approvalBasis,
          reason: result.reason,
          source: {
            entityId: source.id,
            application: definition.sourceApplication,
            attributePath: result.sourcePath,
            value: result.sourceValue,
            provider: source.provenance.provider,
            observedAt: source.provenance.observedAt,
          },
          target: {
            entityId: target.id,
            application: definition.targetApplication,
            attributePath: result.targetPath,
            value: result.targetValue,
            provider: target.provenance.provider,
            observedAt: target.provenance.observedAt,
          },
          technicalContext: definition.technicalContext,
          evaluatedAt,
        });
        relationships.push({
          id: clean(`relationship:${definition.ruleId}:${source.id}:${target.id}`),
          ruleId: definition.ruleId,
          type: definition.type,
          status: result.status,
          approvalBasis: result.approvalBasis,
          sourceEntityId: source.id,
          targetEntityId: target.id,
          evidenceId,
        });
      }
      if (!found) unresolved.push({
        ruleId: definition.ruleId,
        sourceEntityId: source.id,
        reason: "no accepted deterministic application-level linkage evidence",
      });
    }

    let status: UniversalRelationshipEvaluation["status"] = "confirmed";
    let reasonCode: UniversalRelationshipEvaluation["reasonCode"] = "confirmed";
    let reason = `${matchedPairCount} endpoint pair(s) confirmed by accepted evidence.`;
    if (!sources.length) {
      status = observedSources.length ? "unresolved" : "not-applicable";
      reasonCode = "source-endpoint-not-selected";
      reason = observedSources.length
        ? `Source application was selected, but none of its observed kinds match the rule. Expected: ${definition.sourceKinds.join(", ")}.`
        : `No source-authoritative ${definition.sourceApplication} endpoint was selected.`;
      unresolved.push({ ruleId: definition.ruleId, reason });
    } else if (!targets.length) {
      status = observedTargets.length ? "unresolved" : "not-applicable";
      reasonCode = "target-endpoint-not-selected";
      reason = observedTargets.length
        ? `Target application was selected, but none of its observed kinds match the rule. Expected: ${definition.targetKinds.join(", ")}.`
        : `No source-authoritative ${definition.targetApplication} endpoint was selected.`;
      for (const source of sources) unresolved.push({ ruleId: definition.ruleId, sourceEntityId: source.id, reason });
    } else if (matchedPairCount === 0) {
      status = "unresolved";
      reasonCode = "linkage-evidence-not-found";
      reason = "Matching application endpoint types were selected, but no accepted deterministic linkage evidence was observed.";
    }

    evaluations.push({
      ruleId: definition.ruleId,
      relationshipType: definition.type,
      status,
      sourceApplication: definition.sourceApplication,
      sourceKinds: [...definition.sourceKinds],
      targetApplication: definition.targetApplication,
      targetKinds: [...definition.targetKinds],
      sourceCandidates,
      targetCandidates,
      compatibleSourceCandidates,
      compatibleTargetCandidates,
      sourceCandidateCount: relevantSources.length,
      targetCandidateCount: relevantTargets.length,
      sourceCandidatesTruncated: relevantSources.length > EVALUATION_CANDIDATE_LIMIT,
      targetCandidatesTruncated: relevantTargets.length > EVALUATION_CANDIDATE_LIMIT,
      observedSourceKinds: [...new Set(observedSources.map((entity) => entity.kind))].sort(),
      observedTargetKinds: [...new Set(observedTargets.map((entity) => entity.kind))].sort(),
      evidenceIds,
      reasonCode,
      reason,
      technicalContext: definition.technicalContext,
      evaluatedAt,
    });
  }

  return {
    schemaVersion: "2.0" as const,
    relationships: [...new Map(relationships.map((item) => [item.id, item])).values()],
    evidence: [...new Map(evidence.map((item) => [item.id, item])).values()],
    unresolved,
    evaluations,
  };
};