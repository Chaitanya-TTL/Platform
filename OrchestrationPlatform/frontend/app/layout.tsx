import type { Metadata } from "next";
import { dmSans } from "@/fonts/static/dm-sans";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PlatformShell } from "@/components/platform-shell/PlatformShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Thread Orchestration Platform",
  description:
    "Teamcenter, Windchill, Configit, SAP and CAD orchestration platform",
};

const themeScript = `(function(){try{var t=localStorage.getItem('orchestration-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.classList.add('dark')}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${dmSans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider><PlatformShell>{children}</PlatformShell></ThemeProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand
          duration={5200}
          visibleToasts={4}
          theme="dark"
          gap={10}
          offset={{ top: 76, right: 20 }}
          toastOptions={{
            classNames: {
              toast: "!border !border-slate-700/80 !bg-slate-950/95 !text-slate-100 !shadow-2xl !backdrop-blur-xl",
              title: "!font-semibold !tracking-tight",
              description: "!text-slate-400",
              closeButton: "!border-slate-700 !bg-slate-900 !text-slate-300",
            },
          }}
        />
      </body>
    </html>
  );
}
