export const SESSION_COOKIE = "razorstack_session";

const SESSION_ROLE = "judge";
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

export async function createSessionToken(secret: string): Promise<string> {
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not configured");
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmacHex(secret, `${SESSION_ROLE}.${exp}`);
  return `${SESSION_ROLE}.${exp}.${sig}`;
}

export async function verifySessionToken(secret: string, token?: string | null): Promise<boolean> {
  if (!secret || !token) return false;
  const [role, expStr, sig] = token.split(".");
  if (role !== SESSION_ROLE || !expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isSafeInteger(exp) || exp <= 0) return false;
  const expected = await hmacHex(secret, `${role}.${expStr}`);
  if (!timingSafeEqual(expected, sig)) return false;
  return exp > Math.floor(Date.now() / 1000);
}