export interface ExecutionCostConfig {
  baseSlippageBps: number;
  marketImpactBpsPer1pctAdv: number;
  maxMarketImpactBps: number;
  commissionPerShare: number;
  fixedFee: number;
}

export const DEFAULT_EXECUTION_COST_CONFIG: ExecutionCostConfig = {
  baseSlippageBps: 5.0,
  marketImpactBpsPer1pctAdv: 2.0,
  maxMarketImpactBps: 50.0,
  commissionPerShare: 0.0,
  fixedFee: 0.0,
};

export interface ExecutionCostEstimate {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  referencePrice: number;
  grossNotional: number;
  participationRatePct: number | null;
  baseSlippageBps: number;
  marketImpactBps: number;
  effectiveSlippageBps: number;
  estimatedSlippage: number;
  commission: number;
  fixedFee: number;
  totalCost: number;
  costAsFractionOfNotional: number;
}

export interface ExecutionCostInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  referencePrice: number;
  averageDailyVolume?: number | null;
  config?: Partial<ExecutionCostConfig>;
}

export function estimateExecutionCost(
  input: ExecutionCostInput,
): ExecutionCostEstimate {
  const config: ExecutionCostConfig = {
    ...DEFAULT_EXECUTION_COST_CONFIG,
    ...(input.config ?? {}),
  };
  const grossNotional = input.referencePrice * input.quantity;

  let participationRatePct: number | null = null;
  let marketImpactBps = 0;
  if (input.averageDailyVolume && input.averageDailyVolume > 0) {
    participationRatePct = (input.quantity / input.averageDailyVolume) * 100;
    marketImpactBps = Math.min(
      config.maxMarketImpactBps,
      participationRatePct * config.marketImpactBpsPer1pctAdv,
    );
  }

  const effectiveSlippageBps = config.baseSlippageBps + marketImpactBps;
  const estimatedSlippage = (grossNotional * effectiveSlippageBps) / 10_000;
  const commission = input.quantity * config.commissionPerShare;
  const fixedFee = config.fixedFee;
  const totalCost = estimatedSlippage + commission + fixedFee;

  return {
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    referencePrice: round(input.referencePrice, 6),
    grossNotional: round(grossNotional, 2),
    participationRatePct:
      participationRatePct === null ? null : round(participationRatePct, 4),
    baseSlippageBps: round(config.baseSlippageBps, 4),
    marketImpactBps: round(marketImpactBps, 4),
    effectiveSlippageBps: round(effectiveSlippageBps, 4),
    estimatedSlippage: round(estimatedSlippage, 2),
    commission: round(commission, 2),
    fixedFee: round(fixedFee, 2),
    totalCost: round(totalCost, 2),
    costAsFractionOfNotional:
      grossNotional > 0 ? round(totalCost / grossNotional, 6) : 0,
  };
}

function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
