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
  IconSitemap,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ThemeToggle";
const cards = [
  {
    title: "ALM",
    text: "Requirements flows from here to different applications",
    icon: IconSitemap,
    badge: "Codebeamer",
  },
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

            {/* Source-to-platform connection network */}
            <svg
              viewBox="0 0 620 520"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="alm-connection" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
                  <stop offset="45%" stopColor="#a78bfa" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.8" />
                </linearGradient>

                <linearGradient
                  id="teamcenter-connection"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
                  <stop offset="48%" stopColor="#22d3ee" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.75" />
                </linearGradient>

                <linearGradient
                  id="windchill-connection"
                  x1="1"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                  <stop offset="48%" stopColor="#f59e0b" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.75" />
                </linearGradient>

                <linearGradient
                  id="configit-connection"
                  x1="0"
                  y1="1"
                  x2="1"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.3" />
                  <stop offset="48%" stopColor="#818cf8" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.75" />
                </linearGradient>

                <linearGradient id="sap-connection" x1="1" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                  <stop offset="48%" stopColor="#34d399" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.75" />
                </linearGradient>

                <filter
                  id="connection-glow"
                  x="-30%"
                  y="-30%"
                  width="160%"
                  height="160%"
                >
                  <feGaussianBlur stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                <filter
                  id="data-particle-glow"
                  x="-300%"
                  y="-300%"
                  width="700%"
                  height="700%"
                >
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/*
      Exact source badge centers in the 620 x 520 SVG coordinate system:

      ALM        = 310, 66
      Teamcenter = 75, 107
      Windchill  = 545, 107
      Configit   = 75, 413
      SAP        = 545, 413

      Central platform boundary connection points:

      Top        = 310, 188
      Upper-left = 247, 224
      Upper-right= 373, 224
      Lower-left = 247, 296
      Lower-right= 373, 296
    */}

              {/* ALM to orchestration platform */}
              <path
                id="alm-path"
                d="M310 86 C310 118 310 152 310 188"
                fill="none"
                stroke="url(#alm-connection)"
                strokeWidth="1.8"
                strokeLinecap="round"
                filter="url(#connection-glow)"
              />

              {/* Teamcenter to orchestration platform */}
              <path
                id="teamcenter-path"
                d="M96 107 C152 123 205 166 247 224"
                fill="none"
                stroke="url(#teamcenter-connection)"
                strokeWidth="1.8"
                strokeLinecap="round"
                filter="url(#connection-glow)"
              />

              {/* Windchill to orchestration platform */}
              <path
                id="windchill-path"
                d="M524 107 C468 123 415 166 373 224"
                fill="none"
                stroke="url(#windchill-connection)"
                strokeWidth="1.8"
                strokeLinecap="round"
                filter="url(#connection-glow)"
              />

              {/* Configit to orchestration platform */}
              <path
                id="configit-path"
                d="M96 413 C152 397 205 354 247 296"
                fill="none"
                stroke="url(#configit-connection)"
                strokeWidth="1.8"
                strokeLinecap="round"
                filter="url(#connection-glow)"
              />

              {/* SAP to orchestration platform */}
              <path
                id="sap-path"
                d="M524 413 C468 397 415 354 373 296"
                fill="none"
                stroke="url(#sap-connection)"
                strokeWidth="1.8"
                strokeLinecap="round"
                filter="url(#connection-glow)"
              />

              {/* Source connection anchors */}
              <circle cx="310" cy="86" r="2.6" fill="#a78bfa" opacity="0.95" />
              <circle cx="96" cy="107" r="2.6" fill="#22d3ee" opacity="0.95" />
              <circle cx="524" cy="107" r="2.6" fill="#f59e0b" opacity="0.95" />
              <circle cx="96" cy="413" r="2.6" fill="#818cf8" opacity="0.95" />
              <circle cx="524" cy="413" r="2.6" fill="#34d399" opacity="0.95" />

              {/* Platform connection anchors */}
              <circle
                cx="310"
                cy="188"
                r="3"
                fill="#a78bfa"
                filter="url(#data-particle-glow)"
              />
              <circle
                cx="247"
                cy="224"
                r="3"
                fill="#22d3ee"
                filter="url(#data-particle-glow)"
              />
              <circle
                cx="373"
                cy="224"
                r="3"
                fill="#f59e0b"
                filter="url(#data-particle-glow)"
              />
              <circle
                cx="247"
                cy="296"
                r="3"
                fill="#818cf8"
                filter="url(#data-particle-glow)"
              />
              <circle
                cx="373"
                cy="296"
                r="3"
                fill="#34d399"
                filter="url(#data-particle-glow)"
              />

              {/* Animated ALM data */}
              <circle r="3.5" fill="#a78bfa" filter="url(#data-particle-glow)">
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="0s"
                  path="M310 86 C310 118 310 152 310 188"
                />
              </circle>

              {/* Animated Teamcenter data */}
              <circle r="3.5" fill="#22d3ee" filter="url(#data-particle-glow)">
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="0.65s"
                  path="M96 107 C152 123 205 166 247 224"
                />
              </circle>

              {/* Animated Windchill data */}
              <circle r="3.5" fill="#f59e0b" filter="url(#data-particle-glow)">
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="1.3s"
                  path="M524 107 C468 123 415 166 373 224"
                />
              </circle>

              {/* Animated Configit data */}
              <circle r="3.5" fill="#818cf8" filter="url(#data-particle-glow)">
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="1.95s"
                  path="M96 413 C152 397 205 354 247 296"
                />
              </circle>

              {/* Animated SAP data */}
              <circle r="3.5" fill="#34d399" filter="url(#data-particle-glow)">
                <animateMotion
                  dur="3.8s"
                  repeatCount="indefinite"
                  begin="2.6s"
                  path="M524 413 C468 397 415 354 373 296"
                />
              </circle>
            </svg>

            {/* ALM */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
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
                  delay: 0.5,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute left-1/2 top-5 z-20 -translate-x-1/2"
            >
              <div className="flex items-center rounded-2xl border border-violet-200 bg-white/90 p-2 shadow-xl shadow-violet-900/10 backdrop-blur-xl dark:border-violet-400/20 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-xs font-bold text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/[0.08] dark:text-violet-300">
                  ALM
                </span>
              </div>
            </motion.div>

            {/* Teamcenter */}
            <motion.div
              initial={{ opacity: 0, x: -12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                x: 0,
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.14,
                  duration: 0.35,
                },
                x: {
                  delay: 0.14,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.14,
                  duration: 0.35,
                },
                y: {
                  delay: 0.7,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute left-4 top-[66px] z-20 sm:left-7"
            >
              <div className="flex items-center rounded-2xl border border-cyan-200 bg-white/90 p-2 shadow-xl shadow-cyan-900/10 backdrop-blur-xl dark:border-cyan-400/20 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-xs font-bold text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/[0.08] dark:text-cyan-300">
                  PLM
                </span>
              </div>
            </motion.div>

            {/* Windchill */}
            <motion.div
              initial={{ opacity: 0, x: 12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                x: 0,
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.2,
                  duration: 0.35,
                },
                x: {
                  delay: 0.2,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.2,
                  duration: 0.35,
                },
                y: {
                  delay: 0.9,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute right-4 top-[66px] z-20 sm:right-7"
            >
              <div className="flex items-center rounded-2xl border border-amber-200 bg-white/90 p-2 shadow-xl shadow-amber-900/10 backdrop-blur-xl dark:border-amber-400/20 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-300">
                  PLM
                </span>
              </div>
            </motion.div>

            {/* Configit */}
            <motion.div
              initial={{ opacity: 0, x: -12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                x: 0,
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.26,
                  duration: 0.35,
                },
                x: {
                  delay: 0.26,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.26,
                  duration: 0.35,
                },
                y: {
                  delay: 1.1,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute bottom-[66px] left-4 z-20 sm:left-7"
            >
              <div className="flex items-center rounded-2xl border border-indigo-200 bg-white/90 p-2 shadow-xl shadow-indigo-900/10 backdrop-blur-xl dark:border-indigo-400/20 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 dark:border-indigo-400/20 dark:bg-indigo-400/[0.08] dark:text-indigo-300">
                  CPQ
                </span>
              </div>
            </motion.div>

            {/* SAP */}
            <motion.div
              initial={{ opacity: 0, x: 12, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0],
                x: 0,
                scale: 1,
              }}
              transition={{
                opacity: {
                  delay: 0.32,
                  duration: 0.35,
                },
                x: {
                  delay: 0.32,
                  duration: 0.35,
                },
                scale: {
                  delay: 0.32,
                  duration: 0.35,
                },
                y: {
                  delay: 1.3,
                  duration: 4.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }}
              className="absolute bottom-[66px] right-4 z-20 sm:right-7"
            >
              <div className="flex items-center rounded-2xl border border-emerald-200 bg-white/90 p-2 shadow-xl shadow-emerald-900/10 backdrop-blur-xl dark:border-emerald-400/20 dark:bg-slate-950/90 dark:shadow-black/30">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/[0.08] dark:text-emerald-300">
                  ERP
                </span>
              </div>
            </motion.div>

            {/* Central orchestration platform */}
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

              <span className="mt-3 text-center text-[8px] font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-200">
                Orchestration
                <br />
                Platform
              </span>
            </motion.div>

            {/* Bottom connected-systems status */}
            <div className="absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white/85 px-3 py-1.5 text-[9px] font-medium text-slate-500 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/75 sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Product data connected across ALM, PLM, CPQ, and ERP
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
          <div className="mt-9 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
