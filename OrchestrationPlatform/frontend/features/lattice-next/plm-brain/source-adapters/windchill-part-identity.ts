import type { IntelligenceEntity } from "../../contracts/intelligence-v1";

export function attachLiveWindchillPartNumber(
  entities: readonly IntelligenceEntity[],
  sourceEntityId: string,
  partNumber: string | undefined,
  discoveryProviderMode: string | undefined,
): IntelligenceEntity[] {
  const normalized = partNumber?.trim();
  if (!normalized || discoveryProviderMode !== "live") return [...entities];

  return entities.map((entity) => {
    if (
      entity.id !== sourceEntityId ||
      entity.provenance.source !== "windchill" ||
      entity.provenance.authority !== "source-authoritative"
    ) return entity;

    return {
      ...entity,
      properties: {
        ...entity.properties,
        partNumber: { type: "text", text: normalized },
      },
    };
  });
}