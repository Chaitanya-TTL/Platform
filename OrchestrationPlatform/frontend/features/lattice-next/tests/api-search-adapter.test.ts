import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceSearchResult } from "@/types/item-explorer";
import { ApiSearchAdapter } from "../discovery/source-adapters/api-search-adapter";

describe("API search adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves false boolean context values in normalized source metadata", async () => {
    const payload: SourceSearchResult = {
      source: "sap",
      status: "complete",
      durationMs: 1,
      capabilities: {
        nameSearch: true,
        itemIdSearch: true,
        nearbyIds: false,
        live: true,
      },
      candidates: [
        {
          candidateId: "sap:MAT-42",
          source: "sap",
          nativeId: "MAT-42",
          name: "Steering material",
          matchType: "exact-id",
          matchReasons: ["Exact SAP material match."],
          context: {
            objectType: "Material",
            stale: false,
          },
          retrievedAt: "2026-10-28T00:00:00.000Z",
          providerMode: "live",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => payload }),
    );

    const outcome = await new ApiSearchAdapter("sap").search(
      {
        requestId: "request-1",
        query: "MAT-42",
        normalizedQuery: "MAT-42",
        queryIntent: "exact-engineering-id",
        requestedSources: ["sap"],
        resultLimitPerSource: 10,
        startedAt: "2026-10-28T00:00:00.000Z",
        timeoutMs: 10_000,
      },
      new AbortController().signal,
    );

    expect(outcome.results[0].sourceMetadata).toEqual({
      objectType: "Material",
      stale: false,
    });
  });
});
