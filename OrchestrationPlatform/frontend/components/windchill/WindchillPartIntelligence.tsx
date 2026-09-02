/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState } from "react";
import {
  IconDownload,
  IconFileDescription,
  IconRefresh,
} from "@tabler/icons-react";
import {
  formatFileSize,
  requirementQuery,
  trustedDownload,
} from "@/lib/windchill/requirements";
import { WindchillRequirementsResponse } from "@/types/windchill-requirements";
export function WindchillPartIntelligence({
  query,
  partOid,
}: {
  query: string;
  partOid?: string;
}) {
  const [data, setData] = useState<WindchillRequirementsResponse | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const q = requirementQuery(query, partOid),
        r = await fetch(
          `/api/bom-windchill?operation=requirements&queryType=${q.type}&query=${encodeURIComponent(q.value)}`,
          { cache: "no-store" },
        ),
        p = await r.json();
      if (!r.ok)
        throw new Error(p.error || "Unable to load Windchill intelligence");
      if (p.status === "selection_required")
        throw new Error(
          `Multiple latest parts matched. Select by number: ${p.candidates.map((x: { number: string }) => x.number).join(", ")}`,
        );
      setData(p);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load Windchill intelligence",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [query, partOid]);
  if (loading)
    return (
      <div className="mt-4 rounded-xl border border-slate-800 p-4 text-sm text-slate-400">
        Loading attributes, requirements, documents, and change context...
      </div>
    );
  if (error)
    return (
      <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
        {error}
        <button onClick={load} className="ml-3 underline">
          Retry
        </button>
      </div>
    );
  if (!data) return null;
  const attrs = data.part.customAttributes;
  return (
    <section className="mt-4 space-y-4">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-white">
            {data.part.number} · {data.part.name}
          </h3>
          <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
            POC / Synthetic
          </span>
          <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase text-slate-400">
            {data.status}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          {[
            ["Version", data.part.version],
            ["State", data.part.state],
            ["View", data.part.view],
            ["Source", data.part.source],
            ["Material", attrs.material],
            ["Chemical", attrs.chemical],
            ["Weight", attrs.weight],
            ["Dimension", attrs.dimension],
            ["Change", data.part.changeStatus],
            ["Checkout", data.part.checkoutState],
            ["Unit", data.part.defaultUnit],
            ["Folder", data.part.folder],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-950/60 p-2">
              <p className="text-[10px] uppercase text-slate-500">{k}</p>
              <p className="mt-1 text-slate-200">{v || "Not supplied"}</p>
            </div>
          ))}
        </div>
      </div>
      {data.warnings.length ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          {data.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}
      <div className="text-xs text-slate-500">
        Part → Described By → Requirements Specification → Contains →
        Requirement Documents
      </div>
      {data.requirementSpecifications.map((s) => (
        <details
          open
          key={s.id}
          className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
        >
          <summary className="cursor-pointer font-semibold text-slate-100">
            {s.number} · {s.name} · {s.version}
          </summary>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            {s.description}
          </p>
          <div className="mt-3 space-y-2">
            {s.requirements.map((r) => (
              <article
                key={r.id}
                className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
              >
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs font-bold text-cyan-300">
                      {r.requirementId}
                    </p>
                    <p className="text-sm font-semibold text-white">
                      {r.title}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {r.category}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">{r.description}</p>
                <p className="mt-2 text-[10px] text-slate-600">
                  Document {r.number} · {r.version} · {r.state}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
              <IconFileDescription className="h-4 w-4" />
              Documents
            </p>
            {[
              ...(s.primaryContent ? [s.primaryContent] : []),
              ...s.attachments,
            ].map((f) => (
              <a
                key={f.id}
                href={trustedDownload(f.platformDownloadUrl)}
                className="mb-2 flex justify-between rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-300"
              >
                <span>
                  {f.fileName} · {formatFileSize(f.fileSize)}
                </span>
                <IconDownload className="h-4 w-4" />
              </a>
            ))}
          </div>
        </details>
      ))}
      <button
        onClick={load}
        className="flex items-center gap-2 text-xs text-slate-500"
      >
        <IconRefresh className="h-4 w-4" />
        Refresh Windchill intelligence
      </button>
    </section>
  );
}
