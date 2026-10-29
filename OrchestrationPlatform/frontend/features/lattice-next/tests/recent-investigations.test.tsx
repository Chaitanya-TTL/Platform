import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InvestigationListItem } from "../kernel/contracts/investigation-snapshot";
import { formatCapturedAge, RecentInvestigationsView } from "../discovery/RecentInvestigations";

vi.mock("../kernel/infrastructure/current-investigation-runtime", () => ({ createCurrentInvestigationRuntime: vi.fn() }));

const activeItem: InvestigationListItem = {
  investigationId: "lattice-one" as InvestigationListItem["investigationId"],
  subjectLabel: "Steering Housing",
  lifecycle: "ready",
  revision: 4,
  createdAt: "2026-10-22T08:00:00.000Z",
  updatedAt: "2026-10-23T08:00:00.000Z",
  sourceStatuses: [
    { source: "windchill", status: "succeeded", capturedAt: "2026-10-23T07:00:00.000Z", freshness: "current" },
    { source: "sap", status: "failed", freshness: "stale" },
  ],
  capturedFreshness: { capturedAt: "2026-10-23T07:00:00.000Z", freshness: "stale" },
};

const callbacks = () => ({
  onIncludeArchivedChange: vi.fn(),
  onRefresh: vi.fn(),
  onArchive: vi.fn(),
  onRestore: vi.fn(),
});

describe("recent investigations view", () => {
  it("keeps the recent shelf to three concise rows with a separate history link", () => {
    const items = [activeItem, ...[2, 3, 4].map((number) => ({
      ...activeItem,
      investigationId: `lattice-${number}` as InvestigationListItem["investigationId"],
      subjectLabel: `Assembly ${number}`,
    }))];
    const html = renderToStaticMarkup(createElement(RecentInvestigationsView, {
      items,
      includeArchived: false,
      mode: "recent",
      ...callbacks(),
    }));

    expect(html).toContain("Pick up where you left off");
    expect(html).toContain('href="/lattice?view=history"');
    expect(html).toContain("Steering Housing");
    expect(html).toContain("Assembly 3");
    expect(html).not.toContain("Assembly 4");
    expect(html).not.toContain("windchill: succeeded");
    expect(html).not.toContain("Refresh</button>");
    expect(html).not.toContain("Archived</button>");
  });

  it("renders capture age, source freshness, revision, and distinct active actions", () => {
    const actions = callbacks();
    const html = renderToStaticMarkup(createElement(RecentInvestigationsView, {
      items: [activeItem],
      includeArchived: false,
      now: Date.parse("2026-10-23T09:00:00.000Z"),
      ...actions,
    }));

    expect(html).toContain("Steering Housing");
    expect(html).toContain("Revision 4");
    expect(html).toContain("Captured 2h ago");
    expect(html).toContain("windchill: succeeded");
    expect(html).toContain("sap: failed · stale freshness");
    expect(html).toContain(">Open <svg");
    expect(html).toContain("Refresh</button>");
    expect(html).toContain("Archive");
    expect(actions.onRefresh).not.toHaveBeenCalled();
  });

  it("shows Restore rather than Refresh or Archive for archived investigations", () => {
    const archived = { ...activeItem, archivedAt: "2026-10-23T08:30:00.000Z" };
    const html = renderToStaticMarkup(createElement(RecentInvestigationsView, {
      items: [archived],
      includeArchived: true,
      ...callbacks(),
    }));

    expect(html).toContain("Archived");
    expect(html).toContain("Restore");
    expect(html).not.toContain("Refresh</button>");
    expect(html).not.toContain(">Archive</button>");
  });

  it("shows an explicit unknown capture time and stable segmented filter labels", () => {
    expect(formatCapturedAge(undefined, Date.parse("2026-10-23T00:00:00.000Z"))).toBe("Capture time unknown");
    const html = renderToStaticMarkup(createElement(RecentInvestigationsView, {
      items: [],
      includeArchived: false,
      ...callbacks(),
    }));
    expect(html).toContain("Active");
    expect(html).toContain("Archived");
    expect(html).toContain("No active investigations yet.");
  });

  it("exposes a retry action when the recent list fails", () => {
    const retry = vi.fn();
    const html = renderToStaticMarkup(createElement(RecentInvestigationsView, {
      items: [],
      includeArchived: false,
      mode: "recent",
      error: "History unavailable",
      onRetry: retry,
      ...callbacks(),
    }));

    expect(html).toContain("History unavailable");
    expect(html).toContain("Try again");
    expect(html).toContain("View all");
    expect(retry).not.toHaveBeenCalled();
  });
});
