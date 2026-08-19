import localFont from "next/font/local";

export const dmSans = localFont({
  variable: "--font-dm-sans",
  display: "swap",
  preload: true,
  fallback: ["Arial", "Helvetica", "sans-serif"],
  src: [
    { path: "./DMSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "./DMSans-Italic.ttf", weight: "400", style: "italic" },
    { path: "./DMSans-Medium.ttf", weight: "500", style: "normal" },
    { path: "./DMSans-MediumItalic.ttf", weight: "500", style: "italic" },
    { path: "./DMSans-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./DMSans-SemiBoldItalic.ttf", weight: "600", style: "italic" },
    { path: "./DMSans-Bold.ttf", weight: "700", style: "normal" },
    { path: "./DMSans-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
});
