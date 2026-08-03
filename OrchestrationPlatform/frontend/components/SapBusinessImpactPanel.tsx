"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  IconAlertTriangle,
  IconBuildingWarehouse,
  IconCash,
  IconPackage,
  IconRefresh,
} from "@tabler/icons-react";
import {
  getSapBusinessImpact,
  type SapBusinessImpact,
  type SapMaterialImpact,
} from "@/lib/api";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const number = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);

const quantity = (value: number | null | undefined, unit = "") =>
  value == null ? "—" : `${number(value)}${unit ? ` ${unit}` : ""}`;

const timestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

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
      physicalStock: materials.reduce(
        (total, material) => total + (material.stock.totalPhysical ?? 0),
        0,
      ),
      inventoryValue: materials.reduce(
        (total, material) => total + (material.inventory.totalStockValue ?? 0),
        0,
      ),
      valuedMaterials: materials.filter(
        (material) => material.inventory.totalStockValue != null,
      ).length,
      missingValuation: materials.filter(
        (material) =>
          material.cost.standardPrice == null &&
          material.cost.movingAveragePrice == null,
      ).length,
    };
  }, [data]);

  if (!active || !jobId) return null;

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs text-slate-400">
        <IconRefresh className="h-4 w-4 animate-spin text-cyan-400" />
        Loading SAP impact
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-xs text-amber-200">
        <IconAlertTriangle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  const hasStock = summary.physicalStock > 0;
  const hasValuation = summary.valuedMaterials > 0;

  return (
    <section className="mt-4 rounded-[22px] border border-slate-700/80 bg-slate-950/85 p-4 text-slate-100">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">SAP Impact</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {summary.total} materials · Plant {data.plant}
            {data.extractedAt ? ` · ${timestamp(data.extractedAt)}` : ""}
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          {data.status.replace("_", " ")}
        </span>
      </header>

      <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-slate-800 bg-slate-800 sm:grid-cols-3">
        <Metric
          label="Physical stock"
          value={`${number(summary.physicalStock)} EA`}
          note={hasStock ? "Across BOM materials" : "No stock detected"}
        />
        <Metric
          label="Inventory value"
          value={hasValuation ? number(summary.inventoryValue) : "—"}
          note={
            hasValuation
              ? `${summary.valuedMaterials} valued materials`
              : "Valuation unavailable"
          }
        />
        <Metric
          label="Coverage"
          value={`${summary.total} / ${summary.total}`}
          note={
            summary.missingValuation
              ? `${summary.missingValuation} without valuation`
              : "Valuation complete"
          }
        />
      </div>

      <div className="mt-3 border-y border-slate-800 py-2.5 text-[11px] text-slate-400">
        {!hasStock ? "No stock detected" : "Physical stock available"}
        <span className="mx-2 text-slate-700">·</span>
        {summary.missingValuation
          ? `Valuation unavailable for ${summary.missingValuation} materials`
          : "Valuation available"}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {data.materials.map((material) => {
          const selected = material.materialId === selectedId;
          const valuationMissing =
            material.cost.standardPrice == null &&
            material.cost.movingAveragePrice == null;
          return (
            <button
              key={material.materialId}
              type="button"
              onClick={() => setSelectedId(material.materialId)}
              className={`min-w-[150px] rounded-xl border px-3 py-2 text-left transition ${
                selected
                  ? "border-cyan-500/70 bg-cyan-500/[0.08]"
                  : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
              }`}
            >
              <span className="block truncate text-xs font-semibold text-slate-200">
                {material.description || material.materialId}
              </span>
              <span className="mt-0.5 block text-[10px] text-slate-600">
                {material.materialId}
                {material.materialType ? ` · ${material.materialType}` : ""}
              </span>
              <span
                className={`mt-2 block text-[9px] ${
                  valuationMissing ? "text-amber-400/80" : "text-slate-500"
                }`}
              >
                {valuationMissing
                  ? "No valuation"
                  : quantity(material.inventory.totalStockValue)}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? <ImpactDetails material={selected} /> : null}
    </section>
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
    <div className="bg-slate-950 px-4 py-3.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
        {value}
      </p>
      <p className="mt-1 text-[10px] text-slate-600">{note}</p>
    </div>
  );
}

function ImpactDetails({ material }: { material: SapMaterialImpact }) {
  const stockPrimary = quantity(
    material.stock.totalPhysical,
    material.baseUnit,
  );
  const inventoryPrimary =
    material.inventory.totalStockValue == null
      ? "No valuation"
      : quantity(material.inventory.totalStockValue);
  const costPrimary =
    material.cost.effectiveUnitCost == null
      ? "Not maintained"
      : quantity(material.cost.effectiveUnitCost, material.baseUnit);

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      <DetailCard
        icon={<IconPackage />}
        title="Stock"
        primary={stockPrimary}
        rows={[
          ["Unrestricted", quantity(material.stock.unrestricted, material.baseUnit)],
          ["Quality", quantity(material.stock.qualityInspection, material.baseUnit)],
          ["Blocked", quantity(material.stock.blocked, material.baseUnit)],
          ["ATP", quantity(material.stock.atpAvailable, material.baseUnit)],
        ]}
      />
      <DetailCard
        icon={<IconBuildingWarehouse />}
        title="Inventory"
        primary={inventoryPrimary}
        muted={material.inventory.totalStockValue == null}
        rows={[
          ["Valuated quantity", quantity(material.inventory.valuatedQuantity, material.baseUnit)],
          ["Stock value", quantity(material.inventory.totalStockValue)],
          ["Storage locations", String(material.storageLocations.length)],
          ["Valuation area", material.inventory.valuationArea || "—"],
        ]}
      />
      <DetailCard
        icon={<IconCash />}
        title="Cost"
        primary={costPrimary}
        muted={material.cost.effectiveUnitCost == null}
        rows={[
          ["Standard price", quantity(material.cost.standardPrice)],
          ["Moving average", quantity(material.cost.movingAveragePrice)],
          ["Price control", material.cost.priceControl || "—"],
          ["Price unit", quantity(material.cost.priceUnit)],
        ]}
      />

      {material.warnings.length ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-[11px] text-amber-200 lg:col-span-3">
          {material.warnings.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function DetailCard({
  icon,
  title,
  primary,
  muted = false,
  rows,
}: {
  icon: ReactNode;
  title: string;
  primary: string;
  muted?: boolean;
  rows: Array<[string, string]>;
}) {
  return (
    <article className="rounded-xl bg-slate-900/60 p-3.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
        <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        {title}
      </div>
      <p
        className={`mt-3 text-lg font-semibold ${
          muted ? "text-slate-500" : "text-slate-100"
        }`}
      >
        {primary}
      </p>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-[11px]">
            <dt className="text-slate-600">{label}</dt>
            <dd className="text-right font-medium text-slate-300">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
