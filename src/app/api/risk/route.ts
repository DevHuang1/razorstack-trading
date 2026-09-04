import { NextResponse } from "next/server";
import { accountRoleFromRequest } from "@/lib/auth";

const BACKEND = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(req: Request) {
  const role = accountRoleFromRequest(req);
  try {
    const res = await fetch(`${BACKEND}/risk/status`, {
      cache: "no-store",
      headers: { "X-Account-Role": role },
    });
    if (!res.ok) return NextResponse.json({ error: "Backend error" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 503 });
  }
}
