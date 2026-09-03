import type { NextRequest } from "next/server";
import { resolveOutcome } from "@/lib/quant/paper-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { id?: string; exitPrice?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id?.trim() ?? "";
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  const exitPrice = Number(body.exitPrice);
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    return Response.json({ error: "exitPrice must be a positive number" }, { status: 400 });
  }

  const record = await resolveOutcome(id, exitPrice);
  if (!record) {
    return Response.json({ error: "No paper record found with that id" }, { status: 404 });
  }
  return Response.json({ record });
}
