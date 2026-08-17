import type { EnterpriseSource, MatchType } from "@/types/item-explorer";
export const enterpriseSources: EnterpriseSource[] = ["teamcenter", "windchill", "sap", "configit"];
export const sourceMeta: Record<EnterpriseSource, { label: string; domain: string; marker: string }> = {
  teamcenter: { label: "Teamcenter", domain: "Product lifecycle management", marker: "TC" },
  windchill: { label: "Windchill", domain: "Product lifecycle management", marker: "WC" },
  sap: { label: "SAP", domain: "Enterprise resource planning", marker: "SAP" },
  configit: { label: "Configit", domain: "Product configuration", marker: "CFG" },
};
export const matchLabels: Record<MatchType, string> = {
  "exact-name": "Exact name", "name-contains": "Name match", "description-match": "Description match",
  "exact-id": "Exact identifier", "id-prefix": "Identifier prefix", "nearby-id": "Nearby identifier", "source-result": "Source result",
};
