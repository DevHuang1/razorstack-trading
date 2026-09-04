import { NextResponse } from "next/server";
import {
  createSessionToken,
  isRole,
  type Role,
  ROLE_COOKIE,
  SESSION_COOKIE,
} from "@/lib/auth";

export async function POST(req: Request) {
  let body: { passphrase?: unknown; role?: unknown };
  try {
    body = (await req.json()) as { passphrase?: unknown; role?: unknown };
  } catch {
    body = {};
  }

  const role: Role = isRole(body.role) ? body.role : "judge";
  // Dev accounts use DEV_PASSPHRASE; judges use PASSPHRASE.
  const passphrase =
    role === "dev" ? process.env.DEV_PASSPHRASE : process.env.PASSPHRASE;
  if (!passphrase) {
    return NextResponse.json({ ok: false, error: "Login not configured" }, { status: 503 });
  }

  const submitted = typeof body.passphrase === "string" ? body.passphrase : "";
  if (submitted.length !== passphrase.length) {
    return NextResponse.json({ ok: false, error: "Invalid passphrase" }, { status: 401 });
  }

  let diff = 0;
  for (let i = 0; i < passphrase.length; i++) diff |= submitted.charCodeAt(i) ^ passphrase.charCodeAt(i);
  if (diff !== 0) {
    return NextResponse.json({ ok: false, error: "Invalid passphrase" }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken(process.env.AUTH_SESSION_SECRET ?? "", role);
  } catch {
    return NextResponse.json({ ok: false, error: "Login not configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  // Readable mirror so client-side code (e.g. the agent-status WebSocket) can
  // pick the right account stream without exposing the signed session token.
  res.cookies.set({
    name: ROLE_COOKIE,
    value: role,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}