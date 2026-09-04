import React from "react";
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
  sm: { px: 32, title: "text-xs" },
  md: { px: 48, title: "text-sm" },
  lg: { px: 64, title: "text-base" },
} as const;

const STATE_LABELS: Record<MascotState, string> = {
  idle: "standby",
  thinking: "thinking",
  speaking: "responding",
  success: "complete",
  error: "error",
};

/** Lighten a hex color toward white by `amount` (0–1). */
function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r + (255 - r) * amount)},${Math.round(g + (255 - g) * amount)},${Math.round(b + (255 - b) * amount)})`;
}

/** Minimal geometric glyph for each mascot type (24×24 viewBox). */
const GLYPHS: Record<string, React.ReactNode> = {
  owl: (
    // Two luminous eyes — wisdom / observation
    <>
      <circle cx="8.5" cy="12" r="3" fill="currentColor" opacity="0.95" />
      <circle cx="15.5" cy="12" r="3" fill="currentColor" opacity="0.95" />
      <circle cx="8.5" cy="12" r="1.1" fill="black" opacity="0.55" />
      <circle cx="15.5" cy="12" r="1.1" fill="black" opacity="0.55" />
    </>
  ),
  hawk: (
    // Sharp upward chevron — precision / momentum
    <path
      d="M4 17L12 5l8 12"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity="0.95"
    />
  ),
  bull: (
    // Horns + central dot — strength / upside
    <>
      <path d="M7 9C5 7 3 9 4.5 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.95" />
      <path d="M17 9C19 7 21 9 19.5 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.95" />
      <circle cx="12" cy="15" r="2.5" fill="currentColor" opacity="0.9" />
    </>
  ),
  bear: (
    // Three rounded dots (paw) — risk / challenge
    <>
      <circle cx="12" cy="14.5" r="3.2" fill="currentColor" opacity="0.9" />
      <circle cx="7.5" cy="9.5" r="2" fill="currentColor" opacity="0.75" />
      <circle cx="16.5" cy="9.5" r="2" fill="currentColor" opacity="0.75" />
    </>
  ),
  compass: (
    // Four-point star — direction / synthesis
    <path
      d="M12 3L13.8 10.2L21 12L13.8 13.8L12 21L10.2 13.8L3 12L10.2 10.2Z"
      fill="currentColor"
      opacity="0.95"
    />
  ),
};

const BLOB_CSS = `
@keyframes azm-blob-idle {
  0%,100% { border-radius: 60% 40% 55% 45% / 50% 60% 40% 50%; }
  33%      { border-radius: 40% 60% 45% 55% / 60% 40% 55% 45%; }
  66%      { border-radius: 55% 45% 60% 40% / 40% 55% 50% 60%; }
}
@keyframes azm-blob-thinking {
  0%   { border-radius: 50% 50% 40% 60% / 60% 40% 55% 45%; }
  20%  { border-radius: 65% 35% 50% 50% / 50% 60% 40% 60%; }
  40%  { border-radius: 40% 60% 60% 40% / 45% 55% 60% 40%; }
  60%  { border-radius: 55% 45% 35% 65% / 60% 40% 50% 50%; }
  80%  { border-radius: 45% 55% 55% 45% / 40% 60% 45% 55%; }
  100% { border-radius: 50% 50% 40% 60% / 60% 40% 55% 45%; }
}
@keyframes azm-blob-speaking {
  0%,100% { border-radius: 52% 48% 54% 46% / 50% 52% 48% 50%; transform: scale(1); }
  25%      { border-radius: 48% 52% 50% 50% / 54% 46% 52% 48%; transform: scale(1.05); }
  50%      { border-radius: 55% 45% 48% 52% / 48% 55% 46% 54%; transform: scale(0.97); }
  75%      { border-radius: 46% 54% 53% 47% / 52% 48% 55% 45%; transform: scale(1.03); }
}
@keyframes azm-blob-success {
  0%   { border-radius: 50% 50% 50% 50%; transform: scale(1); }
  30%  { border-radius: 60% 40% 60% 40% / 40% 60% 40% 60%; transform: scale(1.18); }
  65%  { border-radius: 55% 45% 55% 45%; transform: scale(1.08); }
  100% { border-radius: 52% 48% 52% 48%; transform: scale(1); }
}
@keyframes azm-blob-error {
  0%,100% { border-radius: 45% 55% 50% 50% / 50% 45% 55% 50%; transform: scale(1) rotate(0deg); }
  25%      { border-radius: 38% 62% 44% 56% / 56% 38% 62% 44%; transform: scale(0.94) rotate(-2deg); }
  50%      { border-radius: 55% 45% 38% 62% / 44% 56% 38% 62%; transform: scale(1.03) rotate(1deg); }
  75%      { border-radius: 50% 50% 55% 45% / 38% 62% 50% 50%; transform: scale(0.96) rotate(-1deg); }
}
@keyframes azm-glow-idle {
  0%,100% { opacity: 0.28; transform: scale(1); }
  50%      { opacity: 0.5;  transform: scale(1.14); }
}
@keyframes azm-glow-thinking {
  0%,100% { opacity: 0.45; transform: scale(1.05); }
  50%      { opacity: 0.8;  transform: scale(1.28); }
}
@keyframes azm-glow-speaking {
  0%,100% { opacity: 0.5; transform: scale(1.1); }
  50%      { opacity: 0.9; transform: scale(1.35); }
}
@keyframes azm-glow-success {
  0%   { opacity: 0.3; transform: scale(1); }
  35%  { opacity: 1;   transform: scale(1.55); }
  100% { opacity: 0.5; transform: scale(1.2); }
}
@keyframes azm-glow-error {
  0%,100% { opacity: 0.35; transform: scale(1); }
  50%      { opacity: 0.65; transform: scale(1.1); }
}
@keyframes azm-shimmer {
  0%,100% { opacity: 0.14; transform: translate(-30%,-30%) rotate(0deg); }
  50%      { opacity: 0.28; transform: translate(-18%,-18%) rotate(180deg); }
}
@keyframes azm-dot-pulse {
  0%,80%,100% { opacity: 0.2; transform: scale(0.75); }
  40%         { opacity: 1;   transform: scale(1); }
}
@keyframes azm-bar-pulse {
  0%,80%,100% { opacity: 0.25; transform: scaleY(0.5); }
  40%         { opacity: 1;    transform: scaleY(1); }
}
@keyframes azm-success-ring {
  0%   { opacity: 0.9; transform: scale(1); }
  100% { opacity: 0;   transform: scale(1.8); }
}
`;

const BLOB_ANIM: Record<MascotState, string> = {
  idle:     "azm-blob-idle 6s ease-in-out infinite",
  thinking: "azm-blob-thinking 1.5s ease-in-out infinite",
  speaking: "azm-blob-speaking 0.85s ease-in-out infinite",
  success:  "azm-blob-success 2s ease-in-out 1 forwards",
  error:    "azm-blob-error 0.38s ease-in-out infinite",
};

const GLOW_ANIM: Record<MascotState, string> = {
  idle:     "azm-glow-idle 6s ease-in-out infinite",
  thinking: "azm-glow-thinking 1.5s ease-in-out infinite",
  speaking: "azm-glow-speaking 0.85s ease-in-out infinite",
  success:  "azm-glow-success 2s ease-out 1 forwards",
  error:    "azm-glow-error 0.38s ease-in-out infinite",
};

export function AgentMascot({
  role,
  size = "md",
  state = "idle",
  showLabel = false,
}: AgentMascotProps) {
  const profile = getAgentProfile(role);
  const { px, title: titleCls } = SIZES[size];
  const glyph = GLYPHS[profile.mascot] ?? GLYPHS.compass;
  const glyphPx = Math.round(px * 0.44);
  const glowBlur = Math.round(px * 0.38);
  const lighter = lighten(profile.accent, 0.38);

  return (
    <>
      {/* Self-contained keyframes — injected once; harmless if duplicated */}
      <style dangerouslySetInnerHTML={{ __html: BLOB_CSS }} />

      <div
        className="flex items-center gap-3"
        aria-label={`${profile.name}, ${profile.title}, ${STATE_LABELS[state]}`}
        title={`${profile.name} · ${profile.title} · ${STATE_LABELS[state]}`}
      >
        {/* ── Orb wrapper ── */}
        <div style={{ width: px, height: px, position: "relative", flexShrink: 0 }}>

          {/* Ambient glow */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "-30%",
              borderRadius: "50%",
              background: profile.accent,
              filter: `blur(${glowBlur}px)`,
              animation: GLOW_ANIM[state],
              pointerEvents: "none",
            }}
          />

          {/* Blob body */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(circle at 36% 36%, ${lighter}, ${profile.accent})`,
              animation: BLOB_ANIM[state],
              overflow: "hidden",
            }}
          >
            {/* Inner shimmer highlight */}
            <div
              style={{
                position: "absolute",
                width: "65%",
                height: "65%",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.22)",
                animation: "azm-shimmer 9s ease-in-out infinite",
                top: 0,
                left: 0,
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Role glyph */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={glyphPx}
              height={glyphPx}
              style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))", mixBlendMode: "overlay" }}
            >
              {glyph}
            </svg>
          </div>

          {/* Success ring flash */}
          {state === "success" && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: "50%",
                border: `2px solid ${profile.accent}`,
                animation: "azm-success-ring 1.4s ease-out 1 forwards",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Error badge */}
          {state === "error" && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: -5,
                right: -5,
                width: Math.max(12, Math.round(px * 0.28)),
                height: Math.max(12, Math.round(px * 0.28)),
                borderRadius: "50%",
                background: "#ef4444",
                border: "1.5px solid #1a1a1a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: Math.max(8, Math.round(px * 0.16)),
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1,
              }}
            >
              !
            </div>
          )}

          {/* Thinking dots */}
          {state === "thinking" && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: -18,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 4,
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: profile.accent,
                    display: "block",
                    animation: `azm-dot-pulse 1.2s ease-in-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Speaking bars */}
          {state === "speaking" && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: -18,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 3,
                alignItems: "flex-end",
              }}
            >
              {[4, 7, 5, 8, 4].map((h, i) => (
                <span
                  key={i}
                  style={{
                    width: 3,
                    height: h,
                    borderRadius: 2,
                    background: profile.accent,
                    display: "block",
                    transformOrigin: "bottom",
                    animation: `azm-bar-pulse 0.85s ease-in-out infinite`,
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Label */}
        {showLabel && (
          <div className="min-w-0">
            <p className={`${titleCls} truncate font-semibold text-zinc-100`}>{profile.name}</p>
            <p className="truncate text-xs text-zinc-500">{profile.title}</p>
          </div>
        )}
      </div>
    </>
  );
}
