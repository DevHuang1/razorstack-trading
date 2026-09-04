"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "razorstack-theme";

let cachedTheme: Theme | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  if (cachedTheme === null) {
    cachedTheme =
      window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  }
  return cachedTheme;
}

// Hydration-safe: render dark on the server, adopt the saved theme after mount.
function getServerSnapshot(): Theme {
  return "dark";
}

function applyThemeClasses(theme: Theme): void {
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Sync the theme classes on <html> (an external system) — no setState here.
  useEffect(() => {
    applyThemeClasses(theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    cachedTheme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyThemeClasses(nextTheme);
    for (const listener of listeners) listener();
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
    >
      <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
      <span aria-hidden="true" className="text-sm">{theme === "dark" ? "☾" : "☀"}</span>
    </button>
  );
}
