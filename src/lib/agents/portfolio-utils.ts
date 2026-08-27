import type { PortfolioContext } from "@/lib/contracts/research";

export function positionIn(
  context: PortfolioContext | undefined,
  symbol: string,
): PortfolioContext["positions"][number] | undefined {
  return context?.positions.find((p) => p.symbol === symbol);
}

export function sectorForSymbol(
  symbol: string,
  marketSector: string | undefined,
  context: PortfolioContext | undefined,
): string | undefined {
  return marketSector ?? positionIn(context, symbol)?.sector;
}

export function exposurePctForSector(
  context: PortfolioContext | undefined,
  sector: string | undefined,
): number | undefined {
  if (!context || !sector) return undefined;
  return context.sectorExposure.find((e) => e.sector === sector)?.exposurePctOfBook;
}
