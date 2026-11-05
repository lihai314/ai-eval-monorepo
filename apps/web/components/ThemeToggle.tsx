"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** #48: manual theme switch, persisted in localStorage and applied before paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("evalhub-theme");
    } catch {
      // Private browsing: fall back to the OS preference.
    }
    const initial: Theme =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = initial;
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("evalhub-theme", next);
    } catch {
      // Private browsing: the in-memory choice still applies for this page.
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="切换明暗主题"
      style={{
        position: "absolute",
        top: 12,
        right: 16,
        padding: "4px 10px",
        cursor: "pointer",
        background: "var(--surface)",
        color: "var(--fg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      {theme === "dark" ? "浅色" : "深色"}
    </button>
  );
}
