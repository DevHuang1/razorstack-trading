export type Direction = "BUY" | "SELL" | "HOLD";

export type DataSource = "ALPACA" | "SYNTHETIC" | "EXTERNAL";

export interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ComponentScore {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export type StrategyId =
  | "MOMENTUM"
  | "MEAN_REVERSION"
  | "TREND"
  | "NEWS"
  | "VALUE"
  | "OPTIONS";

export interface StrategyVote {
  id: StrategyId;
  name: string;
  direction: Direction;
  strength: number;
  rationale: string;
}

export type TrendRegime = "BULL_TREND" | "BEAR_TREND" | "RANGE";
export type VolRegime = "QUIET" | "NORMAL" | "VOLATILE" | "CRISIS";

export interface MarketRegime {
  label: string;
  trend: TrendRegime;
  volatility: VolRegime;
  benchmark: string;
  benchmarkTrendScore: number;
  benchmarkVolPercentile: number;
  benchmarkRealizedVolAnnualized: number;
  riskMultiplier: number;
  crisis: boolean;
}

export interface RiskMetrics {
  realizedVolAnnualized: number;
  realizedVolPercentile: number;
  atrPct: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  sharpe20d: number | null;
  avgDailyVolume: number;
}

export interface QuantSignal {
  symbol: string;
  timeframe: string;
  generatedAt: string;
  source: DataSource;
  price: number;
  changePct: { d1: number; d5: number; d21: number };
  components: ComponentScore[];
  overall: {
    direction: Direction;
    score: number;
    strength: number;
  };
  strategies: StrategyVote[];
  riskMetrics: RiskMetrics;
}

export interface SignalResponse {
  generatedAt: string;
  source: DataSource;
  regime: MarketRegime;
  signals: QuantSignal[];
}
