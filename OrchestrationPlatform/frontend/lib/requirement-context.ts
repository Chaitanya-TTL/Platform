import type { SourceType } from "@/types/bom-comparison";

export type RequirementContext = {
  title: string;
  source: "Codebeamer";
  mode: "simulated" | "live";
};

const SCREWJACK_REQUIREMENT: RequirementContext = {
  title: "Design a Screwjack with 2 Top Heads",
  source: "Codebeamer",
  mode: "simulated",
};

const BIKE_REQUIREMENT: RequirementContext = {
  title: "Design a Bike Assembly with 2 Wheels",
  source: "Codebeamer",
  mode: "simulated",
};

export function resolveRequirementContext(
  source: SourceType,
  identifier?: string | null,
): RequirementContext | null {
  const value = identifier?.trim().toLowerCase() ?? "";
  if (source === "teamcenter" && value === "002403")
    return SCREWJACK_REQUIREMENT;
  if (source === "configit" && value.includes("002403"))
    return SCREWJACK_REQUIREMENT;
  if (source === "windchill" && value) return BIKE_REQUIREMENT;
  return null;
}
