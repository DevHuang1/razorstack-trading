const workspaces = [
  {
    href: "/research",
    eyebrow: "01 / Intelligence",
    title: "Research Desk",
    description: "Meet the specialist agents, watch their mascots work, and follow the CIO synthesis as it forms.",
    accent: "border-violet-400/30 bg-violet-400/[.08]",
  },
  {
    href: "/quant",
    eyebrow: "02 / Measurement",
    title: "Quant Desk",
    description: "Inspect weighted signals, strategy votes, market regime, and current risk metrics.",
    accent: "border-emerald-400/30 bg-emerald-400/[.08]",
  },
  {
    href: "/alpaca-test",
    eyebrow: "03 / Connectivity",
    title: "Data Diagnostics",
    description: "Verify the market-data connection and inspect the upstream response before a live demo.",
    accent: "border-sky-400/30 bg-sky-400/[.08]",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080b13] px-5 py-10 text-zinc-100 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl border-b border-white/10 pb-10">
          <p className="text-[11px] font-semibold tracking-[.24em] text-violet-300/80 uppercase">Razorstack / AI trading desk</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-.05em] sm:text-7xl">Evidence before action.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
            A transparent workspace where research agents explain their view, quant measures the signal, and the backend risk gate remains the final control point.
          </p>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {workspaces.map((workspace) => (
            <a key={workspace.href} href={workspace.href} className={`group rounded-2xl border p-5 transition hover:-translate-y-1 hover:border-white/25 ${workspace.accent}`}>
              <p className="text-[10px] font-semibold tracking-[.18em] text-zinc-500 uppercase">{workspace.eyebrow}</p>
              <h2 className="mt-10 text-2xl font-semibold tracking-tight group-hover:text-white">{workspace.title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{workspace.description}</p>
              <p className="mt-7 text-sm font-semibold text-zinc-200">Open workspace <span aria-hidden="true">→</span></p>
            </a>
          ))}
        </section>

        <footer className="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600">
          <span>Mock broker safe by default</span>
          <span>Research stream: NDJSON</span>
          <span>Execution: risk-gated FastAPI</span>
        </footer>
      </div>
    </main>
  );
}
