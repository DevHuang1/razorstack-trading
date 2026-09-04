"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import type { ReactNode } from "react";

const SIDEBAR_KEY = "razorstack-sidebar-collapsed";
const SIDEBAR_EVENT = "razorstack-sidebar-change";

function subscribeSidebar(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SIDEBAR_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SIDEBAR_EVENT, callback);
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const isQuant = pathname === "/home/quant";
  const sidebarStorageKey = `${SIDEBAR_KEY}:${isQuant ? "quant" : "default"}`;
  const [mobileOpen, setMobileOpen] = useState(false);
  const getSnapshot = useCallback(() => {
    const saved = window.localStorage.getItem(sidebarStorageKey);
    return saved === null ? isQuant : saved === "true";
  }, [isQuant, sidebarStorageKey]);
  const getServerSnapshot = useCallback(() => isQuant, [isQuant]);
  const collapsed = useSyncExternalStore(subscribeSidebar, getSnapshot, getServerSnapshot);

  const toggleCollapsed = () => {
    window.localStorage.setItem(sidebarStorageKey, String(!collapsed));
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  if (isLanding) return <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>;

  return (
    <div className="app-shell min-h-dvh w-full">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onToggleCollapsed={toggleCollapsed} />
      {mobileOpen && <button type="button" aria-label="Close navigation" className="app-shell__backdrop" onClick={() => setMobileOpen(false)} />}
      <div className="app-shell__content min-w-0">
        <header className="mobile-header">
          <button type="button" className="mobile-header__menu" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><span aria-hidden="true">☰</span></button>
          <div className="mobile-header__brand"><span className="brand-mark">R</span><span>Razorstack</span></div>
          <span className="paper-badge">Paper</span>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
