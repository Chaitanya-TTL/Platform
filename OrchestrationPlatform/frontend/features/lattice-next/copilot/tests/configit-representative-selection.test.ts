import { describe, expect, it } from "vitest";
import type { CopilotEntityContext } from "../contracts";
import { selectConfigitRepresentative } from "../context-builder";

function configitEntity(
  entityId: string,
  kind: string,
  displayName: string,
  nativeId?: string,
  properties: Readonly<Record<string, string>> = {},
): CopilotEntityContext {
  return {
    entityId,
    citationId: `cite:entity:${encodeURIComponent(entityId)}`,
    displayName,
    kind,
    identityQuality: "native",
    source: "configit",
    ...(nativeId ? { nativeId } : {}),
    properties,
    freshness: "current",
  };
}

const hierarchy = [
  configitEntity("configit:metadata:status", "product-detail", "Status", "InProgress"),
  configitEntity("configit:rule:valid", "configuration-rule", "Valid market rule"),
  configitEntity("configit:feature:heated", "feature", "Heated steering"),
  configitEntity("configit:family:mrkt", "configuration-family", "Market", "MRKT"),
  configitEntity("configit:model:configuration", "configuration-model", "Steering configuration"),
  configitEntity("configit:context:steering", "product-context", "Steering context"),
  configitEntity("configit:model:product", "product-model", "Steering model"),
  configitEntity(
    "configit:subject:305",
    "source-representation",
    "Steering",
    "305",
    { sourceRole: "participating-source-subject" },
  ),
];

describe("Configit representative selection", () => {
  it("selects a work-item subject before a recognizable configuration family", () => {
    expect(selectConfigitRepresentative(hierarchy)?.entityId).toBe("configit:subject:305");
  });

  it.each([
    ["product model", "configit:model:product"],
    ["product context", "configit:context:steering"],
    ["configuration model", "configit:model:configuration"],
    ["configuration family", "configit:family:mrkt"],
    ["feature", "configit:feature:heated"],
    ["rule", "configit:rule:valid"],
    ["metadata", "configit:metadata:status"],
  ])("falls back deterministically to %s when higher-level entities are absent", (_label, expectedId) => {
    const expectedIndex = hierarchy.findIndex((entity) => entity.entityId === expectedId);
    const candidates = hierarchy.slice(0, expectedIndex + 1);
    expect(selectConfigitRepresentative(candidates)?.entityId).toBe(expectedId);
  });

  it("uses a stable entity-ID tie-breaker within the same semantic level", () => {
    const candidates = [
      configitEntity("configit:family:z", "configuration-family", "AAA family", "AAA"),
      configitEntity("configit:family:a", "configuration-family", "ZZZ family", "ZZZ"),
    ];
    expect(selectConfigitRepresentative(candidates)?.entityId).toBe("configit:family:a");
  });

  it("returns no representative when no Configit entities are available", () => {
    expect(selectConfigitRepresentative([])).toBeUndefined();
  });
});
