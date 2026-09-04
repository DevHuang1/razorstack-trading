import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const passphrase = process.env.PASSPHRASE;
  if (!passphrase) {
    return NextResponse.json({ ok: false, error: "Login not configured" }, { status: 503 });
  }

  let body: { passphrase?: unknown };
  try {
    body = (await req.json()) as { passphrase?: unknown };
  } catch {
    body = {};
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
    token = await createSessionToken(process.env.AUTH_SESSION_SECRET ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Login not configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}