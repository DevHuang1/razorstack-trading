import { NextResponse } from "next/server";
import { ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of [SESSION_COOKIE, ROLE_COOKIE]) {
    res.cookies.set({
      name,
      value: "",
      httpOnly: name === SESSION_COOKIE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}