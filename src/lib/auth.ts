export const SESSION_COOKIE = "razorstack_session";
// Readable (non-httpOnly) mirror of the session role for client components.
export const ROLE_COOKIE = "razorstack_role";

export const ROLES = ["dev", "judge"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function enc(data: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(data) as Uint8Array<ArrayBuffer>;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, role: Role): Promise<string> {
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not configured");
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmacHex(secret, `${role}.${exp}`);
  return `${role}.${exp}.${sig}`;
}

export async function verifySessionToken(
  secret: string,
  token?: string | null,
): Promise<Role | null> {
  if (!secret || !token) return null;
  const [role, expStr, sig] = token.split(".");
  if (!isRole(role) || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isSafeInteger(exp) || exp <= 0) return null;
  const expected = await hmacHex(secret, `${role}.${expStr}`);
  if (!timingSafeEqual(expected, sig)) return null;
  return exp > Math.floor(Date.now() / 1000) ? role : null;
}

export function roleFromToken(token?: string | null): Role {
  if (!token) return "dev";
  return isRole(token.split(".")[0]) ? (token.split(".")[0] as Role) : "dev";
}

export function cookieValue(cookies: string, name: string): string | null {
  const match = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function accountRoleFromRequest(request: Request): Role {
  const cookies = request.headers.get("cookie") ?? "";
  return roleFromToken(cookieValue(cookies, SESSION_COOKIE));
}