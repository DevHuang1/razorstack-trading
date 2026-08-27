import { leaderboard } from "@/lib/quant/paper";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ entries: leaderboard() });
}
