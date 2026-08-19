import type { EnterpriseSource } from "@/types/item-explorer";
export const latticeSources: EnterpriseSource[] = ["teamcenter", "windchill", "sap", "configit"];
export const latticeSourceMeta: Record<EnterpriseSource, { label: string; domain: string; short: string; color: string; glow: string }> = {
  teamcenter: { label: "Teamcenter", domain: "PLM", short: "TC", color: "#22d3ee", glow: "rgba(34,211,238,.38)" },
  windchill: { label: "Windchill", domain: "PLM", short: "WC", color: "#818cf8", glow: "rgba(129,140,248,.38)" },
  sap: { label: "SAP", domain: "ERP", short: "SAP", color: "#34d399", glow: "rgba(52,211,153,.38)" },
  configit: { label: "Configit", domain: "CPQ", short: "CFG", color: "#c084fc", glow: "rgba(192,132,252,.38)" },
};
