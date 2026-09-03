import { leaderboard } from "@/lib/quant/paper-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await leaderboard();
  return Response.json({ entries });
}
