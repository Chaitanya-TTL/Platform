"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { IconArrowRight, IconBox, IconBuildingFactory, IconPlugConnected } from "@tabler/icons-react";

const highlights = [
  { title: "Teamcenter", description: "Run the pipeline-based BOM extraction and inspect the structure manager style hierarchy." },
  { title: "Configit", description: "Preview product-model data and compare family and feature-level content side by side." },
  { title: "Windchill", description: "Launch a part-based extraction and review the resulting hierarchy in a focused workspace." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_45%),linear-gradient(135deg,_#020617_0%,_#0f172a_45%,_#111827_100%)] text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="overflow-hidden rounded-[36px] border border-slate-700/70 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/30 sm:p-10"
        >
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">BOM orchestration</p>
            <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">Explore BOMs from Teamcenter, Configit, and Windchill in one immersive workspace.</h1>
            <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">
              Start with a source, feed the extraction input, and compare the resulting structure in a dedicated comparison experience designed for rapid review.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/bom-comparison"
              className="inline-flex items-center justify-center gap-2 rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Open comparison workspace
              <IconArrowRight className="h-4 w-4" />
            </Link>
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/70 px-5 py-3 text-sm text-slate-300">
              Flexible source cards, live extraction states, and independent reset controls.
            </div>
          </div>
        </motion.section>

        <div className="grid gap-6 md:grid-cols-3">
          {highlights.map((item, index) => (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.06, ease: "easeOut" }}
              className="rounded-[28px] border border-slate-700/70 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-cyan-300">
                {item.title === "Teamcenter" ? (
                  <IconPlugConnected className="h-6 w-6" />
                ) : item.title === "Configit" ? (
                  <IconBox className="h-6 w-6" />
                ) : (
                  <IconBuildingFactory className="h-6 w-6" />
                )}
              </div>
              <h2 className="text-xl font-semibold text-white">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">{item.description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </div>
  );
}
