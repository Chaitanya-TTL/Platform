"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  IconArrowRight,
  IconArrowsExchange,
  IconBox,
  IconBuildingFactory,
  IconCheck,
  IconChevronRight,
  IconCode,
  IconDatabase,
  IconHierarchy,
  IconPlugConnected,
  IconRoute,
  IconSparkles,
} from "@tabler/icons-react";

const capabilities = [
  {
    title: "PLM",
    eyebrow: "Product lifecycle",
    description:
      "Extract and inspect structured BOMs from Teamcenter and Windchill in one governed workspace.",
    icon: IconPlugConnected,
    accent: "cyan",
    systems: ["Teamcenter", "Windchill"],
  },
  {
    title: "CPQ",
    eyebrow: "Configuration",
    description:
      "Resolve Configit product models and review configurable structures with the same visual language.",
    icon: IconBox,
    accent: "indigo",
    systems: ["Configit"],
  },
  {
    title: "ERP",
    eyebrow: "Enterprise operations",
    description:
      "Prepare downstream handoffs for manufacturing, sourcing, and enterprise resource planning flows.",
    icon: IconBuildingFactory,
    accent: "emerald",
    systems: ["SAP", "Oracle"],
  },
  {
    title: "CAD",
    eyebrow: "Engineering context",
    description:
      "Connect engineering structures with design context while preserving hierarchy and traceability.",
    icon: IconCode,
    accent: "amber",
    systems: ["Engineering data"],
  },
] as const;

const workflow = [
  {
    step: "01",
    title: "Connect a source",
    description: "Choose PLM or CPQ and provide the source identifier.",
    icon: IconPlugConnected,
  },
  {
    step: "02",
    title: "Orchestrate extraction",
    description: "Run each integration through its supported extraction path.",
    icon: IconRoute,
  },
  {
    step: "03",
    title: "Explore the BOM",
    description: "Search, expand, review, and compare normalized structures.",
    icon: IconHierarchy,
  },
] as const;

const platformSignals = [
  "Source-aware extraction",
  "Normalized BOM hierarchy",
  "Independent execution states",
  "Enterprise review workspace",
] as const;

const accentClasses = {
  cyan: {
    icon: "bg-cyan-400/[0.08] text-cyan-300 ring-cyan-400/15",
    line: "from-cyan-400/80 to-cyan-400/0",
    hover: "group-hover:border-cyan-400/35",
    badge: "border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-200",
  },
  indigo: {
    icon: "bg-indigo-400/[0.08] text-indigo-300 ring-indigo-400/15",
    line: "from-indigo-400/80 to-indigo-400/0",
    hover: "group-hover:border-indigo-400/35",
    badge: "border-indigo-400/20 bg-indigo-400/[0.06] text-indigo-200",
  },
  emerald: {
    icon: "bg-emerald-400/[0.08] text-emerald-300 ring-emerald-400/15",
    line: "from-emerald-400/80 to-emerald-400/0",
    hover: "group-hover:border-emerald-400/35",
    badge: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200",
  },
  amber: {
    icon: "bg-amber-400/[0.08] text-amber-300 ring-amber-400/15",
    line: "from-amber-400/80 to-amber-400/0",
    hover: "group-hover:border-amber-400/35",
    badge: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
  },
} as const;

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b18] text-slate-50">
      <BackgroundEffects />

      <div className="relative mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <Navbar />

        <section className="grid min-h-[680px] items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300 shadow-[0_0_28px_rgba(34,211,238,0.08)]">
              <IconSparkles className="h-3.5 w-3.5" />
              Digital thread orchestration
            </div>

            <h1 className="mt-7 max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              One workspace for your
              <span className="block bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                product structure.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
              Orchestrate BOM extraction across enterprise systems, normalize
              complex hierarchies, and review every structure through a focused,
              source-aware experience.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/bom-comparison"
                  className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 text-sm font-semibold text-slate-950 shadow-[0_16px_44px_-18px_rgba(34,211,238,0.8)] transition hover:bg-cyan-300 sm:w-auto"
                >
                  Open comparison workspace
                  <IconArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </motion.div>

              <a
                href="#capabilities"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-700/70 bg-slate-900/55 px-5 text-sm font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800/70 hover:text-white"
              >
                Explore platform
                <IconChevronRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-2">
              {platformSignals.map((signal, index) => (
                <motion.div
                  key={signal}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.16 + index * 0.06, duration: 0.3 }}
                  className="flex items-center gap-2 text-sm text-slate-400"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/[0.08] text-emerald-300 ring-1 ring-inset ring-emerald-400/15">
                    <IconCheck className="h-3 w-3" />
                  </span>
                  {signal}
                </motion.div>
              ))}
            </div>
          </motion.div>

          <OrchestrationVisual />
        </section>

        <section id="capabilities" className="scroll-mt-8 py-10 lg:py-16">
          <SectionHeading
            eyebrow="Connected enterprise"
            title="Bring every product system into focus"
            description="A consistent interaction model across source systems, without hiding the integration-specific behavior that makes each workflow reliable."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {capabilities.map((item, index) => {
              const Icon = item.icon;
              const accent = accentClasses[item.accent];

              return (
                <motion.article
                  key={item.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  whileHover={{ y: -6 }}
                  className="group relative overflow-hidden rounded-[26px] border border-slate-800/90 bg-slate-900/55 p-6 shadow-[0_20px_60px_-36px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-colors duration-300"
                >
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent.line}`}
                  />
                  <div
                    className={`absolute inset-0 rounded-[26px] border border-transparent transition-colors duration-300 ${accent.hover}`}
                  />

                  <div
                    className={`relative flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ${accent.icon}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="relative mt-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                      {item.eyebrow}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                      {item.title}
                    </h2>
                    <p className="mt-3 min-h-[84px] text-sm leading-7 text-slate-400">
                      {item.description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {item.systems.map((system) => (
                        <span
                          key={system}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${accent.badge}`}
                        >
                          {system}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>

        <section className="py-14 lg:py-20">
          <div className="overflow-hidden rounded-[34px] border border-slate-800/80 bg-slate-900/45 p-6 shadow-[0_30px_100px_-55px_rgba(34,211,238,0.35)] backdrop-blur-xl sm:p-9 lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <SectionHeading
                eyebrow="Simple by design"
                title="From source ID to review-ready BOM"
                description="The platform preserves the right execution path for every source, then presents the result through one consistent enterprise workspace."
                compact
              />

              <div className="grid gap-3 md:grid-cols-3">
                {workflow.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <motion.div
                      key={item.step}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.08, duration: 0.35 }}
                      className="relative rounded-2xl border border-slate-800/80 bg-slate-950/55 p-5"
                    >
                      {index < workflow.length - 1 ? (
                        <div className="absolute -right-4 top-10 hidden h-px w-5 bg-gradient-to-r from-cyan-400/45 to-transparent md:block" />
                      ) : null}

                      <div className="flex items-center justify-between">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/[0.07] text-cyan-300 ring-1 ring-inset ring-cyan-400/15">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-semibold tracking-[0.2em] text-slate-700">
                          {item.step}
                        </span>
                      </div>

                      <h3 className="mt-5 text-sm font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-xs leading-6 text-slate-500">
                        {item.description}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8 overflow-hidden rounded-[34px] border border-cyan-400/15 bg-gradient-to-r from-cyan-400/[0.08] via-slate-900/70 to-indigo-400/[0.08] p-8 sm:p-10"
        >
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
                Ready to orchestrate
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Explore your product structure without losing source context.
              </h2>
            </div>

            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/bom-comparison"
                className="group inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-white px-5 text-sm font-semibold text-slate-950 shadow-xl shadow-black/20 transition hover:bg-cyan-50"
              >
                Launch workspace
                <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>
        </motion.section>

        <footer className="flex flex-col gap-3 border-t border-slate-800/70 py-7 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <LogoMark small />
            <span>Digital Thread Orchestration Platform</span>
          </div>
          <span>Source-aware BOM extraction and review</span>
        </footer>
      </div>
    </main>
  );
}

function Navbar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-between rounded-2xl border border-slate-800/70 bg-slate-950/45 px-4 py-3 backdrop-blur-xl sm:px-5"
    >
      <div className="flex items-center gap-3">
        <LogoMark />
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">
            Digital Thread
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
            Orchestration platform
          </p>
        </div>
      </div>

      <Link
        href="/bom-comparison"
        className="group inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700/75 bg-slate-900/70 px-3.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/35 hover:text-white"
      >
        Open workspace
        <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.header>
  );
}

function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.08)] ${
        small ? "h-7 w-7" : "h-10 w-10"
      }`}
    >
      <IconArrowsExchange className={small ? "h-3.5 w-3.5" : "h-5 w-5"} />
      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-[#050b18] bg-emerald-400" />
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "max-w-lg" : "max-w-3xl"}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
        {eyebrow}
      </p>
      <h2
        className={`mt-3 font-semibold tracking-[-0.035em] text-white ${
          compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl"
        }`}
      >
        {title}
      </h2>
      <p className="mt-4 text-sm leading-7 text-slate-400 sm:text-base">
        {description}
      </p>
    </div>
  );
}

function OrchestrationVisual() {
  const nodes = [
    {
      label: "Teamcenter",
      detail: "PLM structure",
      icon: IconPlugConnected,
      className: "left-3 top-16 sm:left-6",
      delay: 0.08,
    },
    {
      label: "Windchill",
      detail: "Part hierarchy",
      icon: IconBuildingFactory,
      className: "right-3 top-16 sm:right-6",
      delay: 0.14,
    },
    {
      label: "Configit",
      detail: "Solved model",
      icon: IconBox,
      className: "bottom-12 left-1/2 -translate-x-1/2",
      delay: 0.2,
    },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
      className="relative mx-auto h-[520px] w-full max-w-[620px]"
    >
      <div className="absolute inset-0 rounded-[38px] border border-slate-800/80 bg-slate-900/45 shadow-[0_40px_120px_-55px_rgba(34,211,238,0.35)] backdrop-blur-xl" />
      <div className="absolute inset-px rounded-[37px] bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.10),transparent_34%)]" />

      <div className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/10" />
      <div className="absolute left-1/2 top-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-700/35" />

      <svg
        viewBox="0 0 600 520"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="connection" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <path d="M135 125 C175 170 225 210 300 254" fill="none" stroke="url(#connection)" />
        <path d="M465 125 C425 170 375 210 300 254" fill="none" stroke="url(#connection)" />
        <path d="M300 425 C300 365 300 315 300 254" fill="none" stroke="url(#connection)" />
      </svg>

      {nodes.map((node) => {
        const Icon = node.icon;

        return (
          <motion.div
            key={node.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: [0, -4, 0] }}
            transition={{
              opacity: { delay: node.delay, duration: 0.35 },
              y: {
                delay: node.delay + 0.4,
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              },
            }}
            className={`absolute ${node.className}`}
          >
            <div className="flex min-w-[154px] items-center gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/85 p-3 shadow-xl shadow-black/25 backdrop-blur-xl">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/[0.08] text-cyan-300 ring-1 ring-inset ring-cyan-400/15">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{node.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-600">{node.detail}</p>
              </div>
            </div>
          </motion.div>
        );
      })}

      <motion.div
        animate={{
          boxShadow: [
            "0 0 0 0 rgba(34,211,238,0.05)",
            "0 0 0 18px rgba(34,211,238,0)",
          ],
        }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[30px] border border-cyan-400/25 bg-slate-950/90 shadow-[0_0_60px_rgba(34,211,238,0.13)] backdrop-blur-xl"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/[0.09] text-cyan-300 ring-1 ring-inset ring-cyan-400/20">
          <IconDatabase className="h-5 w-5" />
        </div>
        <span className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
          BOM core
        </span>
      </motion.div>

      <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-950/55 px-3 py-2 text-[10px] text-slate-600 backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Orchestration ready
        </span>
        <span>Normalized structure workspace</span>
      </div>
    </motion.div>
  );
}

function BackgroundEffects() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-[-260px] h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-cyan-500/[0.08] blur-[120px]" />
      <div className="absolute -right-64 top-[38%] h-[520px] w-[520px] rounded-full bg-indigo-500/[0.07] blur-[120px]" />
      <div className="absolute -left-60 bottom-[-160px] h-[500px] w-[500px] rounded-full bg-cyan-500/[0.05] blur-[110px]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.025)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
    </div>
  );
}
