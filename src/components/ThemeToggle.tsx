"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      window.addEventListener("razorstack-theme-change", callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener("razorstack-theme-change", callback);
      };
    },
    () => (window.localStorage.getItem("razorstack-theme") === "light" ? "light" : "dark") as Theme,
    () => "dark" as Theme,
  );

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("razorstack-theme", nextTheme);
    document.documentElement.classList.toggle("light", nextTheme === "light");
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.dispatchEvent(new Event("razorstack-theme-change"));
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={compact ? `${theme === "dark" ? "Light" : "Dark"} mode` : undefined}
      className={`sidebar-theme-toggle ${compact ? "is-compact" : ""}`}
    >
      <span className="sidebar-theme-toggle__label">{theme === "dark" ? "Dark mode" : "Light mode"}</span>
      <span aria-hidden="true" className="text-sm">{theme === "dark" ? "☾" : "☀"}</span>
    </button>
  );
}
