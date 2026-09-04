"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/home/research", label: "Research", icon: "◉" },
  { href: "/home/quant", label: "Quant", icon: "⌁" },
  { href: "/home/portfolio", label: "Portfolio", icon: "▦" },
  { href: "/home/orders", label: "Orders", icon: "↗" },
  { href: "/home/risk", label: "Risk", icon: "◇" },
];

interface SidebarProps { collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void; onToggleCollapsed: () => void; }

export function Sidebar({ collapsed, mobileOpen, onCloseMobile, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className={`dashboard-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`} aria-label="Dashboard navigation">
      <div className="dashboard-sidebar__brand-row">
        <Link href="/home/research" className="dashboard-sidebar__brand" aria-label="Razorstack home" onClick={onCloseMobile}>
          <span className="brand-mark">R</span><span className="dashboard-sidebar__brand-name">Razorstack</span>
        </Link>
        <button type="button" className="dashboard-sidebar__mobile-close" aria-label="Close navigation" onClick={onCloseMobile}>×</button>
      </div>
      <div className="dashboard-sidebar__status"><span className="dashboard-sidebar__status-dot" /><span className="dashboard-sidebar__status-text">Paper trading</span></div>
      <nav aria-label="Primary navigation" className="dashboard-sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} aria-current={isActive ? "page" : undefined} aria-label={collapsed ? item.label : undefined} onClick={onCloseMobile} className={`dashboard-sidebar__link ${isActive ? "is-active" : ""}`}>
            <span className="dashboard-sidebar__icon" aria-hidden="true">{item.icon}</span><span className="dashboard-sidebar__label">{item.label}</span>
          </Link>;
        })}
      </nav>
      <div className="dashboard-sidebar__footer">
        <ThemeToggle compact={collapsed} />
        <button type="button" className="dashboard-sidebar__collapse" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span><span className="dashboard-sidebar__label">Collapse</span>
        </button>
        <p className="dashboard-sidebar__version">v0.1.0</p>
      </div>
    </aside>
  );
}
