import { LATTICE_SOURCES, SOURCE_CAPABILITIES } from "./capability-matrix";
import type {
  FederatedSearchRequest,
  FederatedSearchSnapshot,
  LatticeSource,
  SourceSearchOutcome,
} from "./contracts";
import { classifyQueryIntent, normalizeQuery } from "./query-intent";
import type { SourceSearchAdapter } from "./source-adapters/base";
import { TeamcenterSearchAdapter } from "./source-adapters/teamcenter-search-adapter";
import { WindchillSearchAdapter } from "./source-adapters/windchill-search-adapter";
import { SapSearchAdapter } from "./source-adapters/sap-search-adapter";
import { ConfigitSearchAdapter } from "./source-adapters/configit-search-adapter";

type Listener = (snapshot: FederatedSearchSnapshot | null) => void;
const adapters: SourceSearchAdapter[] = [
  new TeamcenterSearchAdapter(),
  new WindchillSearchAdapter(),
  new SapSearchAdapter(),
  new ConfigitSearchAdapter(),
];
const now = () => new Date().toISOString();
function pending(
  source: LatticeSource,
  requestId: string,
): SourceSearchOutcome {
  return {
    source,
    requestId,
    status: "checking-readiness",
    results: [],
    startedAt: now(),
    durationMs: 0,
    retryable: false,
    capabilitySnapshot: SOURCE_CAPABILITIES[source],
  };
}
export class FederatedSearchOrchestrator {
  private activeRequestId: string | null = null;
  private controllers = new Map<LatticeSource, AbortController>();
  private snapshot: FederatedSearchSnapshot | null = null;
  private listeners = new Set<Listener>();
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);

    return () => {
      this.listeners.delete(listener);
    };
  }
  getSnapshot() {
    return this.snapshot;
  }
  private emit() {
    for (const listener of this.listeners) listener(this.snapshot);
  }
  private update(source: LatticeSource, outcome: SourceSearchOutcome) {
    if (!this.snapshot || outcome.requestId !== this.activeRequestId) return;
    this.snapshot = {
      ...this.snapshot,
      outcomes: { ...this.snapshot.outcomes, [source]: outcome },
    };
    const done = LATTICE_SOURCES.every(
      (item) =>
        !["checking-readiness", "searching"].includes(
          this.snapshot!.outcomes[item].status,
        ),
    );
    if (done)
      this.snapshot = { ...this.snapshot, active: false, completedAt: now() };
    this.emit();
  }
  async search(query: string) {
    this.cancel("superseded");
    const normalizedQuery = normalizeQuery(query);
    const request: FederatedSearchRequest = {
      requestId: crypto.randomUUID(),
      query: normalizedQuery,
      normalizedQuery: normalizedQuery.toLowerCase(),
      queryIntent: classifyQueryIntent(normalizedQuery),
      requestedSources: [...LATTICE_SOURCES],
      resultLimitPerSource: 10,
      startedAt: now(),
      timeoutMs: 30000,
    };
    this.activeRequestId = request.requestId;
    this.snapshot = {
      request,
      outcomes: Object.fromEntries(
        LATTICE_SOURCES.map((source) => [
          source,
          pending(source, request.requestId),
        ]),
      ) as FederatedSearchSnapshot["outcomes"],
      active: true,
    };
    this.emit();
    await Promise.all(
      LATTICE_SOURCES.map((source) => this.execute(source, request)),
    );
    return this.snapshot;
  }
  async retry(source: LatticeSource) {
    if (!this.snapshot) return;
    const request = this.snapshot.request;
    this.update(source, {
      ...pending(source, request.requestId),
      status: "searching",
    });
    await this.execute(source, request);
  }
  private async execute(
    source: LatticeSource,
    request: FederatedSearchRequest,
  ) {
    const adapter = adapters.find((item) => item.source === source);
    if (!adapter) return;
    const controller = new AbortController();
    this.controllers.set(source, controller);
    this.update(source, {
      ...pending(source, request.requestId),
      status: "searching",
    });
    const timeout = window.setTimeout(
      () => controller.abort("timeout"),
      Math.min(
        request.timeoutMs,
        SOURCE_CAPABILITIES[source].timeoutPolicy.maximumMs,
      ),
    );
    try {
      this.update(source, await adapter.search(request, controller.signal));
    } catch (cause) {
      if (request.requestId !== this.activeRequestId) return;
      const timedOut =
        controller.signal.aborted && controller.signal.reason === "timeout";
      const cancelled = controller.signal.aborted && !timedOut;
      this.update(source, {
        source,
        requestId: request.requestId,
        status: timedOut ? "timed-out" : cancelled ? "cancelled" : "failed",
        results: [],
        startedAt: request.startedAt,
        completedAt: now(),
        durationMs: Date.now() - Date.parse(request.startedAt),
        error: {
          code: timedOut
            ? "timeout"
            : cancelled
              ? "cancelled"
              : "connector-error",
          message: timedOut
            ? "Source search timed out."
            : cancelled
              ? "Source search cancelled."
              : cause instanceof Error
                ? cause.message
                : "Source search failed.",
        },
        retryable: timedOut || !cancelled,
        capabilitySnapshot: SOURCE_CAPABILITIES[source],
      });
    } finally {
      window.clearTimeout(timeout);
      this.controllers.delete(source);
    }
  }
  cancel(reason: "user" | "superseded" = "user") {
    for (const controller of this.controllers.values())
      controller.abort(reason);
    this.controllers.clear();
    if (this.snapshot?.active) {
      const outcomes = { ...this.snapshot.outcomes };
      for (const source of LATTICE_SOURCES) {
        if (
          ["checking-readiness", "searching"].includes(outcomes[source].status)
        )
          outcomes[source] = {
            ...outcomes[source],
            status: "cancelled",
            completedAt: now(),
            error: {
              code: "cancelled",
              message:
                reason === "superseded"
                  ? "Superseded by a newer search."
                  : "Search cancelled.",
            },
          };
      }
      this.snapshot = {
        ...this.snapshot,
        outcomes,
        active: false,
        completedAt: now(),
      };
      this.emit();
    }
    if (reason === "superseded") this.activeRequestId = null;
  }
  dispose() {
    this.cancel("user");
    this.listeners.clear();
  }
}
