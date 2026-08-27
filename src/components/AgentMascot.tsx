import type { AgentRole } from "@/lib/contracts/research";
import { getAgentProfile } from "@/lib/agents/profiles";

export type MascotState = "idle" | "thinking" | "speaking" | "success" | "error";

interface AgentMascotProps {
  role: AgentRole;
  size?: "sm" | "md" | "lg";
  state?: MascotState;
  showLabel?: boolean;
}

const SIZES = {
  sm: { shell: "mascot-shell-sm", title: "text-xs" },
  md: { shell: "mascot-shell-md", title: "text-sm" },
  lg: { shell: "mascot-shell-lg", title: "text-base" },
} as const;

const STATE_LABELS: Record<MascotState, string> = {
  idle: "standby",
  thinking: "thinking",
  speaking: "responding",
  success: "complete",
  error: "error",
};

export function AgentMascot({
  role,
  size = "md",
  state = "idle",
  showLabel = false,
}: AgentMascotProps) {
  const profile = getAgentProfile(role);
  const sizing = SIZES[size];

  return (
    <div className="flex items-center gap-3">
      <div
        className={`mascot-shell ${sizing.shell} mascot-state-${state}`}
        style={{
          "--mascot-accent": profile.accent,
          "--mascot-soft": profile.softAccent,
        } as React.CSSProperties}
        data-mascot-state={state}
        aria-label={`${profile.name}, ${profile.title}`}
        title={`${profile.name} · ${profile.title} · ${STATE_LABELS[state]}`}
      >
        <span className="mascot-grid" aria-hidden="true" />
        <span className="mascot-orbit mascot-orbit-one" aria-hidden="true" />
        <span className="mascot-orbit mascot-orbit-two" aria-hidden="true" />
        <span className="mascot-scanline" aria-hidden="true" />
        {state === "success" && <span className="mascot-success-ring" aria-hidden="true" />}
        {state === "error" && <span className="mascot-error-ring" aria-hidden="true">!</span>}
        <svg
          viewBox="0 0 72 72"
          className="mascot-bot"
          fill="none"
          stroke="var(--mascot-accent)"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-hidden="true"
        >
          <path className="mascot-antenna" d="M36 15V9m0 0 4-4m-4 4-4-4" />
          <circle className="mascot-antenna-dot" cx="36" cy="8" r="2.5" fill="var(--mascot-accent)" stroke="none" />
          <path className="mascot-ear mascot-ear-left" d="M16 29h-5v14h5" fill="var(--mascot-soft)" />
          <path className="mascot-ear mascot-ear-right" d="M56 29h5v14h-5" fill="var(--mascot-soft)" />
          <rect x="16" y="19" width="40" height="35" rx="13" fill="var(--mascot-soft)" />
          <path className="mascot-visor" d="M21 31c7-5 23-5 30 0v9c-7 5-23 5-30 0v-9Z" fill="#070b14" />
          <circle className="mascot-eye mascot-eye-left" cx="29" cy="35" r="3" fill="var(--mascot-accent)" stroke="none" />
          <circle className="mascot-eye mascot-eye-right" cx="43" cy="35" r="3" fill="var(--mascot-accent)" stroke="none" />
          {state === "speaking" ? (
            <path className="mascot-mouth mascot-mouth-speaking" d="M29 47h14" />
          ) : (
            <path className="mascot-mouth" d="M30 47c4 2 8 2 12 0" />
          )}
          <path className="mascot-chin" d="M29 54v4m14-4v4M32 58h8" />
          {profile.mascot === "owl" && <path className="mascot-signal-mark" d="m31 24 5-4 5 4" />}
          {profile.mascot === "hawk" && <path className="mascot-signal-mark" d="m30 25 6-5 6 5" />}
          {profile.mascot === "bull" && <path className="mascot-signal-mark" d="m28 24-4-4m20 4 4-4" />}
          {profile.mascot === "bear" && <path className="mascot-signal-mark" d="M31 23h10" />}
          {profile.mascot === "compass" && <circle className="mascot-signal-mark" cx="36" cy="23" r="3" />}
        </svg>
        {state === "thinking" && (
          <span className="mascot-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
        )}
        {state === "speaking" && (
          <span className="mascot-signal-bars" aria-hidden="true"><i /><i /><i /><i /></span>
        )}
      </div>
      {showLabel && (
        <div className="min-w-0">
          <p className={`${sizing.title} truncate font-semibold text-zinc-100`}>{profile.name}</p>
          <p className="truncate text-xs text-zinc-500">{profile.title}</p>
        </div>
      )}
    </div>
  );
}
