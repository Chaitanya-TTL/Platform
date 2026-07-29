"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import {
  IconArrowRight,
  IconArrowsExchange,
  IconBox,
  IconBuildingFactory,
  IconReportSearch,
  IconDatabase,
  IconPlugConnected,
  IconSitemap,
  type Icon,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ThemeToggle";

type Capability = {
  title: string;
  text: string;
  icon: Icon;
  badge: string;
  tone: string;
};

const capabilities: Capability[] = [
  {
    title: "ALM",
    text: "Connect requirements with product structures.",
    icon: IconSitemap,
    badge: "Codebeamer",
    tone: "violet",
  },
  {
    title: "PLM",
    text: "Extract and inspect engineering BOMs.",
    icon: IconPlugConnected,
    badge: "Teamcenter · Windchill",
    tone: "cyan",
  },
  {
    title: "CPQ",
    text: "Resolve configurable product models.",
    icon: IconBox,
    badge: "Configit",
    tone: "indigo",
  },
  {
    title: "ERP",
    text: "Connect manufacturing and enterprise BOMs.",
    icon: IconBuildingFactory,
    badge: "SAP · Oracle",
    tone: "emerald",
  },
  {
    title: "Service",
    text: "Service supply chain optimization",
    icon: IconReportSearch,
    badge: "Servigistics",
    tone: "sky",
  },
];

const toneClasses: Record<string, { icon: string; hover: string }> = {
  violet: {
    icon: "border-violet-400/20 bg-violet-400/10 text-violet-300",
    hover: "hover:border-violet-400/35 hover:bg-violet-400/[.05]",
  },
  cyan: {
    icon: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
    hover: "hover:border-cyan-400/35 hover:bg-cyan-400/[.05]",
  },
  indigo: {
    icon: "border-indigo-400/20 bg-indigo-400/10 text-indigo-300",
    hover: "hover:border-indigo-400/35 hover:bg-indigo-400/[.05]",
  },
  emerald: {
    icon: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    hover: "hover:border-emerald-400/35 hover:bg-emerald-400/[.05]",
  },
  sky: {
    icon: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    hover: "hover:border-sky-400/35 hover:bg-sky-400/[.05]",
  },
};

export default function Home() {
  return (
    <main className="relative h-[100svh] min-h-[680px] overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#050b18] dark:text-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(34,211,238,.11),transparent_32%),radial-gradient(circle_at_20%_90%,rgba(99,102,241,.07),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.025)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />

      <div className="relative mx-auto grid h-full w-full grid-rows-[auto_minmax(0,1fr)] gap-4 px-5 py-5 sm:px-8 lg:px-10 lg:py-6">
        <header className="flex h-[68px] w-full items-center justify-between rounded-2xl  px-4 shadow-sm backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div>
              <Image
                src="/images/TTL_Logo.png"
                width={230}
                height={150}
                alt="Tata Technologies"
                priority
                className="h-12 w-auto object-contain dark:brightness-0 dark:invert"
              />{" "}
            </div>
          </div>

          <div className="flex mr-22  items-center gap-2">
            <ThemeToggle compact />
            <Link
              href="/bom-comparison"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-xs font-semibold text-white shadow-lg shadow-cyan-500/15 transition hover:bg-cyan-500"
            >
              Open workspace
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="grid min-h-0 items-center gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(430px,.92fr)] xl:gap-12">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex min-h-0 flex-col justify-center py-3 lg:py-5"
          >
            <div className="max-w-[900px]">
              {/* <p className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/[.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[.22em] text-cyan-600 dark:text-cyan-300">
                Connected enterprise product intelligence
              </p> */}

              <h1 className="mt-5 text-7xl font-semibold leading-[.98] tracking-[-.055em]">
                Orchestration Platform
                <span className="mt-1 block bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 bg-clip-text text-transparent">
                  for products across enterprise applications
                </span>
              </h1>

              <p className="mt-5 max-w-3xl text-xl leading-6 text-slate-600 dark:text-slate-400 xl:leading-7">
                Connect requirements, engineering, configuration, manufacturing,
                and design data in one source-aware digital thread.
              </p>
            </div>

            <div className="mt-7 grid grid-cols-5 gap-2.5 xl:gap-3">
              {capabilities.map((card, index) => {
                const CardIcon = card.icon;
                const tone = toneClasses[card.tone];
                return (
                  <motion.article
                    key={card.title}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + index * 0.045 }}
                    className={`group flex min-h-[176px] min-w-0 flex-col rounded-2xl border border-slate-200 bg-white/75 p-3.5 shadow-sm backdrop-blur transition dark:border-slate-800 dark:bg-slate-900/55 xl:min-h-[188px] xl:p-4 ${tone.hover}`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tone.icon}`}
                    >
                      <CardIcon className="h-4 w-4" />
                    </span>
                    <h2 className="mt-3 text-xl font-semibold tracking-tight">
                      {card.title}
                    </h2>
                    <p className="mt-1.5 text-[11px] leading-[1.55] text-slate-500 dark:text-slate-400">
                      {card.text}
                    </p>
                    <span className="mt-auto block truncate pt-3 text-[9px] font-semibold uppercase tracking-[.12em] text-slate-500">
                      {card.badge}
                    </span>
                  </motion.article>
                );
              })}
            </div>
          </motion.div>

          <PlatformVisual />
        </section>
      </div>
    </main>
  );
}

function PlatformVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
      className="relative mx-auto aspect-square w-full max-w-[610px] overflow-hidden rounded-[34px] border border-slate-200 bg-white/70 shadow-[0_40px_120px_-55px_rgba(8,145,178,.4)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/45"
    >
      <div className="pointer-events-none absolute inset-px rounded-[33px] bg-[radial-gradient(circle_at_center,rgba(34,211,238,.13),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.035)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(circle_at_center,black,transparent_80%)]" />

      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 48, repeat: Infinity, ease: "linear" }}
        className="absolute left-1/2 top-1/2 h-[42%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/15"
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 68, repeat: Infinity, ease: "linear" }}
        className="absolute left-1/2 top-1/2 h-[64%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-400/20"
      />

      <svg
        viewBox="0 0 620 620"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <Connection
          path="M105 150 C200 175 235 235 275 276"
          color="#22d3ee"
          delay="0s"
        />
        <Connection
          path="M515 150 C420 175 385 235 345 276"
          color="#a78bfa"
          delay=".65s"
        />
        <Connection
          path="M105 470 C200 445 235 385 275 344"
          color="#818cf8"
          delay="1.3s"
        />
        <Connection
          path="M515 470 C420 445 385 385 345 344"
          color="#34d399"
          delay="1.95s"
        />
      </svg>

      <SystemBadge label="PLM" className="left-[5%] top-[18%]" tone="cyan" />
      <SystemBadge label="ALM" className="right-[5%] top-[18%]" tone="violet" />
      <SystemBadge
        label="CPQ"
        className="bottom-[18%] left-[5%]"
        tone="indigo"
      />
      <SystemBadge
        label="ERP"
        className="bottom-[18%] right-[5%]"
        tone="emerald"
      />

      <motion.div
        animate={{
          boxShadow: [
            "0 0 0 0 rgba(34,211,238,.15)",
            "0 0 0 22px rgba(34,211,238,0)",
          ],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 flex h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[30px] border border-cyan-400/30 bg-white/95 shadow-[0_20px_60px_-20px_rgba(8,145,178,.5)] dark:bg-slate-950/95"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/[.09] text-cyan-600 dark:text-cyan-300">
          <IconDatabase className="h-5 w-5" />
        </span>
        <span className="mt-3 text-center text-[11px] font-semibold uppercase tracking-[.2em] text-cyan-700 dark:text-cyan-200">
          Orchestration
          <br />
          Platform
        </span>
      </motion.div>
    </motion.div>
  );
}

function Connection({
  path,
  color,
  delay,
}: {
  path: string;
  color: string;
  delay: string;
}) {
  return (
    <>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeOpacity=".7"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <circle r="4" fill={color} filter="url(#glow)">
        <animateMotion
          dur="4s"
          repeatCount="indefinite"
          begin={delay}
          path={path}
        />
      </circle>
    </>
  );
}

function SystemBadge({
  label,
  className,
  tone,
}: {
  label: string;
  className: string;
  tone: "cyan" | "violet" | "indigo" | "emerald";
}) {
  const styles = {
    cyan: "border-cyan-400/25 bg-cyan-400/[.08] text-cyan-300",
    violet: "border-violet-400/25 bg-violet-400/[.08] text-violet-300",
    indigo: "border-indigo-400/25 bg-indigo-400/[.08] text-indigo-300",
    emerald: "border-emerald-400/25 bg-emerald-400/[.08] text-emerald-300",
  };
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
      className={`absolute z-20 rounded-2xl border bg-slate-950/85 p-2 shadow-xl backdrop-blur ${className}`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl border text-[15px] font-bold ${styles[tone]}`}
      >
        {label}
      </span>
    </motion.div>
  );
}
