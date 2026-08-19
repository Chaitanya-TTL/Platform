
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
          expand={false}
          duration={5000}
          visibleToasts={4}
          theme="system"
        />
      </body>
    </html>
  );
}
