import type { NextRequest } from "next/server";
import { priceAmericanPut } from "@/lib/quant/americanPricing";

interface AmericanPutBody {
  spot: number;
  strike: number;
  riskFree?: number;
  sigma: number;
  maturity: number;
  american?: boolean;
  gridSteps?: number;
  timeSteps?: number;
}

export async function POST(request: NextRequest) {
  let body: AmericanPutBody;
  try {
    body = (await request.json()) as AmericanPutBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !Number.isFinite(body.spot) ||
    body.spot <= 0 ||
    !Number.isFinite(body.strike) ||
    body.strike <= 0 ||
    !Number.isFinite(body.sigma) ||
    body.sigma <= 0 ||
    body.sigma > 2 ||
    !Number.isFinite(body.maturity) ||
    body.maturity <= 0
  ) {
    return Response.json(
      { error: "spot, strike > 0, 0 < sigma <= 2, maturity > 0 are required" },
      { status: 400 },
    );
  }

  const result = priceAmericanPut({
    spot: body.spot,
    strike: body.strike,
    riskFree: body.riskFree ?? 0.05,
    sigma: body.sigma,
    maturity: body.maturity,
    american: body.american ?? true,
    gridSteps: body.gridSteps,
    timeSteps: body.timeSteps,
  });

  return Response.json(result);
}
