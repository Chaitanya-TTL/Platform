import { describe, expect, it } from "vitest";
import type { EngineeringIntelligenceInvestigationV1, EngineeringProvenance, IntelligenceEntity, IntelligenceProperty } from "../contracts/intelligence-v1";
import { buildIntelligenceInvestigation } from "../engines/build-intelligence-investigation";
import { buildHierarchicalLatticeExport } from "../export/hierarchical-json-export";
import { mergeSourceIntelligence } from "../infrastructure/merge-source-intelligence";
import { projectIntelligenceExperience } from "../projection/intelligence-domain-projection";
import { attachLiveWindchillPartNumber } from "../plm-brain/source-adapters/windchill-part-identity";

const temporal = { capturedAt: "2026-10-22T00:00:00.000Z", assembledAt: "2026-10-22T00:00:01.000Z", freshness: "current" as const };
const provenance = (source: "windchill" | "sap" | "configit" | "codebeamer", nativeId: string): EngineeringProvenance => ({ source, provider: `${source}-connector`, nativeId, observedAt: temporal.capturedAt!, authority: "source-authoritative" });
const text = (value: string): IntelligenceProperty => ({ type: "text", text: value });
const list = (...items: string[]): IntelligenceProperty => ({ type: "list", items });
const entity = (id: string, source: "windchill" | "sap" | "configit" | "codebeamer", kind: string, properties: Record<string, IntelligenceProperty>): IntelligenceEntity => ({ id, kind, displayName: id, identityQuality: "native", assertion: "fact", properties, provenance: provenance(source, id), temporal });
const investigation = (source: "windchill" | "sap" | "configit" | "codebeamer", item: IntelligenceEntity): EngineeringIntelligenceInvestigationV1 => ({
  contractVersion: "1.0",
  investigationId: `investigation-${source}`,
  subject: { id: `subject:${source}`, displayName: item.displayName, preferredProductId: item.provenance.nativeId, candidateIds: [item.id], confidence: "verified", reasons: ["selected source-native item"], provenance: provenance(source, `subject:${source}`), temporal },
  entities: [item],
  relationships: [],
  evidence: [{ id: `evidence:${source}`, kind: "source-extraction", summary: `${source} item extracted`, source, provenance: provenance(source, item.id), temporal }],
  findings: [],
  sources: [{ entityId: item.id, source, status: "available", provenance: item.provenance }],
  identityClusters: [],
  temporal,
  summary: { entityCount: 1, relationshipCount: 0, evidenceCount: 1, findingCount: 0, availableSourceCount: 1, partialSourceCount: 0, status: "success" },
});

describe("universal PLM Brain runtime", () => {
  it("exports the approved SAP/Configit pilot edge while explaining unselected rules", () => {
    const sap = entity("sap:material:MAT7893", "sap", "material", { materialNumber: text("MAT7893") });
    const configitBase = entity("configit:subject:305", "configit", "source-representation", { preferredProductId: text("305"), productModelCode: text("STR") });
    const configit = { ...configitBase, provenance: provenance("configit", "305") };
    const requirements = ["1190", "1191", "1192", "1194"].map(id =>
      entity(`codebeamer:item:${id}`, "codebeamer", "requirement", { itemId: text(id), externalKey: text(`CRS-${id}`) }),
    );
    const sapResult = investigation("sap", sap);
    const sapSelected: EngineeringIntelligenceInvestigationV1 = {
      ...sapResult,
      subject: { ...sapResult.subject, preferredProductId: "MAT7893", provenance: provenance("sap", "MAT7893") },
      sources: [{ entityId: sap.id, source: "sap", status: "available", provenance: provenance("sap", "MAT7893") }],
    };
    const merged = mergeSourceIntelligence([
      sapSelected,
      investigation("configit", configit),
      ...requirements.map(requirement => investigation("codebeamer", requirement)),
    ]);
    const exported = buildHierarchicalLatticeExport(buildIntelligenceInvestigation(merged));
    const diagnostics = exported.metadata.universalRelationshipDiagnostics!;
    const sapConfigitEvaluation = exported.universalRelationshipEvaluations.find(item => item.ruleId === "SAP_MATERIAL_TO_CONFIGIT_MODEL");

    const approvedRelationship = exported.relationships.find(item => item.ruleId === "SAP_MATERIAL_TO_CONFIGIT_MODEL");
    expect(approvedRelationship).toMatchObject({
      family: "plm-brain-universal",
      kind: "supplies-material-for",
      verified: true,
      ruleId: "SAP_MATERIAL_TO_CONFIGIT_MODEL",
    });
    expect(exported.universalRelationshipEvidence).toHaveLength(1);
    expect(exported.universalRelationshipEvidence[0]).toMatchObject({
      mechanism: "domain-owner-approved-pilot",
      approvalBasis: "domain-owner-confirmed",
    });
    expect(diagnostics.confirmedCount).toBe(1);
    expect(exported.universalRelationshipEvaluations).toHaveLength(5);
    expect(exported.universalRelationshipEvaluations.every(item => item.sourceCandidates.length <= 50 && item.targetCandidates.length <= 50)).toBe(true);
    expect(exported.universalRelationshipEvaluations.every(item => Array.isArray(item.compatibleSourceCandidates) && Array.isArray(item.compatibleTargetCandidates) && Boolean(item.reasonCode && item.reason))).toBe(true);
    expect(sapConfigitEvaluation).toMatchObject({
      status: "confirmed",
      reasonCode: "confirmed",
      sourceCandidates: expect.arrayContaining([expect.objectContaining({ nativeId: "MAT7893", identityProperties: { materialNumber: "MAT7893" } })]),
      targetCandidates: expect.arrayContaining([expect.objectContaining({ nativeId: "305", kind: "source-representation" })]),
      compatibleTargetCandidates: expect.arrayContaining([expect.objectContaining({ nativeId: "305", kind: "source-representation" })]),
    });
    expect(diagnostics.unresolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "WC_PART_TO_SAP_MATERIAL", reason: "No source-authoritative windchill endpoint was selected." }),
      expect.objectContaining({ ruleId: "WC_PART_TO_CONFIGIT_MODEL", reason: "No source-authoritative windchill endpoint was selected." }),
      expect.objectContaining({ ruleId: "WC_PART_TO_CB_REQUIREMENT", reason: "No source-authoritative windchill endpoint was selected." }),
      expect.objectContaining({ ruleId: "CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL", reason: expect.stringContaining("none of its observed kinds match the rule") }),
    ]));
  });

  it("exports live Windchill part and SAP material identifiers on their relationship", () => {
    const partNativeId = "OR:wt.part.WTPart:48291";
    const materialNativeId = "0000000000000048291";
    const partWithoutIdentity = { ...entity("windchill:root:48291", "windchill", "part-occurrence", {}), provenance: provenance("windchill", partNativeId) };
    const [part] = attachLiveWindchillPartNumber([partWithoutIdentity], partWithoutIdentity.id, materialNativeId, "live");
    const material = { ...entity("sap:material:48291", "sap", "material", { materialNumber: text(materialNativeId) }), provenance: provenance("sap", materialNativeId) };
    const sapResult = investigation("sap", material);
    const sapSubjectOnly: EngineeringIntelligenceInvestigationV1 = {
      ...sapResult,
      entities: [],
      subject: { ...sapResult.subject, id: material.id, preferredProductId: materialNativeId, provenance: provenance("sap", materialNativeId) },
      sources: [{ entityId: material.id, source: "sap", status: "available", provenance: provenance("sap", "MAT7893") }],
      summary: { ...sapResult.summary, entityCount: 0 },
    };
    const merged = mergeSourceIntelligence([investigation("windchill", part), sapSubjectOnly]);
    const exported = buildHierarchicalLatticeExport(buildIntelligenceInvestigation(merged));
    const relationship = exported.relationships.find(item => item.kind === "operationally-represented-as");

    expect(relationship?.sourceEndpoint).toMatchObject({ source: "windchill", kind: "part-occurrence", nativeId: partNativeId });
    expect(relationship?.targetEndpoint).toMatchObject({ source: "sap", kind: "source-representation", nativeId: materialNativeId });
    expect(relationship?.ruleId).toBe("WC_PART_TO_SAP_MATERIAL");
    expect(relationship?.evidenceDetails[0].source.value).toBe(materialNativeId);
  });

  it("does not promote a capability-only Windchill number into relationship evidence", () => {
    const windchillPart = { ...entity("windchill:root:1", "windchill", "part-occurrence", {}), provenance: provenance("windchill", "OR:wt.part.WTPart:1") };
    const [unchanged] = attachLiveWindchillPartNumber([windchillPart], windchillPart.id, "MAT-1", "capability");
    expect(unchanged.properties.partNumber).toBeUndefined();
  });

  it("preserves the confirmed relationship and full proof in the Lattice JSON export", () => {
    const resourceUri = "https://windchill.example/oslc/parts/part-42";
    const windchillPart = entity("windchill:part:42", "windchill", "part", { windchillResourceUri: text(resourceUri) });
    const requirement = entity("codebeamer:requirement:77", "codebeamer", "requirement", { oslcTraceLinkTargetUris: list(resourceUri) });
    const merged = mergeSourceIntelligence([investigation("windchill", windchillPart), investigation("codebeamer", requirement)]);
    const graph = buildIntelligenceInvestigation(merged);
    const exported = buildHierarchicalLatticeExport(graph);
    const projection = projectIntelligenceExperience(graph, { expanded: new Set(), selectedId: undefined });
    const relationship = exported.relationships.find(item => item.kind === "specified-by");
    const evidence = exported.universalRelationshipEvidence[0];

    expect(relationship).toMatchObject({ source: windchillPart.id, target: requirement.id, family: "plm-brain-universal", verified: true });
    expect(relationship?.evidenceIds).toHaveLength(1);
    expect(evidence).toMatchObject({ ruleId: "WC_PART_TO_CB_REQUIREMENT", status: "source-explicit", mechanism: "codebeamer-oslc-trace-link" });
    expect(evidence.source).toMatchObject({ entityId: windchillPart.id, attributePath: "properties.windchillResourceUri", value: resourceUri, provider: "windchill-connector" });
    expect(evidence.target).toMatchObject({ entityId: requirement.id, attributePath: "properties.oslcTraceLinkTargetUris", value: resourceUri, provider: "codebeamer-connector" });
    expect(evidence.technicalContext.protocol).toBe("OSLC");
    expect(exported.metadata.universalRelationshipDiagnostics?.confirmedCount).toBe(1);
    expect(projection.nodes.some(node => node.id === windchillPart.id)).toBe(true);
    expect(projection.nodes.some(node => node.id === requirement.id)).toBe(true);
    expect(projection.edges.some(edge => edge.id === relationship?.id && edge.kind === "specified-by")).toBe(true);
  });
});