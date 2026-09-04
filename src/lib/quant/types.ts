export type Direction = "BUY" | "SELL" | "HOLD";

export type DataSource = "ALPACA" | "ANCHORED" | "SYNTHETIC" | "EXTERNAL";

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

export interface DataQuality {
  symbol: string;
  timeframe: string;
  barCount: number;
  firstBarAt: string | null;
  lastBarAt: string | null;
  expectedIntervalSeconds: number | null;
  duplicateBarCount: number;
  missingBarCount: number;
  maxGapBars: number;
  stale: boolean;
  isActionable: boolean;
  warnings: string[];
}

export interface TailRiskMetrics {
  tailIndex: number | null;
  tailThreshold: number | null;
  gaussianVaR: number | null;
  nonGaussianVaR: number | null;
  fatTail: boolean;
}

export interface RiskMetrics {
  realizedVolAnnualized: number;
  realizedVolPercentile: number;
  atrPct: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  sharpeAnnualized: number | null;
  avgDailyVolume: number;
  tail: TailRiskMetrics;
}

export interface RiskChecks {
  riskBudgetPct: number | null;
  stopDistancePct: number | null;
  modelVersion: string;
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
    confidence: number;
    strength: number;
  };
  strategies: StrategyVote[];
  riskMetrics: RiskMetrics;
  riskChecks: RiskChecks;
  dataQuality?: DataQuality;
}

export interface SignalResponse {
  generatedAt: string;
  source: DataSource;
  regime: MarketRegime;
  signals: QuantSignal[];
}
