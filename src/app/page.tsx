"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="p-8 w-full max-w-7xl">
      <h1 className="text-4xl font-bold mb-6">Razorstack Trading</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link href="/research" className="group w-full p-6 border border-white/10 rounded-xl hover:border-violet-500 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h3 className="font-semibold">Research</h3>
              <p className="text-zinc-400 text-sm">AI-powered market research and analysis</p>
            </div>
          </div>
        </Link>

        <Link href="/quant" className="group w-full p-6 border border-white/10 rounded-xl hover:border-blue-500 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <div>
              <h3 className="font-semibold">Quant</h3>
              <p className="text-zinc-400 text-sm">Quantitative signals and strategies</p>
            </div>
          </div>
        </Link>

        <Link href="/alpaca-test" className="group w-full p-6 border border-white/10 rounded-xl hover:border-emerald-500 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🪜</span>
            <div>
              <h3 className="font-semibold">Alpaca</h3>
              <p className="text-zinc-400 text-sm">Alpaca API integration and testing</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
