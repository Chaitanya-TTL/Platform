"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  IconArrowDown,
  IconArrowUp,
  IconBuildingBank,
  IconCamera,
  IconCoins,
  IconPackage,
  IconRefresh,
} from "@tabler/icons-react";
import { getPipelineStatus, getSapOperationalImpact } from "@/lib/api";
import type {
  SapFallbackMetadata,
  SapHistoryAccountingDocument,
  SapHistoryAccountingLine,
  SapHistoryEvent,
  SapOperationalImpact,
} from "@/types/sap-operational-impact";

export function SapOperationalImpactPanel({
  jobId,
  active,
}: {
  jobId: string | null;
  active: boolean;
}) {
  const [data, setData] = useState<SapOperationalImpact | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!jobId || !active) return;

    setLoading(true);
    setError("");

    try {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          const impact = await getSapOperationalImpact(jobId);
          setData(impact);
          return;
        } catch (cause) {
          const status = (cause as { status?: number }).status;

          if (status !== 404) {
            setError(
              cause instanceof Error
                ? cause.message
                : "SAP operational impact unavailable",
            );
            return;
          }

          try {
            const job = await getPipelineStatus(jobId);

            if (job.terminal) {
              setError(
                job.error ||
                  (job.status === "completed"
                    ? "Pipeline completed without SAP operational impact."
                    : "SAP pipeline ended before operational impact became available."),
              );
              return;
            }
          } catch (statusCause) {
            if (attempt === 59) {
              setError(
                statusCause instanceof Error
                  ? statusCause.message
                  : "Unable to determine SAP pipeline status.",
              );
              return;
            }
          }

          if (attempt < 59) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      setError(
        "SAP operational impact was not produced before polling timed out.",
      );
    } finally {
      setLoading(false);
    }
  }, [active, jobId]);

  useEffect(() => {
    void load();
  }, [load]);
  if (!active || !jobId) return null;
  if (loading && !data)
    return <Box>Reconstructing SAP movement and financial history...</Box>;
  if (error && !data)
    return (
      <Box>
        <span className="text-rose-300">{error}</span>
        <button onClick={load} className="ml-3 underline">
          Retry
        </button>
      </Box>
    );

  const history = data?.history;
  if (!history)
    return (
      <Box>
        Current SAP evidence is available, but no accessible movement history
        was returned.
      </Box>
    );

  const fallback = history.fallback ?? data?.fallback;
  const isFallback = Boolean(
    fallback?.active ||
    history.dataSource === "fallback-snapshot" ||
    data?.dataSource === "fallback-snapshot",
  );
  const material = history.material;
  const current = history.currentState;
  const summary = history.historySummary;
  const events = history.events ?? history.movements ?? [];
  const materialTitle =
    [material?.materialId, material?.description].filter(Boolean).join(" · ") ||
    "SAP material unavailable";
  const unit =
    material?.baseUnit || events.find((event) => event.unit)?.unit || "";
  const currency =
    current?.currency || events.find((event) => event.currency)?.currency || "";

  return (
    <section className="mt-4 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-400">
            SAP material intelligence
          </p>
          <h3 className="mt-1 text-lg font-semibold">{materialTitle}</h3>
          <p className="text-xs text-slate-500">
            Plant {text(material?.plant)} · Storage{" "}
            {material?.storageLocation || "Plant scope"}
            {history.systemId || history.client
              ? ` · ${text(history.systemId)}/${text(history.client)}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFallback ? (
            <FallbackBadge
              fallback={fallback}
              capturedAt={
                fallback?.snapshotCapturedAt ??
                history.extractedAt ??
                data?.extractedAt
              }
            />
          ) : null}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 text-xs text-slate-400 disabled:opacity-50"
          >
            <IconRefresh
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 md:grid-cols-4">
        <Metric
          label="Physical stock"
          value={quantity(current?.physicalStock, unit)}
          icon={<IconPackage />}
        />
        <Metric
          label="Valuated quantity"
          value={quantity(current?.valuatedQuantity, unit)}
          icon={<IconPackage />}
        />
        <Metric
          label="Inventory value"
          value={currencyValue(current?.inventoryValue, currency)}
          icon={<IconCoins />}
        />
        <Metric
          label="Moving average"
          value={currencyValue(
            current?.movingAveragePrice,
            currency,
            current?.priceUnit,
          )}
          icon={<IconCoins />}
        />
        <Metric label="Price control" value={text(current?.priceControl)} />
        <Metric label="Price unit" value={number(current?.priceUnit)} />
        <Metric label="Valuation class" value={text(current?.valuationClass)} />
        <Metric
          label="Movements / G/L lines"
          value={`${number(summary?.movementCount)} / ${number(summary?.accountingLineCount)}`}
        />
      </div>
      <Reconciliation summary={summary} unit={unit} currency={currency} />
      <div>
        <h4 className="text-sm font-semibold">Material movement timeline</h4>
        <p className="mt-1 text-xs text-slate-500">
          Chronological material-document reconstruction with financial
          correlation.
        </p>
      </div>
      {events.length ? (
        <div className="space-y-3">
          {events.map((event, index) => (
            <EventCard key={eventKey(event, index)} event={event} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/35 p-4 text-sm text-slate-400">
          No accessible material-movement events were returned.
        </div>
      )}
    </section>
  );
}

function FallbackBadge({
  fallback,
  capturedAt,
}: {
  fallback?: SapFallbackMetadata | null;
  capturedAt?: string;
}) {
  const details = [
    "Validated SAP snapshot. Values are not live.",
    capturedAt ? `Captured ${formatTimestamp(capturedAt)}.` : "",
    fallback?.reason ? `${fallback.reason}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      title={details}
      aria-label={details}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-300/[.07] px-2.5 text-[10px] font-semibold text-amber-200"
    >
      <IconCamera className="h-3.5 w-3.5" />
      Snapshot
      <span className="text-amber-100/55">·</span>
      <span className="uppercase tracking-[.08em] text-amber-100/70">
        Not live
      </span>
    </span>
  );
}

function Reconciliation({
  summary,
  unit,
  currency,
}: {
  summary:
    | import("@/types/sap-operational-impact").SapHistorySummary
    | null
    | undefined;
  unit: string;
  currency: string;
}) {
  if (!summary) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/45 p-3 text-sm text-slate-300">
        <strong>Reconciliation unavailable</strong>
        <p className="mt-1 text-xs text-slate-500">
          The backend did not return a reconciliation summary.
        </p>
      </div>
    );
  }

  const quantityStatus = summary.quantityReconciledToCurrentValuation;
  const valueStatus = summary.valueReconciledToCurrentInventory;
  const reconciled = quantityStatus === true && valueStatus === true;
  const mismatch = quantityStatus === false || valueStatus === false;

  return (
    <div
      className={`rounded-xl border p-3 text-sm ${
        reconciled
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
          : "border-amber-500/25 bg-amber-500/10 text-amber-200"
      }`}
    >
      <strong>
        {reconciled
          ? "Reconciled"
          : mismatch
            ? "Reconciliation attention required"
            : "Reconciliation not verified"}
      </strong>
      <p className="mt-1 text-xs opacity-80">
        History totals: {signed(summary.netQuantityDelta)} {unit || "units"} and{" "}
        {signed(summary.netInventoryValueDelta)} {currency || "currency units"}.
        Quantity: {yesNo(quantityStatus)} · Value: {yesNo(valueStatus)}
      </p>
    </div>
  );
}

function EventCard({ event }: { event: SapHistoryEvent }) {
  const positive = (event.quantityDelta ?? 0) >= 0;
  const documents =
    event.accountingDocuments ??
    (event.accountingDocument ? [event.accountingDocument] : []);
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/55 p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex gap-3">
          <span
            className={`mt-0.5 rounded-lg p-2 ${positive ? "bg-emerald-500/10 text-emerald-300" : "bg-orange-500/10 text-orange-300"}`}
          >
            {positive ? (
              <IconArrowUp className="h-4 w-4" />
            ) : (
              <IconArrowDown className="h-4 w-4" />
            )}
          </span>
          <div>
            <p className="text-xs text-slate-500">
              {text(event.postingDate)}
              {event.createdTime ? ` · ${event.createdTime}` : ""}
            </p>
            <h5 className="font-semibold">
              Movement {text(event.movementType)} ·{" "}
              {movementLabel(event.movementType)}
            </h5>
            <p className="mt-1 text-xs text-slate-400">
              Material document {text(event.materialDocument)}
              {event.documentYear ? ` / ${event.documentYear}` : ""}
              {event.documentItem ? ` / ${event.documentItem}` : ""}
              {event.sourceTransaction ? ` · ${event.sourceTransaction}` : ""}
            </p>
          </div>
        </div>
        <div
          className={`text-right text-sm font-semibold ${positive ? "text-emerald-300" : "text-orange-300"}`}
        >
          <p>
            {signed(event.quantityDelta)} {event.unit || ""}
          </p>
          <p>
            {signed(event.inventoryValueDelta)} {event.currency || ""}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <Flow
          title="Stock"
          before={event.beforeQuantity}
          delta={event.quantityDelta}
          after={event.afterQuantity}
          unit={event.unit || ""}
        />
        <Flow
          title="Inventory value"
          before={event.beforeInventoryValue}
          delta={event.inventoryValueDelta}
          after={event.afterInventoryValue}
          unit={event.currency || ""}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
        {event.purchaseOrder ? (
          <Tag>
            PO {event.purchaseOrder}
            {event.purchaseOrderItem ? ` / ${event.purchaseOrderItem}` : ""}
          </Tag>
        ) : null}
        {event.productionOrder ? (
          <Tag>Production order {event.productionOrder}</Tag>
        ) : null}
        {event.companyCode ? <Tag>Company {event.companyCode}</Tag> : null}
        {event.profitCenter ? (
          <Tag>Profit center {event.profitCenter}</Tag>
        ) : null}
        {event.businessArea ? (
          <Tag>Business area {event.businessArea}</Tag>
        ) : null}
      </div>
      {documents.map((document, index) => (
        <AccountingDocument
          key={documentKey(document, index)}
          document={document}
        />
      ))}
    </article>
  );
}
function AccountingDocument({
  document,
}: {
  document: SapHistoryAccountingDocument;
}) {
  const id = document.accountingDocument || document.documentNumber;
  const lines = document.lines ?? [];
  return (
    <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold">
        <IconBuildingBank className="mr-2 inline h-4 w-4 text-cyan-400" />
        Accounting document {text(id)}
        {document.fiscalYear ? ` · FY ${document.fiscalYear}` : ""}
        {document.documentType ? ` · ${document.documentType}` : ""}
        {document.ledger ? ` · Ledger ${document.ledger}` : ""}
      </summary>
      {lines.length ? (
        <div className="mt-3 space-y-1">
          {lines.map((line, index) => (
            <AccountingLine key={lineKey(line, index)} line={line} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          No accessible accounting lines were returned.
        </p>
      )}
    </details>
  );
}
function AccountingLine({ line }: { line: SapHistoryAccountingLine }) {
  const id = line.line || line.lineItem,
    direction = line.debitCredit || line.direction,
    amount = line.amount ?? line.signedAmount;
  return (
    <div className="grid grid-cols-[70px_1fr_auto] gap-2 rounded bg-slate-900 px-3 py-2 text-xs">
      <span>Line {text(id)}</span>
      <span>
        G/L {text(line.glAccount)} ·{" "}
        {direction === "S"
          ? "Debit"
          : direction === "H"
            ? "Credit"
            : text(direction)}
      </span>
      <span
        className={
          amount != null && amount >= 0 ? "text-emerald-300" : "text-orange-300"
        }
      >
        {signed(amount)} {line.currency || ""}
      </span>
    </div>
  );
}
function Box({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-800 p-4 text-sm text-slate-400">
      {children}
    </div>
  );
}
function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-slate-950 p-4">
      {icon ? (
        <span className="text-cyan-400 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      ) : null}
      <p className="mt-1 text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
function Flow({
  title,
  before,
  delta,
  after,
  unit,
}: {
  title: string;
  before?: number | null;
  delta?: number | null;
  after?: number | null;
  unit: string;
}) {
  return (
    <div className="rounded-lg bg-slate-950 p-3">
      <p className="text-slate-500">{title}</p>
      <p className="mt-1 text-slate-200">
        {number(before)} → {number(after)} {unit}{" "}
        <span className="text-slate-500">· Delta {signed(delta)}</span>
      </p>
    </div>
  );
}
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-slate-700 px-2 py-1">
      {children}
    </span>
  );
}
const number = (value: number | null | undefined) =>
  value == null ? "—" : new Intl.NumberFormat("en-IN").format(value);
const text = (value: string | null | undefined) => value?.trim() || "—";
const signed = (value: number | null | undefined) =>
  value == null
    ? "—"
    : `${value > 0 ? "+" : ""}${new Intl.NumberFormat("en-IN").format(value)}`;
const quantity = (value: number | null | undefined, unit: string) =>
  value == null ? "—" : `${number(value)}${unit ? ` ${unit}` : ""}`;
const currencyValue = (
  value: number | null | undefined,
  currency: string,
  priceUnit?: number | null,
) =>
  value == null
    ? "—"
    : `${number(value)}${currency ? ` ${currency}` : ""}${priceUnit && priceUnit !== 1 ? ` / ${number(priceUnit)}` : ""}`;
const yesNo = (value: boolean | null | undefined) =>
  value == null ? "Not verified" : value ? "Matched" : "Mismatch";
const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date) + " UTC";
};
const eventKey = (event: SapHistoryEvent, index: number) =>
  [
    "sap-event",
    event.materialDocument,
    event.documentYear,
    event.documentItem,
    event.postingDate,
    index,
  ]
    .filter((part) => part !== undefined && part !== "")
    .join(":");
const documentKey = (document: SapHistoryAccountingDocument, index: number) =>
  [
    "sap-accounting",
    document.companyCode,
    document.accountingDocument || document.documentNumber,
    document.fiscalYear,
    index,
  ]
    .filter(Boolean)
    .join(":");
const lineKey = (line: SapHistoryAccountingLine, index: number) =>
  ["sap-line", line.line || line.lineItem, line.glAccount, index]
    .filter(Boolean)
    .join(":");
const movementLabel = (type?: string) =>
  type === "101"
    ? "Goods receipt"
    : type === "261"
      ? "Production-order goods issue"
      : type === "561"
        ? "Initial stock entry"
        : "Material movement";
