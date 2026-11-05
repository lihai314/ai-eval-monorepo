import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "issue-pilot",
  description: "Agent app skeleton: issue -> PR -> CI -> staging -> smoke -> production",
};

// Theme is applied by ThemeToggle on mount; no inline script needed (Biome
// forbids dangerouslySetInnerHTML). The CSS below sets the light defaults so
// a persisted dark choice may flash briefly on first paint.
const themeCss = `:root{color-scheme:light;--bg:#ffffff;--fg:#1a1a1a;--muted:#555555;--border:#dddddd;--surface:#f7f7f7}:root[data-theme="dark"]{color-scheme:dark;--bg:#14161a;--fg:#e8e8e8;--muted:#a8a8a8;--border:#39404b;--surface:#1e2127}body{background:var(--bg);color:var(--fg)}p{color:var(--fg)}input,button{background:var(--surface);color:var(--fg);border-color:var(--border)}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{themeCss}</style>
      </head>
      <body style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", margin: 40 }}>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
