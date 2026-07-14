"use client";
import Link from "next/link";
import { motion } from "motion/react";
import {
  IconArrowRight,
  IconArrowsExchange,
  IconBox,
  IconBuildingFactory,
  IconCheck,
  IconCode,
  IconDatabase,
  IconPlugConnected,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ThemeToggle";
const cards = [
  {
    title: "PLM",
    text: "Extract and inspect Teamcenter and Windchill BOM structures.",
    icon: IconPlugConnected,
    badge: "Teamcenter · Windchill",
  },
  {
    title: "CPQ",
    text: "Resolve Configit product models through one visual language.",
    icon: IconBox,
    badge: "Configit",
  },
  {
    title: "ERP",
    text: "Prepare downstream enterprise handoffs for manufacturing.",
    icon: IconBuildingFactory,
    badge: "SAP · Oracle",
  },
  {
    title: "CAD",
    text: "Connect engineering structure with design context.",
    icon: IconCode,
    badge: "NX · Creo · SolidWorks",
  },
];
export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#050b18] dark:text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.12),transparent_42%)]" />
      <div className="relative mx-auto max-w-[1440px] px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/45">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-400/[.07] dark:text-cyan-300 dark:ring-cyan-400/20">
              <IconArrowsExchange className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Digital Thread</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Orchestration platform
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link
              href="/bom-comparison"
              className="hidden h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-xs font-semibold text-white sm:inline-flex"
            >
              Open workspace
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>
        <section className="grid min-h-[650px] items-center gap-12 py-16 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="text-xs font-semibold uppercase tracking-[.24em] text-cyan-600 dark:text-cyan-300">
              Source-aware product structure
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-[-.045em] sm:text-6xl">
              Digital Thread
              <span className="block bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 bg-clip-text text-transparent">
                Orchestration Platform
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-400 sm:text-lg">
              Orchestrate BOM extraction across enterprise systems, normalize
              complex hierarchies, and review every structure in one focused
              workspace.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/bom-comparison"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20"
              >
                Open Platform
                <IconArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#capabilities"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900"
              >
                Explore platform
              </a>
            </div>
            <div className="mt-9 grid gap-3 sm:grid-cols-2">
              {[
                "Source-aware extraction",
                "Normalized BOM hierarchy",
                "Independent execution states",
                "Enterprise review workspace",
              ].map((x) => (
                <div
                  key={x}
                  className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
                >
                  <IconCheck className="h-4 w-4 text-emerald-500" />
                  {x}
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: 0.55,
              delay: 0.08,
              ease: "easeOut",
            }}
            className="relative mx-auto h-[520px] w-full max-w-[620px] overflow-hidden rounded-[38px] border border-slate-200 bg-white/75 shadow-[0_40px_120px_-55px_rgba(8,145,178,0.35)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/45 dark:shadow-[0_40px_120px_-55px_rgba(34,211,238,0.35)]"
          >
            {/* Central background glow */}
            <div className="pointer-events-none absolute inset-px rounded-[37px] bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.15),transparent_36%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.10),transparent_38%)]" />

            {/* Subtle grid */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)] dark:bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)]" />

            {/* Orbit rings */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 42,
                repeat: Infinity,
                ease: "linear",
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 h-[245px] w-[245px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/30 dark:border-cyan-400/10"
            >
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-500 shadow-[0_0_14px_rgba(6,182,212,0.8)] dark:bg-cyan-300" />
            </motion.div>

            <motion.div
              animate={{ rotate: -360 }}
              transition={{
                duration: 58,
                repeat: Infinity,
                ease: "linear",
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 h-[365px] w-[365px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-300/60 dark:border-slate-700/45"
            >
              <span className="absolute bottom-[18%] right-[5%] h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.75)] dark:bg-indigo-300" />
            </motion.div>

            {/* Connection lines and animated data flow */}
            <svg
              viewBox="0 0 620 520"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="product-connection"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.12" />
                  <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.15" />
                </linearGradient>

                <filter id="product-connection-glow">
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Teamcenter to Product */}
              <path
                id="teamcenter-path"
                d="M125 112 C175 155 225 215 310 260"
                fill="none"
                stroke="url(#product-connection)"
                strokeWidth="1.5"
                strokeLinecap="round"
                filter="url(#product-connection-glow)"
              />

              {/* Windchill to Product */}
              <path
                id="windchill-path"
                d="M495 112 C445 155 395 215 310 260"
                fill="none"
                stroke="url(#product-connection)"
                strokeWidth="1.5"
                strokeLinecap="round"
                filter="url(#product-connection-glow)"
              />

              {/* Configit to Product */}
              <path
                id="configit-path"
                d="M125 408 C175 365 225 305 310 260"
                fill="none"
                stroke="url(#product-connection)"
                strokeWidth="1.5"
                strokeLinecap="round"
                filter="url(#product-connection-glow)"
              />

              {/* SAP to Product */}
              <path
                id="sap-path"
                d="M495 408 C445 365 395 305 310 260"
                fill="none"
                stroke="url(#product-connection)"
                strokeWidth="1.5"
                strokeLinecap="round"
                filter="url(#product-connection-glow)"
              />

              {/* Animated Teamcenter data */}
              <circle
                r="3.5"
                fill="#22d3ee"
                filter="url(#product-connection-glow)"
              >
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="0s"
                  path="M125 112 C175 155 225 215 310 260"
                />
              </circle>

              {/* Animated Windchill data */}
              <circle
                r="3.5"
                fill="#f59e0b"
                filter="url(#product-connection-glow)"
              >
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="0.8s"
                  path="M495 112 C445 155 395 215 310 260"
                />
              </circle>

              {/* Animated Configit data */}
              <circle
                r="3.5"
                fill="#818cf8"
                filter="url(#product-connection-glow)"
              >
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="1.6s"
                  path="M125 408 C175 365 225 305 310 260"
                />
              </circle>

              {/* Animated SAP data */}
              <circle
                r="3.5"
                fill="#34d399"
                filter="url(#product-connection-glow)"
              >
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="2.4s"
                  path="M495 408 C445 365 395 305 310 260"
                />
              </circle>
            </svg>

            {/* Teamcenter */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.08,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.08,
                  duration: 0.35,
                },
                y: {
                  delay: 0.6,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute left-4 top-12 z-20 sm:left-7"
            >
              <div className="flex min-w-[150px] items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/[0.08] dark:text-cyan-300">
                  PLM
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">
                    Teamcenter
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                    PLM structure
                  </span>
                </span>
              </div>
            </motion.div>

            {/* Windchill */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.14,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.14,
                  duration: 0.35,
                },
                y: {
                  delay: 0.8,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute right-4 top-12 z-20 sm:right-7"
            >
              <div className="flex min-w-[150px] items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-300">
                  PLM
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">
                    Windchill
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                    Part hierarchy
                  </span>
                </span>
              </div>
            </motion.div>

            {/* Configit */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.2,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.2,
                  duration: 0.35,
                },
                y: {
                  delay: 1,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute bottom-12 left-4 z-20 sm:left-7"
            >
              <div className="flex min-w-[150px] items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/[0.08] dark:text-indigo-300">
                  CPQ
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">
                    Configit
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                    Product configuration
                  </span>
                </span>
              </div>
            </motion.div>

            {/* SAP */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.26,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.26,
                  duration: 0.35,
                },
                y: {
                  delay: 1.2,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute bottom-12 right-4 z-20 sm:right-7"
            >
              <div className="flex min-w-[150px] items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-900/10 backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
                  ERP
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">
                    SAP
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                    ERP operations
                  </span>
                </span>
              </div>
            </motion.div>

            {/* Central Product/BOM core */}
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(34,211,238,0.14)",
                  "0 0 0 20px rgba(34,211,238,0)",
                ],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
              className="absolute left-1/2 top-1/2 z-30 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[32px] border border-cyan-300 bg-white/95 shadow-[0_20px_60px_-20px_rgba(8,145,178,0.45)] backdrop-blur-xl dark:border-cyan-400/30 dark:bg-slate-950/95 dark:shadow-[0_0_65px_rgba(34,211,238,0.16)]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-200 dark:bg-cyan-400/[0.09] dark:text-cyan-300 dark:ring-cyan-400/20">
                <IconDatabase className="h-5 w-5" />
              </span>

              <span className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-200">
                Product
              </span>

              <span className="mt-1 text-[9px] text-slate-500">
                Unified BOM core
              </span>
            </motion.div>

            {/* Bottom status */}
            <div className="absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-[9px] font-medium text-slate-500 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/75 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Product data connected across PLM, CPQ, and ERP
            </div>
          </motion.div>
        </section>
        <section id="capabilities" className="py-14">
          <p className="text-xs font-semibold uppercase tracking-[.24em] text-cyan-600 dark:text-cyan-300">
            Connected enterprise
          </p>
          <h2 className="mt-3 text-4xl font-semibold">
            Bring every product system into focus
          </h2>
          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card, index) => {
              const Icon = card.icon;
              return (
                <motion.article
                  key={card.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/55"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/[.08] dark:text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold">{card.title}</h3>
                  <p className="mt-3 min-h-20 text-sm leading-7 text-slate-500">
                    {card.text}
                  </p>
                  <span className="mt-4 inline-block rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700">
                    {card.badge}
                  </span>
                </motion.article>
              );
            })}
          </div>
        </section>
        <footer className="mt-14 flex flex-col gap-3 border-t border-slate-200 py-7 text-xs text-slate-500 dark:border-slate-800 sm:flex-row sm:justify-between">
          <span>Digital Thread Orchestration Platform</span>
          <span>Source-aware BOM extraction and review</span>
        </footer>
      </div>
    </main>
  );
}
