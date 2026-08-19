"use client";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChevronRight,
  IconHome,
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconMenu2,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const items = [
  {
    href: "/bom-comparison",
    label: "Platform",
    detail: "Source orchestration and BOM comparison",
    icon: IconLayoutDashboard,
  },
  {
    href: "/lattice",
    label: "Lattice",
    detail: "Spatial enterprise product intelligence",
    icon: IconSearch,
  },
] as const;

function routeMeta(pathname: string) {
  if (pathname.startsWith("/lattice") || pathname.startsWith("/item-explorer") || pathname.startsWith("/item-360"))
    return { title: "Lattice", parent: "Platform" };
  return { title: "Digital Thread Orchestration Platform", parent: null };
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const platformRoute =
    pathname.startsWith("/lattice") ||
    pathname.startsWith("/item-explorer") ||
    pathname.startsWith("/item-360") ||
    pathname.startsWith("/bom-comparison");
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(
    () =>
      setCollapsed(
        localStorage.getItem("platform-navigation-collapsed") === "true",
      ),
    [],
  );
  useEffect(() => setMobile(false), [pathname]);
  useEffect(() => {
    if (!mobile) return;
    closeRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [mobile]);
  if (!platformRoute) return children;
  const toggle = () =>
    setCollapsed((value) => {
      localStorage.setItem("platform-navigation-collapsed", String(!value));
      return !value;
    });
  const meta = routeMeta(pathname);
  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-950 dark:bg-[#050914] dark:text-slate-100">
      <a
        href="#platform-content"
        className="sr-only z-[10000] rounded bg-cyan-600 px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-[300] hidden border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-[#080d18] lg:flex lg:flex-col ${collapsed ? "w-[72px]" : "w-[248px]"}`}
          aria-label="Platform navigation"
        >
          <NavContent
            pathname={pathname}
            collapsed={collapsed}
            onToggle={toggle}
          />
        </aside>
        {mobile ? (
          <div className="fixed inset-0 z-[500] lg:hidden">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-slate-950/65"
              onClick={() => setMobile(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Platform navigation"
              className="relative z-10 flex h-full w-[min(90vw,320px)] flex-col bg-white shadow-2xl dark:bg-[#080d18]"
            >
              <NavContent
                pathname={pathname}
                collapsed={false}
                onToggle={() => setMobile(false)}
                mobile
                closeRef={closeRef}
              />
            </aside>
          </div>
        ) : null}
        <div
          className={`min-w-0 flex-1 transition-[padding] duration-200 ${collapsed ? "lg:pl-[72px]" : "lg:pl-[248px]"}`}
        >
          <header className="sticky top-0 z-[250] flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-xl dark:border-slate-800 dark:bg-[#080d18]/95 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobile(true)}
                aria-label="Open navigation"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 lg:hidden dark:border-slate-700"
              >
                <IconMenu2 className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <nav
                  aria-label="Breadcrumb"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
                >
                  <Link href="/" className="hover:text-cyan-600">
                    <IconHome className="h-3.5 w-3.5" />
                  </Link>
                  {meta.parent ? (
                    <>
                      <IconChevronRight className="h-3.5 w-3.5" />
                      <Link
                        href="/bom-comparison"
                        className="hover:text-cyan-600"
                      >
                        {meta.parent}
                      </Link>
                      <IconChevronRight className="h-3.5 w-3.5" />
                      <span
                        aria-current="page"
                        className="text-slate-700 dark:text-slate-300"
                      >
                        {meta.title}
                      </span>
                    </>
                  ) : (
                    <>
                      <IconChevronRight className="h-3.5 w-3.5" />
                      <span
                        aria-current="page"
                        className="text-slate-700 dark:text-slate-300"
                      >
                        Platform
                      </span>
                    </>
                  )}
                </nav>
                <p className="mt-1 truncate text-base font-semibold tracking-tight">
                  {meta.title}
                </p>
              </div>
            </div>
            <ThemeToggle compact />
          </header>
          <main
            id="platform-content"
            tabIndex={-1}
            className="min-h-[calc(100vh-64px)] outline-none"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function NavContent({
  pathname,
  collapsed,
  onToggle,
  mobile = false,
  closeRef,
}: {
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  mobile?: boolean;
  closeRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      <div
        className={`flex h-16 shrink-0 items-center border-b border-slate-200 dark:border-slate-800 ${collapsed ? "justify-center" : "justify-between px-3"}`}
      >
        <Link href="/" className="flex min-w-0 items-center gap-3" title="Home">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-sm font-bold text-white">
            DT
          </span>
          {!collapsed ? (
            <span className="min-w-0">
              <b className="block truncate text-sm font-semibold">
                Digital Thread
              </b>
              <span className="block truncate text-xs text-slate-500">
                Orchestration Platform
              </span>
            </span>
          ) : null}
        </Link>
        {!collapsed ? (
          <button
            ref={closeRef}
            onClick={onToggle}
            aria-label={mobile ? "Close navigation" : "Collapse navigation"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {mobile ? (
              <IconX className="h-4 w-4" />
            ) : (
              <IconLayoutSidebarLeftCollapse className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <p
          className={`mb-2 px-2 text-xs font-bold uppercase tracking-[.12em] text-slate-400 ${collapsed ? "sr-only" : ""}`}
        >
          Workspaces
        </p>
        <div className="space-y-2">
          {items.map(({ href, label, detail, icon: Icon }) => {
            const active =
              href === "/lattice"
                ? pathname.startsWith("/lattice") ||
                  pathname.startsWith("/item-explorer") ||
                  pathname.startsWith("/item-360")
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={`group relative flex min-h-12 items-center rounded-xl border transition ${collapsed ? "w-12 justify-center p-0" : "gap-3 px-3 py-2"} ${active ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200" : "border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/70"}`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed ? (
                  <span className="min-w-0">
                    <b className="block text-sm font-semibold">{label}</b>
                    <span className="block truncate text-xs text-slate-500">
                      {detail}
                    </span>
                  </span>
                ) : null}
                {collapsed ? (
                  <span className="pointer-events-none absolute left-[calc(100%+10px)] z-[600] hidden whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block group-focus-visible:block">
                    {label}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
      {collapsed ? (
        <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
          <button
            onClick={onToggle}
            aria-label="Expand navigation"
            title="Expand navigation"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="shrink-0 border-t border-slate-200 p-4 text-xs leading-5 text-slate-500 dark:border-slate-800">
          Connected engineering workspace
        </div>
      )}
    </>
  );
}
