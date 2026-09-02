import { describe, expect, it } from "vitest";
import {
  formatWindchillFileSize,
  platformWindchillDownloadUrl,
  windchillRequirementQuery,
} from "../../../lib/windchill-requirements";
describe("Windchill requirements platform helpers", () => {
  it("selects deterministic query modes", () => {
    expect(windchillRequirementQuery("Stearing")).toEqual({
      type: "part-name",
      parameter: "partName",
      value: "Stearing",
    });
    expect(windchillRequirementQuery("0000003865").type).toBe("part-number");
    expect(
      windchillRequirementQuery("ignored", "OR:wt.part.WTPart:1710308").type,
    ).toBe("part-oid");
  });
  it("accepts only protected platform download routes", () => {
    expect(
      platformWindchillDownloadUrl(
        "/api/engineering/windchill/content/primary?documentId=x",
      ),
    ).toBe("/api/windchill/content/primary?documentId=x");
    expect(() =>
      platformWindchillDownloadUrl("http://windchill/private"),
    ).toThrow(/Untrusted/);
  });
  it("formats confirmed file sizes", () => {
    expect(formatWindchillFileSize(64000)).toBe("62.5 KB");
    expect(formatWindchillFileSize(39931)).toBe("39.0 KB");
  });
});
