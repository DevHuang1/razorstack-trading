"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/home/research", label: "Research", icon: "🧠" },
  { href: "/home/quant", label: "Quant", icon: "📊" },
  { href: "/home/portfolio", label: "Portfolio", icon: "💼" },
  { href: "/home/orders", label: "Orders", icon: "↗" },
  { href: "/home/risk", label: "Risk", icon: "🛡" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-screen w-64 min-w-64 max-w-64 shrink-0 flex-col border-r border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center font-bold text-white text-sm">
          R
        </div>
        <span className="text-lg font-bold tracking-wider text-zinc-100">Razorstack</span>
      </div>

      <nav aria-label="Primary navigation" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all
                ${isActive
                  ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent"
                }
              `}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
        <ThemeToggle />
        <p className="px-1 text-[10px] uppercase tracking-wider text-zinc-600">v0.1.0</p>
      </div>
    </aside>
  );
}
