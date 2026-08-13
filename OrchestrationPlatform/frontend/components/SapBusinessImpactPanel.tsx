/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconAlertTriangle,
  IconBuilding,
  IconBuildingWarehouse,
  IconCash,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconInfoCircle,
  IconMapPin,
  IconPackage,
  IconRefresh,
  IconScale,
  IconX,
} from "@tabler/icons-react";
import {
  getSapBusinessImpact,
  type SapBusinessImpact,
  type SapMaterialImpact,
} from "@/lib/api";
const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));
const number = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
const quantity = (value: number | null | undefined, unit = "") =>
  value == null ? "Not available" : `${number(value)}${unit ? ` ${unit}` : ""}`;
const money = (value: number | null | undefined, currency: string) =>
  value == null
    ? "Not available"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 2,
      }).format(value);
const time = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const title = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const booleanText = (value: boolean | null) =>
  value == null ? "Not available" : value ? "Yes" : "No";
export function SapBusinessImpactPanel({
  jobId,
  active,
}: {
  jobId: string | null;
  active: boolean;
}) {
  const [data, setData] = useState<SapBusinessImpact | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!jobId || !active) {
      setData(null);
      setSelectedId(null);
      return;
    }
    let cancelled = false;
    setData(null);
    setSelectedId(null);
    setError("");
    setLoading(true);
    void (async () => {
      for (let attempt = 0; attempt < 45 && !cancelled; attempt++) {
        try {
          const result = await getSapBusinessImpact(jobId);
          if (cancelled) return;
          setData(result);
          setSelectedId(result.materials[0]?.materialId ?? null);
          setLoading(false);
          return;
        } catch (cause) {
          if (attempt === 44 && !cancelled) {
            setError(
              cause instanceof Error ? cause.message : "SAP impact unavailable",
            );
            setLoading(false);
            return;
          }
          await wait(2000);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, active]);
  const selected = useMemo(
    () =>
      data?.materials.find((material) => material.materialId === selectedId) ??
      data?.materials[0] ??
      null,
    [data, selectedId],
  );
  const summary = useMemo(() => {
    const materials = data?.materials ?? [];
    return {
      total: materials.length,
      stock: materials.reduce(
        (total, item) => total + (item.stock.totalPhysical ?? 0),
        0,
      ),
      value: materials.reduce(
        (total, item) => total + (item.inventory.totalStockValue ?? 0),
        0,
      ),
      valued: materials.filter((item) => item.inventory.totalStockValue != null)
        .length,
      reconciled: materials.filter(
        (item) => item.checks?.valuationReconciled === true,
      ).length,
    };
  }, [data]);
  if (!active || !jobId) return null;
  if (loading)
    return (
      <Notice icon={<IconRefresh className="animate-spin" />}>
        Loading SAP stock, inventory and valuation insight
      </Notice>
    );
  if (error)
    return (
      <Notice warning icon={<IconAlertTriangle />}>
        {error}
      </Notice>
    );
  if (!data) return null;
  const currency =
    selected?.organization.currency ||
    data.materials.find((item) => item.organization.currency)?.organization
      .currency ||
    "INR";
  return (
    <section className="mt-5 rounded-[24px] border border-slate-700/80 bg-slate-950/90 p-5 text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-cyan-400">
            ERP business context
          </p>
          <h3 className="mt-1.5 text-xl font-semibold">SAP Material Impact</h3>
          <p className="mt-1.5 text-sm text-slate-400">
            {summary.total} materials · Plant {data.plant}
            {data.extractedAt ? ` · ${time(data.extractedAt)}` : ""}
          </p>
        </div>
        <Status value={data.status} />
      </header>
      <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Physical stock"
          value={quantity(summary.stock)}
          note="Across BOM materials"
        />
        <Metric
          label="Inventory value"
          value={
            summary.valued ? money(summary.value, currency) : "Not available"
          }
          note={`${summary.valued} valued materials`}
        />
        <Metric
          label="Valuation coverage"
          value={`${summary.valued} / ${summary.total}`}
          note="Materials with stock value"
        />
        <Metric
          label="Reconciled"
          value={`${summary.reconciled} / ${summary.total}`}
          note="Inventory value checks"
        />
      </div>
      <div className="mt-5">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[.12em] text-slate-400">
          Materials
        </p>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {data.materials.map((material) => {
            const chosen = material.materialId === selectedId;
            return (
              <button
                key={material.materialId}
                type="button"
                onClick={() => setSelectedId(material.materialId)}
                className={`min-w-[220px] rounded-xl border p-4 text-left transition ${chosen ? "border-cyan-500/70 bg-cyan-500/[.08]" : "border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}
              >
                <span className="block truncate text-base font-semibold text-slate-100">
                  {material.description || material.materialId}
                </span>
                <span className="mt-1 block text-sm text-slate-400">
                  {material.materialId}
                  {material.materialType ? ` · ${material.materialType}` : ""}
                </span>
                <span className="mt-3 block text-sm font-medium text-slate-200">
                  {money(
                    material.inventory.totalStockValue,
                    material.organization.currency || currency,
                  )}
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {quantity(material.stock.totalPhysical, material.baseUnit)}{" "}
                  physical stock
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {selected ? <ImpactDetails material={selected} /> : null}
      {data.warnings.length ? (
        <Warnings title="Pipeline warnings" warnings={data.warnings} />
      ) : null}
    </section>
  );
}
function ImpactDetails({ material }: { material: SapMaterialImpact }) {
  const currency = material.organization.currency || "INR";
  const reconciled = material.checks?.valuationReconciled;
  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard
          icon={<IconInfoCircle />}
          title="Material context"
          primary={material.description || material.materialId}
          rows={[
            ["External material", material.materialId || "Not available"],
            [
              "Requested material",
              material.requestedMaterialId || "Not available",
            ],
            [
              "Internal SAP MATNR",
              material.internalMaterialId || "Not available",
            ],
            ["Material type", material.materialType || "Not available"],
            ["Batch managed", booleanText(material.batchManaged)],
            [
              "Cross-plant status",
              material.crossPlantStatus || "Not available",
            ],
          ]}
        />
        <DetailCard
          icon={<IconBuilding />}
          title="Organization"
          primary={
            material.organization.companyCode ||
            material.organization.plant ||
            "Not maintained"
          }
          rows={[
            ["Plant", material.organization.plant || "Not available"],
            [
              "Valuation area",
              material.organization.valuationArea || "Not available",
            ],
            [
              "Company code",
              material.organization.companyCode || "Not available",
            ],
            ["Currency", material.organization.currency || "Not available"],
            [
              "Valuation type",
              material.inventory.valuationType || "Not available",
            ],
          ]}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <DetailCard
          icon={<IconPackage />}
          title="Stock"
          primary={quantity(material.stock.totalPhysical, material.baseUnit)}
          rows={[
            [
              "Unrestricted",
              quantity(material.stock.unrestricted, material.baseUnit),
            ],
            [
              "Quality inspection",
              quantity(material.stock.qualityInspection, material.baseUnit),
            ],
            [
              "Restricted use",
              quantity(material.stock.restrictedUse, material.baseUnit),
            ],
            ["Blocked", quantity(material.stock.blocked, material.baseUnit)],
            [
              "In transfer",
              quantity(material.stock.inTransfer, material.baseUnit),
            ],
            ["Returns", quantity(material.stock.returns, material.baseUnit)],
            [
              "ATP available",
              quantity(material.stock.atpAvailable, material.baseUnit),
            ],
          ]}
        />
        <DetailCard
          icon={<IconBuildingWarehouse />}
          title="Inventory"
          primary={money(material.inventory.totalStockValue, currency)}
          rows={[
            [
              "Valuated quantity",
              quantity(material.inventory.valuatedQuantity, material.baseUnit),
            ],
            ["Storage locations", String(material.storageLocations.length)],
            [
              "Valuation type",
              material.inventory.valuationType || "Not available",
            ],
            ["Currency", material.organization.currency || "Not available"],
          ]}
        />
        <DetailCard
          icon={<IconCash />}
          title="Cost"
          primary={money(material.cost.effectiveUnitCost, currency)}
          rows={[
            ["Standard price", money(material.cost.standardPrice, currency)],
            [
              "Moving average",
              money(material.cost.movingAveragePrice, currency),
            ],
            ["Price control", material.cost.priceControl || "Not available"],
            ["Price unit", quantity(material.cost.priceUnit)],
            [
              "Valuation class",
              material.cost.valuationClass || "Not available",
            ],
          ]}
        />
      </div>
      <article
        className={`rounded-xl border p-5 ${reconciled === true ? "border-emerald-500/30 bg-emerald-500/[.06]" : reconciled === false ? "border-amber-500/30 bg-amber-500/[.06]" : "border-slate-800 bg-slate-900/60"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${reconciled === true ? "bg-emerald-500/10 text-emerald-300" : reconciled === false ? "bg-amber-500/10 text-amber-300" : "bg-slate-800 text-slate-400"}`}
            >
              {reconciled === true ? (
                <IconCheck />
              ) : reconciled === false ? (
                <IconX />
              ) : (
                <IconScale />
              )}
            </span>
            <div>
              <h4 className="text-base font-semibold text-slate-100">
                Inventory reconciliation
              </h4>
              <p className="mt-1 text-sm text-slate-400">
                Calculated valuation compared with SAP reported value
              </p>
            </div>
          </div>
          <Status
            value={
              reconciled === true
                ? "reconciled"
                : reconciled === false
                  ? "difference detected"
                  : "not available"
            }
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MiniValue
            label="Calculated value"
            value={money(material.checks?.calculatedInventoryValue, currency)}
          />
          <MiniValue
            label="Reported SAP value"
            value={money(material.checks?.reportedInventoryValue, currency)}
          />
        </div>
      </article>
      {material.storageLocations.length ? (
        <StorageLocations material={material} />
      ) : null}
      {material.warnings.length ? (
        <Warnings title="Material warnings" warnings={material.warnings} />
      ) : null}
    </div>
  );
}
function StorageLocations({ material }: { material: SapMaterialImpact }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="flex items-center gap-3">
          <IconMapPin className="h-5 w-5 text-cyan-400" />
          <span>
            <b className="block text-base text-slate-100">Storage locations</b>
            <span className="mt-0.5 block text-sm text-slate-400">
              {material.storageLocations.length} location
              {material.storageLocations.length === 1 ? "" : "s"} returned by
              SAP
            </span>
          </span>
        </span>
        {open ? (
          <IconChevronUp className="h-5 w-5 text-slate-400" />
        ) : (
          <IconChevronDown className="h-5 w-5 text-slate-400" />
        )}
      </button>
      {open ? (
        <div className="overflow-x-auto border-t border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/70 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {[
                  "Location",
                  "Unrestricted",
                  "Quality",
                  "Restricted",
                  "Blocked",
                  "Transfer",
                  "Returns",
                ].map((label) => (
                  <th key={label} className="px-4 py-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {material.storageLocations.map((row) => (
                <tr key={row.storageLocation}>
                  <td className="px-4 py-3 font-semibold text-slate-100">
                    {row.storageLocation || "Not available"}
                  </td>
                  {[
                    row.unrestricted,
                    row.qualityInspection,
                    row.restrictedUse,
                    row.blocked,
                    row.inTransfer,
                    row.returns,
                  ].map((value, index) => (
                    <td key={index} className="px-4 py-3 text-slate-300">
                      {quantity(value, material.baseUnit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}
function Warnings({ title, warnings }: { title: string; warnings: string[] }) {
  return (
    <article className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[.06] p-5">
      <div className="flex items-center gap-2 text-base font-semibold text-amber-200">
        <IconAlertTriangle className="h-5 w-5" />
        {title}
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs">
          {warnings.length}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning, index) => (
          <li
            key={`${warning}-${index}`}
            className="flex gap-3 text-sm leading-6 text-amber-100/80"
          >
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            {warning}
          </li>
        ))}
      </ul>
    </article>
  );
}
function Notice({
  children,
  icon,
  warning = false,
}: {
  children: ReactNode;
  icon: ReactNode;
  warning?: boolean;
}) {
  return (
    <div
      className={`mt-4 flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm ${warning ? "border-amber-500/25 bg-amber-500/[.08] text-amber-200" : "border-slate-800 bg-slate-950/80 text-slate-300"}`}
    >
      <span className="[&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      {children}
    </div>
  );
}
function Status({ value }: { value: string }) {
  const good = ["complete", "reconciled"].includes(value);
  const bad = ["failed", "difference detected"].includes(value);
  return (
    <span
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${good ? "border-emerald-500/30 bg-emerald-500/[.08] text-emerald-300" : bad ? "border-rose-500/30 bg-rose-500/[.08] text-rose-300" : "border-amber-500/30 bg-amber-500/[.08] text-amber-300"}`}
    >
      {title(value)}
    </span>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-slate-950 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      <p className="mt-1.5 text-sm text-slate-400">{note}</p>
    </div>
  );
}
function MiniValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/65 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 text-base font-semibold text-slate-100">{value}</p>
    </div>
  );
}
function DetailCard({
  icon,
  title,
  primary,
  rows,
}: {
  icon: ReactNode;
  title: string;
  primary: string;
  rows: Array<[string, string]>;
}) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-300">
        <span className="[&_svg]:h-5 [&_svg]:w-5 text-cyan-400">{icon}</span>
        {title}
      </div>
      <p className="mt-4 break-words text-xl font-semibold text-slate-50">
        {primary}
      </p>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 text-sm"
          >
            <dt className="text-slate-400">{label}</dt>
            <dd className="max-w-[62%] break-all text-right font-medium text-slate-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
