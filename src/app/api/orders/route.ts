import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ?? "50";
  const status = searchParams.get("status") ?? "";
  const qs = status ? `?limit=${limit}&status=${status}` : `?limit=${limit}`;
  try {
    const res = await fetch(`${BACKEND}/orders${qs}`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "Backend error" }, { status: res.status });
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 503 });
  }
}
