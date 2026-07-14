"use client";

import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme, type ThemePreference } from "./ThemeProvider";

const options: Array<{ value: ThemePreference; label: string; icon: typeof IconSun }> = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white/80 p-1 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/75" role="group" aria-label="Color theme">
      {options.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" onClick={() => setTheme(value)} aria-pressed={theme === value} title={`${label} theme`}
          className={["inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60", theme === value ? "bg-slate-900 text-white shadow-sm dark:bg-cyan-400 dark:text-slate-950" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"].join(" ")}>
          <Icon className="h-4 w-4" />
          {!compact ? <span className="hidden sm:inline">{label}</span> : null}
        </button>
      ))}
    </div>
  );
}
