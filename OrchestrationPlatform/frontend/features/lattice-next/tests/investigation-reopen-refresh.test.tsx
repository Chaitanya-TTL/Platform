import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InvestigationListItem } from "../kernel/contracts/investigation-snapshot";
import { investigationOpenHref, RecentInvestigationsView } from "../discovery/RecentInvestigations";

vi.mock("../kernel/infrastructure/current-investigation-runtime", () => ({ createCurrentInvestigationRuntime: vi.fn() }));

const saved: InvestigationListItem = {
  investigationId: "lattice-saved-42" as InvestigationListItem["investigationId"],
  subjectLabel: "Gearbox Assembly",
  lifecycle: "ready",
  revision: 9,
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-22T10:00:00.000Z",
  sourceStatuses: [{ source: "windchill", status: "succeeded", capturedAt: "2026-10-22T09:30:00.000Z", freshness: "current" }],
  capturedFreshness: { capturedAt: "2026-10-22T09:30:00.000Z", freshness: "current" },
};

describe("investigation reopen and explicit refresh controls", () => {
  it("opens the exact saved investigation query without triggering refresh during render", () => {
    const refresh = vi.fn();
    const html = renderToStaticMarkup(createElement(RecentInvestigationsView, {
      items: [saved],
      includeArchived: false,
      onIncludeArchivedChange: vi.fn(),
      onRefresh: refresh,
      onArchive: vi.fn(),
      onRestore: vi.fn(),
    }));

    expect(investigationOpenHref(String(saved.investigationId))).toBe("/lattice?investigation=lattice-saved-42");
    expect(html).toContain('href="/lattice?investigation=lattice-saved-42"');
    expect(html).toContain("Refresh</button>");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("encodes investigation IDs in the reopen query", () => {
    expect(investigationOpenHref("lattice item/7")).toBe("/lattice?investigation=lattice%20item%2F7");
  });
});
