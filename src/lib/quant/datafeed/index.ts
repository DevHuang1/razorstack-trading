import type { DataSource } from "../types";
import { fetchAlpacaBars } from "./alpaca";
import { syntheticBars } from "./synthetic";

export interface BarsResult {
  bars: import("../types").Bar[];
  source: DataSource;
}

export async function getBars(
  symbol: string,
  timeframe = "1Day",
  limit = 300,
): Promise<BarsResult> {
  const alpacaBars = await fetchAlpacaBars(symbol, timeframe, limit);
  if (alpacaBars && alpacaBars.length >= 60) {
    return { bars: alpacaBars, source: "ALPACA" };
  }
  return { bars: syntheticBars(symbol, limit), source: "SYNTHETIC" };
}
