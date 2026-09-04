"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/research", label: "Research", icon: "🧠" },
  { href: "/quant", label: "Quant", icon: "📊" },
  { href: "/alpaca-test", label: "Alpaca", icon: "🪜" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 min-h-screen border-r border-white/10 bg-black/20 flex flex-col p-4">
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center font-bold text-white text-sm">
          R
        </div>
        <span className="text-lg font-bold tracking-wider text-zinc-100">Razorstack</span>
      </div>

      <nav className="flex flex-col gap-1">
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

      <div className="mt-auto pt-4 border-t border-white/10">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-4">v0.1.0</p>
      </div>
    </nav>
  );
}
