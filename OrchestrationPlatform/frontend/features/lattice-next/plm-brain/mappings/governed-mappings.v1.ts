import type { GovernedMappingRecord } from "../contracts/governed-mapping";

const pilotVerification = {
  basis: "domain-owner-confirmed" as const,
  verifiedBy: "Lattice pilot domain approver",
  verifiedAt: "2026-10-21T00:00:00.000Z",
  mappingVersion: "1.0",
  reference: "PLM Brain pilot relationship review 2026-10-21",
};

const windchillPart = {
  application: "windchill" as const,
  objectType: "WTPart",
  entityKinds: ["part", "component", "source-representation"] as const,
  attributePath: "provenance.nativeId" as const,
  expectedValue: "OR:wt.part.WTPart:1717121",
};

export const GOVERNED_PLM_MAPPINGS_V1 = Object.freeze([
  {
    schemaVersion: "1.0",
    mappingId: "MAP-WC-SAP-STEERING-V1",
    relationshipType: "operationally-represented-as",
    source: windchillPart,
    target: {
      application: "sap",
      objectType: "MaterialMaster",
      entityKinds: ["material", "material-master", "source-representation"],
      attributePath: "properties.preferredProductId",
      expectedValue: "MAT7893",
    },
    scope: {
      sourceInstance: "current-poc-windchill",
      targetInstance: "current-poc-sap-dataset",
    },
    verification: pilotVerification,
    enabled: true,
  },
  {
    schemaVersion: "1.0",
    mappingId: "MAP-WC-CONFIGIT-STEERING-V1",
    relationshipType: "configured-by",
    source: windchillPart,
    target: {
      application: "configit",
      objectType: "AuthoringWorkItem",
      entityKinds: ["source-representation", "product-context"],
      attributePath: "provenance.nativeId",
      expectedValue: "305",
    },
    scope: {
      sourceInstance: "current-poc-windchill",
      targetInstance: "current-poc-configit",
    },
    verification: pilotVerification,
    enabled: true,
  },
  ...["1190", "1191", "1192", "1194"].map((itemId) => ({
    schemaVersion: "1.0" as const,
    mappingId: `MAP-WC-CB-${itemId}-STEERING-V1`,
    relationshipType: "specified-by" as const,
    source: windchillPart,
    target: {
      application: "codebeamer" as const,
      objectType: "TrackerItem",
      entityKinds: ["requirement", "requirement-revision"],
      attributePath: "properties.itemId" as const,
      expectedValue: itemId,
    },
    scope: {
      sourceInstance: "current-poc-windchill",
      targetInstance: "primary-codebeamer",
      projectId: "9",
      trackerId: "9734",
    },
    verification: pilotVerification,
    enabled: true,
  })),
] satisfies GovernedMappingRecord[]);
